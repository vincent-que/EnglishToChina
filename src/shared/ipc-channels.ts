import { ipcMain, ipcRenderer, BrowserWindow } from 'electron';
import type { AppSettings, TranslationProgress, TranslationTask, TermTable, LicenseInfo } from './types';

export interface IpcInvokeMap {
  'translation:start': (args: { filePath: string; style: string; termTables: string[]; outputFormat: string }) => { taskId: string };
  'translation:cancel': (args: { taskId: string }) => void;
  'file:select': () => { canceled: boolean; filePaths: string[] };
  'file:open': (args: { filePath: string }) => void;
  'file:openOutputDir': () => void;
  'settings:get': () => AppSettings;
  'settings:save': (settings: Partial<AppSettings>) => void;
  'settings:testConnection': (args: { engine: string; apiKey: string }) => { success: boolean; message: string };
  'license:activate': (args: { code: string }) => { success: boolean; message: string; license: LicenseInfo };
  'license:validate': () => LicenseInfo;
  'term:getList': () => TermTable[];
  'term:import': (args: { filePath: string }) => TermTable;
  'history:getList': () => TranslationTask[];
  'history:delete': (args: { taskId: string }) => TranslationTask[];
  'history:clear': () => TranslationTask[];
  'memory:getStats': () => Record<string, unknown>;
  'memory:clear': () => Record<string, unknown>;
  'app:checkUpdate': () => { hasUpdate: boolean; version?: string };
  'app:getDiagnostics': () => Record<string, unknown>;
}

export interface IpcSendMap {
  'translation:progress': TranslationProgress;
  'translation:complete': { taskId: string; outputPath: string };
  'translation:error': { taskId: string; code: string; message: string };
  'settings:save': Partial<AppSettings>;
}

export function sendToRenderer<K extends keyof IpcSendMap>(
  win: BrowserWindow,
  channel: K,
  data: IpcSendMap[K]
): void {
  win.webContents.send(channel, data);
}
