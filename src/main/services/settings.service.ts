import { app, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import type { AppSettings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/constants';

type StoredSettings = Partial<AppSettings> & {
  apiKeyEncrypted?: string;
};

export class SettingsService {
  private settingsPath: string;
  private settings: AppSettings;

  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    this.settings = this.loadSettings();
  }

  private loadSettings(): AppSettings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        const stored = JSON.parse(data) as StoredSettings;
        const settings = { ...DEFAULT_SETTINGS, ...stored };
        settings.apiKey = this.decryptApiKey(stored);

        if (stored.apiKey && safeStorage.isEncryptionAvailable()) {
          this.settings = settings;
          this.saveSettings({ apiKey: stored.apiKey });
        }

        return settings;
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
    return { ...DEFAULT_SETTINGS };
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  saveSettings(partial: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...partial };
    try {
      fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
      const stored = this.toStoredSettings(this.settings);
      fs.writeFileSync(this.settingsPath, JSON.stringify(stored, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  private toStoredSettings(settings: AppSettings): StoredSettings {
    const stored: StoredSettings = { ...settings };
    if (!settings.apiKey) {
      delete stored.apiKey;
      delete stored.apiKeyEncrypted;
      return stored;
    }

    if (safeStorage.isEncryptionAvailable()) {
      stored.apiKeyEncrypted = safeStorage.encryptString(settings.apiKey).toString('base64');
      delete stored.apiKey;
    }
    return stored;
  }

  private decryptApiKey(stored: StoredSettings): string {
    if (stored.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(stored.apiKeyEncrypted, 'base64'));
      } catch (err) {
        console.error('Failed to decrypt API key:', err);
        return '';
      }
    }
    return stored.apiKey || '';
  }
}
