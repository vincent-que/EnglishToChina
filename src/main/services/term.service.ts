import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { TermEntry, TermTable } from '../../shared/types';

export class TermService {
  private termPath: string;
  private tables: TermTable[];

  constructor() {
    this.termPath = path.join(app.getPath('userData'), 'term-tables.json');
    this.tables = this.loadTables();
  }

  getList(): TermTable[] {
    return this.tables.map((table) => ({
      ...table,
      entries: [...table.entries],
    }));
  }

  importFromFile(filePath: string): TermTable {
    if (!fs.existsSync(filePath)) {
      throw new Error('术语表文件不存在');
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const entries = this.parseEntries(raw, path.extname(filePath).toLowerCase());
    if (entries.length === 0) {
      throw new Error('术语表为空或格式不支持');
    }

    const table: TermTable = {
      id: `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: path.basename(filePath, path.extname(filePath)),
      entries,
    };

    this.tables = [table, ...this.tables.filter((item) => item.name !== table.name)];
    this.saveTables();
    return table;
  }

  resolveTables(idsOrTables: unknown): TermTable[] {
    if (!Array.isArray(idsOrTables)) return [];

    return idsOrTables
      .map((item) => {
        if (typeof item === 'string') {
          return this.tables.find((table) => table.id === item || table.name === item);
        }
        if (this.isTermTable(item)) return item;
        return undefined;
      })
      .filter((item): item is TermTable => Boolean(item));
  }

  private loadTables(): TermTable[] {
    try {
      if (fs.existsSync(this.termPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.termPath, 'utf-8')) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is TermTable => this.isTermTable(item));
        }
      }
    } catch (err) {
      console.error('Failed to load term tables:', err);
    }
    return [];
  }

  private saveTables(): void {
    fs.mkdirSync(path.dirname(this.termPath), { recursive: true });
    fs.writeFileSync(this.termPath, JSON.stringify(this.tables, null, 2), 'utf-8');
  }

  private parseEntries(raw: string, ext: string): TermEntry[] {
    if (ext === '.json') {
      return this.parseJsonEntries(raw);
    }

    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\t|,/).map((part) => part.trim());
        return { source: parts[0], target: parts[1] };
      })
      .filter((entry): entry is TermEntry => Boolean(entry.source && entry.target));
  }

  private parseJsonEntries(raw: string): TermEntry[] {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (Array.isArray(item)) return { source: String(item[0] || ''), target: String(item[1] || '') };
          if (item && typeof item === 'object') {
            const record = item as Record<string, unknown>;
            return {
              source: String(record.source || record.en || record.key || ''),
              target: String(record.target || record.zh || record.value || ''),
            };
          }
          return { source: '', target: '' };
        })
        .filter((entry): entry is TermEntry => Boolean(entry.source && entry.target));
    }

    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed as Record<string, unknown>)
        .map(([source, target]) => ({ source, target: String(target || '') }))
        .filter((entry): entry is TermEntry => Boolean(entry.source && entry.target));
    }

    return [];
  }

  private isTermTable(value: unknown): value is TermTable {
    if (!value || typeof value !== 'object') return false;
    const table = value as TermTable;
    return typeof table.id === 'string' && typeof table.name === 'string' && Array.isArray(table.entries);
  }
}
