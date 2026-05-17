import { app } from 'electron';
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
    if (!/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2,5}$/.test(normalized)) {
      return { success: false, message: '授权码格式不正确', license: this.validate() };
    }

    this.license = {
      ...DEFAULT_LICENSE,
      code: normalized,
      lastValidatedAt: new Date().toISOString(),
    };
    this.saveLicense();

    return {
      success: false,
      message: '授权服务器尚未配置，授权码已保存为待验证状态',
      license: this.validate(),
    };
  }

  validate(): LicenseInfo {
    return {
      status: this.license.status,
      plan: this.license.plan,
      activatedAt: this.license.activatedAt,
      expiresAt: this.license.expiresAt,
      features: [...this.license.features],
    };
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
}
