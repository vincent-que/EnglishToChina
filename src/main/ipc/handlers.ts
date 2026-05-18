import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import fs from 'fs';
import { PythonWorkerManager } from '../workers/python-worker';
import { FileService } from '../services/file.service';
import { TranslateService } from '../services/translate.service';
import { SettingsService } from '../services/settings.service';
import { TermService } from '../services/term.service';
import { LicenseService } from '../services/license.service';
import { MemoryService } from '../services/memory.service';
import { ProxyTranslationService } from '../services/proxy-translation.service';
import type { AppSettings } from '../../shared/types';

export function registerIpcHandlers(win: BrowserWindow, worker: PythonWorkerManager): void {
  const fileService = new FileService();
  const settingsService = new SettingsService();
  const termService = new TermService();
  const licenseService = new LicenseService();
  const memoryService = new MemoryService();
  const proxyTranslationService = new ProxyTranslationService();
  const translateService = new TranslateService(worker, win, memoryService, licenseService);

  ipcMain.handle('translation:start', async (_event, args) => {
    const filePath = args?.filePath;
    if (!filePath) {
      throw new Error('请选择要翻译的文件');
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    const taskId = translateService.startTask(filePath, {
      taskId: args.taskId ? String(args.taskId) : undefined,
      style: (args.style || 'business') as AppSettings['style'],
      termTables: termService.resolveTables(args.termTables || []),
      outputFormat: (args.outputFormat || 'docx') as AppSettings['outputFormat'],
    });
    return { taskId };
  });

  ipcMain.on('translation:cancel', (_event, args) => {
    translateService.cancelTask(args.taskId);
  });

  ipcMain.handle('file:select', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '文档文件', extensions: ['pdf', 'docx', 'doc'] },
      ],
    });
    return { canceled: result.canceled, filePaths: result.filePaths };
  });

  ipcMain.handle('file:open', async (_event, args) => {
    shell.openPath(args.filePath);
  });

  ipcMain.handle('file:openOutputDir', async () => {
    shell.openPath(fileService.getOutputDir());
  });

  ipcMain.handle('settings:get', () => {
    return settingsService.getSettings();
  });

  ipcMain.on('settings:save', (_event, settings) => {
    settingsService.saveSettings(settings);
  });

  ipcMain.handle('settings:testConnection', async (_event, args) => {
    const engine = String(args?.engine || 'kimi');
    const apiKey = String(args?.apiKey || '').trim();
    if (!apiKey) {
      return { success: false, message: '请先填写 API Key' };
    }
    try {
      return await worker.execute('test_connection', { engine, apiKey }, 60000);
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : '连接测试失败',
      };
    }
  });

  ipcMain.handle('license:activate', async (_event, args) => {
    return licenseService.activate(String(args?.code || ''));
  });

  ipcMain.handle('license:validate', async () => {
    return licenseService.validate();
  });

  ipcMain.handle('term:getList', () => {
    return termService.getList();
  });

  ipcMain.handle('term:import', async (_event, args) => {
    return termService.importFromFile(args.filePath);
  });

  ipcMain.handle('history:getList', () => {
    return translateService.getTaskHistory();
  });

  ipcMain.handle('history:delete', (_event, args) => {
    return translateService.removeTask(String(args?.taskId || ''));
  });

  ipcMain.handle('history:clear', () => {
    return translateService.clearHistory();
  });

  ipcMain.handle('memory:getStats', () => {
    return memoryService.getStats();
  });

  ipcMain.handle('memory:clear', () => {
    memoryService.clear();
    return memoryService.getStats();
  });

  ipcMain.handle('app:checkUpdate', async () => {
    return { hasUpdate: false };
  });

  ipcMain.handle('app:getDiagnostics', async () => {
    const runtime = worker.getRuntimeInfo();
    const license = licenseService.validate();
    const settings = settingsService.getSettings();
    const proxyHealth = await proxyTranslationService.checkHealth(settings.proxyServerUrl);
    const proxyLicense = settings.translationMode === 'proxy'
      ? await proxyTranslationService.validateLicense(settings.proxyServerUrl, license.code || '')
      : { ok: true, message: '本地备用模式无需服务端授权校验' };
    try {
      const python = await worker.execute('diagnostics', {}, 15000);
      return {
        ok: true,
        runtime,
        python,
        license,
        translationService: {
          mode: settings.translationMode,
          proxyServerConfigured: Boolean(settings.proxyServerUrl?.trim()),
          health: proxyHealth,
          license: proxyLicense,
        },
      };
    } catch (err) {
      return {
        ok: false,
        runtime,
        license,
        translationService: {
          mode: settings.translationMode,
          proxyServerConfigured: Boolean(settings.proxyServerUrl?.trim()),
          health: proxyHealth,
          license: proxyLicense,
        },
        error: err instanceof Error ? err.message : 'Python Worker 自检失败',
      };
    }
  });
}
