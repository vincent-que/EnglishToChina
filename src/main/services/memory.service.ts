import { app } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { DocumentModel } from '../../shared/types';

type TermEntryLike = {
  source?: string;
  target?: string;
};

type TermTableLike = {
  id?: string;
  name?: string;
  entries?: TermEntryLike[];
};

type CacheRecord = {
  source: string;
  target: string;
  engine: string;
  style: string;
  hitCount: number;
  updatedAt: number;
};

type MemoryStats = {
  cacheHits: number;
  cacheWrites: number;
  originalTerms: number;
  injectedTerms: number;
};

const MAX_CACHE_SOURCE_LENGTH = 300;
const MAX_CACHE_RECORDS = 5000;
const MAX_TERMS_PER_DOCUMENT = 120;

export class MemoryService {
  private memoryDir: string;
  private cachePath: string;
  private cache: Record<string, CacheRecord>;

  constructor() {
    this.memoryDir = path.join(app.getPath('userData'), 'memory');
    this.cachePath = path.join(this.memoryDir, 'translation-cache.json');
    this.cache = this.loadCache();
  }

  prepareDocument(args: {
    documentModel: DocumentModel;
    engine: string;
    style: string;
    termTables: unknown[];
  }): { documentModel: DocumentModel; termTables: unknown[]; stats: MemoryStats } {
    const stats: MemoryStats = {
      cacheHits: 0,
      cacheWrites: 0,
      originalTerms: this.countTerms(args.termTables),
      injectedTerms: 0,
    };
    const termTables = this.filterTermTables(args.termTables, this.collectDocumentText(args.documentModel));
    stats.injectedTerms = this.countTerms(termTables);
    const termSignature = this.termSignature(termTables);

    for (const item of this.iterTextItems(args.documentModel)) {
      if (item.text.length > MAX_CACHE_SOURCE_LENGTH) continue;
      const cached = this.getCachedTranslation({
        engine: args.engine,
        style: args.style,
        text: item.text,
        termSignature,
      });
      if (cached) {
        args.documentModel.translations[item.key] = cached;
        stats.cacheHits += 1;
      }
    }

    return { documentModel: args.documentModel, termTables, stats };
  }

  saveDocumentTranslations(args: {
    sourceDocument: DocumentModel;
    translatedDocument: DocumentModel;
    engine: string;
    style: string;
    termTables: unknown[];
  }): MemoryStats {
    const stats: MemoryStats = {
      cacheHits: 0,
      cacheWrites: 0,
      originalTerms: this.countTerms(args.termTables),
      injectedTerms: this.countTerms(args.termTables),
    };
    const termSignature = this.termSignature(args.termTables);
    for (const item of this.iterTextItems(args.sourceDocument)) {
      if (item.text.length > MAX_CACHE_SOURCE_LENGTH) continue;
      const translated = args.translatedDocument.translations?.[item.key];
      if (!translated || translated === item.text) continue;
      this.saveTranslation({
        engine: args.engine,
        style: args.style,
        source: item.text,
        target: translated,
        termSignature,
      });
      stats.cacheWrites += 1;
    }
    if (stats.cacheWrites > 0) this.saveCache();
    return stats;
  }

  clear(): void {
    this.cache = {};
    this.saveCache();
  }

  getStats(): { cacheRecords: number; cachePath: string } {
    return {
      cacheRecords: Object.keys(this.cache).length,
      cachePath: this.cachePath,
    };
  }

  private getCachedTranslation(args: {
    engine: string;
    style: string;
    text: string;
    termSignature: string;
  }): string | null {
    const key = this.cacheKey(args);
    const record = this.cache[key];
    if (!record) return null;
    record.hitCount += 1;
    record.updatedAt = Date.now();
    return record.target;
  }

  private saveTranslation(args: {
    engine: string;
    style: string;
    source: string;
    target: string;
    termSignature: string;
  }): void {
    const key = this.cacheKey({ ...args, text: args.source });
    this.cache[key] = {
      source: args.source,
      target: args.target,
      engine: args.engine,
      style: args.style,
      hitCount: this.cache[key]?.hitCount || 0,
      updatedAt: Date.now(),
    };
    this.pruneCache();
  }

  private filterTermTables(termTables: unknown[], documentText: string): unknown[] {
    const normalizedText = documentText.toLowerCase();
    const filtered: TermTableLike[] = [];
    let total = 0;

    for (const table of termTables as TermTableLike[]) {
      if (!table || !Array.isArray(table.entries)) continue;
      const entries = table.entries
        .filter((entry) => {
          const source = String(entry.source || '').trim();
          return source && normalizedText.includes(source.toLowerCase());
        })
        .slice(0, Math.max(0, MAX_TERMS_PER_DOCUMENT - total));
      if (entries.length > 0) {
        filtered.push({ ...table, entries });
        total += entries.length;
      }
      if (total >= MAX_TERMS_PER_DOCUMENT) break;
    }

    return filtered;
  }

  private *iterTextItems(doc: DocumentModel): Generator<{ key: string; text: string }> {
    for (const page of doc.pages || []) {
      for (const block of page.blocks || []) {
        const text = String(block.text || '').trim();
        if (text) yield { key: block.id, text };
      }
      for (const table of page.tables || []) {
        for (let rowIdx = 0; rowIdx < (table.cells || []).length; rowIdx += 1) {
          const row = table.cells[rowIdx] || [];
          for (let colIdx = 0; colIdx < row.length; colIdx += 1) {
            const text = String(row[colIdx]?.text || '').trim();
            if (text) yield { key: `${table.id}_r${rowIdx}_c${colIdx}`, text };
          }
        }
      }
    }
  }

  private collectDocumentText(doc: DocumentModel): string {
    return Array.from(this.iterTextItems(doc)).map((item) => item.text).join('\n');
  }

  private countTerms(termTables: unknown[]): number {
    return (termTables as TermTableLike[]).reduce((sum, table) => {
      return sum + (Array.isArray(table?.entries) ? table.entries.length : 0);
    }, 0);
  }

  private termSignature(termTables: unknown[]): string {
    const data = (termTables as TermTableLike[]).flatMap((table) => {
      return (table.entries || []).map((entry) => `${entry.source || ''}=>${entry.target || ''}`);
    });
    return crypto.createHash('sha256').update(data.sort().join('|')).digest('hex').slice(0, 12);
  }

  private cacheKey(args: { engine: string; style: string; text: string; termSignature: string }): string {
    return crypto
      .createHash('sha256')
      .update([args.engine, args.style, args.termSignature, args.text].join('\n'))
      .digest('hex');
  }

  private loadCache(): Record<string, CacheRecord> {
    try {
      if (!fs.existsSync(this.cachePath)) return {};
      return JSON.parse(fs.readFileSync(this.cachePath, 'utf-8')) as Record<string, CacheRecord>;
    } catch (err) {
      console.error('Failed to load memory cache:', err);
      return {};
    }
  }

  private saveCache(): void {
    try {
      fs.mkdirSync(this.memoryDir, { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save memory cache:', err);
    }
  }

  private pruneCache(): void {
    const entries = Object.entries(this.cache);
    if (entries.length <= MAX_CACHE_RECORDS) return;
    entries
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(MAX_CACHE_RECORDS)
      .forEach(([key]) => {
        delete this.cache[key];
      });
  }
}
