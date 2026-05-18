import { app } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { LicenseInfo } from '../../shared/types';

type StoredLicense = LicenseInfo & {
  code?: string;
  lastValidatedAt?: string;
};

const DEFAULT_LICENSE: LicenseInfo = {
  status: 'trial',
  plan: 'trial',
  features: ['basic'],
};

const MONTHLY_CODE_PATTERN = /^ETC-(\d{6})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{6})$/;

export class LicenseService {
  private licensePath: string;
  private license: StoredLicense;

  constructor() {
    this.licensePath = path.join(app.getPath('userData'), 'license.json');
    this.license = this.loadLicense();
  }

  activate(code: string): { success: boolean; message: string; license: LicenseInfo } {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      return { success: false, message: '请输入授权码', license: this.validate() };
    }

    const monthly = this.parseMonthlyCode(normalized);
    if (!monthly && !/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2,5}$/.test(normalized)) {
      return { success: false, message: '授权码格式不正确', license: this.validate() };
    }

    if (!monthly) {
      this.license = {
        ...DEFAULT_LICENSE,
        status: 'invalid',
        code: normalized,
        lastValidatedAt: new Date().toISOString(),
      };
      this.saveLicense();
      return {
        success: false,
        message: '请使用月度授权码，格式为 ETC-YYYYMM-XXXX-XXXX-XXXXXX',
        license: this.validate(),
      };
    }

    this.license = {
      status: monthly.expired ? 'expired' : 'active',
      plan: 'monthly',
      code: normalized,
      validFrom: monthly.validFrom,
      activatedAt: new Date().toISOString(),
      expiresAt: monthly.expiresAt,
      features: ['proxy-translation', 'docx', 'pdf'],
      lastValidatedAt: new Date().toISOString(),
    };
    this.saveLicense();

    return {
      success: !monthly.expired,
      message: monthly.expired ? '授权码已过期，请输入当月授权码' : '授权成功，本月有效',
      license: this.validate(),
    };
  }

  validate(): LicenseInfo {
    if (this.license.code) {
      const monthly = this.parseMonthlyCode(this.license.code);
      if (monthly) {
        this.license = {
          ...this.license,
          status: monthly.expired ? 'expired' : 'active',
          plan: 'monthly',
          validFrom: monthly.validFrom,
          expiresAt: monthly.expiresAt,
          features: ['proxy-translation', 'docx', 'pdf'],
        };
      }
    }

    const daysRemaining = this.license.expiresAt
      ? Math.max(0, Math.ceil((new Date(this.license.expiresAt).getTime() - Date.now()) / 86400000))
      : undefined;

    return {
      status: this.license.status,
      plan: this.license.plan,
      code: this.license.code,
      validFrom: this.license.validFrom,
      activatedAt: this.license.activatedAt,
      expiresAt: this.license.expiresAt,
      daysRemaining,
      features: [...this.license.features],
    };
  }

  getActiveLicenseCode(): string {
    const license = this.validate();
    return license.status === 'active' ? this.license.code || '' : '';
  }

  clear(): LicenseInfo {
    this.license = { ...DEFAULT_LICENSE };
    this.saveLicense();
    return this.validate();
  }

  private loadLicense(): StoredLicense {
    try {
      if (!fs.existsSync(this.licensePath)) return { ...DEFAULT_LICENSE };
      const data = JSON.parse(fs.readFileSync(this.licensePath, 'utf-8')) as StoredLicense;
      return { ...DEFAULT_LICENSE, ...data };
    } catch (err) {
      console.error('Failed to load license:', err);
      return { ...DEFAULT_LICENSE };
    }
  }

  private saveLicense(): void {
    try {
      fs.mkdirSync(path.dirname(this.licensePath), { recursive: true });
      fs.writeFileSync(this.licensePath, JSON.stringify(this.license, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save license:', err);
    }
  }

  private parseMonthlyCode(code: string): { validFrom: string; expiresAt: string; expired: boolean } | null {
    const match = MONTHLY_CODE_PATTERN.exec(code);
    if (!match) return null;

    const [, yyyymm, partA, partB, checksum] = match;
    const expected = this.createChecksum(yyyymm, `${partA}-${partB}`);
    if (checksum !== expected) return null;

    const year = Number(yyyymm.slice(0, 4));
    const month = Number(yyyymm.slice(4, 6));
    if (!year || month < 1 || month > 12) return null;

    const validFromDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const expiresAtDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    return {
      validFrom: validFromDate.toISOString(),
      expiresAt: expiresAtDate.toISOString(),
      expired: Date.now() >= expiresAtDate.getTime(),
    };
  }

  private createChecksum(yyyymm: string, payload: string): string {
    return crypto
      .createHash('sha256')
      .update(`english-to-china-monthly-license-v1|${yyyymm}|${payload}`)
      .digest('hex')
      .slice(0, 6)
      .toUpperCase();
  }
}
