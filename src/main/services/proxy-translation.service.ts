import type { AppSettings, DocumentModel, TermTable } from '../../shared/types';

interface ProxyTranslateRequest {
  licenseCode: string;
  text: string;
  style: AppSettings['style'];
  termTables: TermTable[];
  context?: string;
}

interface ProxyTranslateResponse {
  success?: boolean;
  translatedText?: string;
  text?: string;
  message?: string;
  error?: string;
  model?: string;
}

interface ProxyLicenseResponse {
  success?: boolean;
  message?: string;
  license?: {
    valid?: boolean;
    status?: string;
    expiresAt?: string;
  };
}

interface TranslateDocumentParams {
  documentModel: DocumentModel;
  settings: AppSettings;
  licenseCode: string;
  termTables: unknown[];
  onProgress?: (percent: number, message: string) => void;
}

export class ProxyTranslationService {
  async checkHealth(serverUrl: string): Promise<{ ok: boolean; message: string }> {
    const normalized = this.normalizeServerUrl(serverUrl);
    if (!normalized) return { ok: false, message: '翻译服务地址未配置' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(`${normalized}/api/health`, { signal: controller.signal });
      if (!response.ok) {
        return { ok: false, message: `翻译服务异常 (${response.status})` };
      }
      return { ok: true, message: '翻译服务连接正常' };
    } catch {
      return { ok: false, message: '无法连接翻译服务' };
    } finally {
      clearTimeout(timeout);
    }
  }

  async validateLicense(serverUrl: string, licenseCode: string): Promise<{ ok: boolean; message: string }> {
    const normalized = this.normalizeServerUrl(serverUrl);
    if (!normalized) return { ok: false, message: '翻译服务地址未配置' };
    if (!licenseCode) return { ok: false, message: '授权码无效或已过期' };

    let response: Response;
    try {
      response = await fetch(`${normalized}/api/license/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseCode }),
      });
    } catch {
      return { ok: false, message: '无法连接授权校验服务' };
    }

    let data: ProxyLicenseResponse = {};
    try {
      data = await response.json() as ProxyLicenseResponse;
    } catch {
      data = {};
    }

    if (!response.ok || data.success === false || data.license?.valid === false) {
      return { ok: false, message: data.message || `授权校验失败 (${response.status})` };
    }
    return { ok: true, message: '授权服务校验通过' };
  }

  async translateDocument({
    documentModel,
    settings,
    licenseCode,
    termTables,
    onProgress,
  }: TranslateDocumentParams): Promise<DocumentModel> {
    const serverUrl = this.normalizeServerUrl(settings.proxyServerUrl);
    if (!serverUrl) {
      throw new Error('翻译服务地址未配置，请联系管理员更新客户版配置');
    }
    if (!licenseCode) {
      throw new Error('授权码无效或已过期，请在账户信息页输入当月授权码');
    }

    const licenseValidation = await this.validateLicense(serverUrl, licenseCode);
    if (!licenseValidation.ok) {
      throw new Error(licenseValidation.message);
    }

    const items = this.collectTranslatableItems(documentModel);
    let translatedCount = 0;

    for (const item of items) {
      const translated = await this.translateText(serverUrl, {
        licenseCode,
        text: item.text,
        style: settings.style,
        termTables: this.normalizeTermTables(termTables),
      });
      documentModel.translations[item.key] = translated;
      translatedCount += 1;
      if (onProgress && items.length > 0) {
        onProgress(
          Math.round((translatedCount / items.length) * 100),
          `服务端翻译 (${translatedCount}/${items.length})`
        );
      }
    }

    return documentModel;
  }

  private async translateText(serverUrl: string, payload: ProxyTranslateRequest): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${serverUrl}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new Error('无法连接翻译服务，请检查网络或联系管理员');
    }

    let data: ProxyTranslateResponse = {};
    try {
      data = await response.json() as ProxyTranslateResponse;
    } catch {
      data = {};
    }

    if (!response.ok || data.success === false) {
      throw new Error(data.message || data.error || `翻译服务返回异常 (${response.status})`);
    }

    const translated = data.translatedText || data.text || '';
    if (!translated.trim()) {
      throw new Error('翻译服务返回为空');
    }
    return translated.trim();
  }

  private collectTranslatableItems(documentModel: DocumentModel): Array<{ key: string; text: string }> {
    const items: Array<{ key: string; text: string }> = [];
    const existing = documentModel.translations || {};
    documentModel.translations = existing;

    for (const page of documentModel.pages || []) {
      for (const block of page.blocks || []) {
        const text = block.text?.trim();
        if (text && !existing[block.id] && !this.shouldSkipText(text)) {
          items.push({ key: block.id, text });
        }
      }

      for (const table of page.tables || []) {
        table.cells?.forEach((row, rowIndex) => {
          row.forEach((cell, colIndex) => {
            const text = cell.text?.trim();
            const key = `${table.id}_r${rowIndex}_c${colIndex}`;
            if (text && !existing[key] && !this.shouldSkipText(text)) {
              items.push({ key, text });
            }
          });
        });
      }
    }

    return items;
  }

  private normalizeServerUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
  }

  private normalizeTermTables(termTables: unknown[]): TermTable[] {
    return termTables.filter((table): table is TermTable => {
      return Boolean(table && typeof table === 'object' && 'entries' in table);
    });
  }

  private shouldSkipText(text: string): boolean {
    if (!text.trim()) return true;
    if (/^[\s\d.,;:\-+*/=%$€¥()[\]<>≤≥≈°℃µμ]+$/.test(text)) return true;
    return text.length <= 3 && !/[a-z]/i.test(text);
  }
}
