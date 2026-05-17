import { contextBridge, ipcRenderer, webUtils } from 'electron';

export interface ElectronAPI {
  translation: {
    start: (args: { filePath: string; style: string; termTables: string[]; outputFormat: string }) => Promise<{ taskId: string }>;
    cancel: (taskId: string) => void;
    onProgress: (callback: (data: { percent: number; stage: string; message?: string }) => void) => () => void;
    onComplete: (callback: (data: { taskId: string; outputPath: string }) => void) => () => void;
    onError: (callback: (data: { taskId: string; code: string; message: string }) => void) => () => void;
  };
  file: {
    select: () => Promise<{ canceled: boolean; filePaths: string[] }>;
    open: (filePath: string) => void;
    openOutputDir: () => void;
    getPathForFile: (file: File) => string;
  };
  settings: {
    get: () => Promise<Record<string, unknown>>;
    save: (settings: Record<string, unknown>) => void;
    testConnection: (args: { engine: string; apiKey: string }) => Promise<{ success: boolean; message: string }>;
  };
  license: {
    activate: (code: string) => Promise<{ success: boolean; message: string; license?: Record<string, unknown> }>;
    validate: () => Promise<Record<string, unknown>>;
  };
  term: {
    getList: () => Promise<Record<string, unknown>[]>;
    import: (filePath: string) => Promise<Record<string, unknown>>;
  };
  history: {
    getList: () => Promise<Record<string, unknown>[]>;
    delete: (taskId: string) => Promise<Record<string, unknown>[]>;
    clear: () => Promise<Record<string, unknown>[]>;
  };
  memory: {
    getStats: () => Promise<Record<string, unknown>>;
    clear: () => Promise<Record<string, unknown>>;
  };
  app: {
    checkUpdate: () => Promise<{ hasUpdate: boolean; version?: string }>;
    getDiagnostics: () => Promise<Record<string, unknown>>;
  };
}

contextBridge.exposeInMainWorld('electronAPI', {
  translation: {
    start: (args) => ipcRenderer.invoke('translation:start', args),
    cancel: (taskId) => ipcRenderer.send('translation:cancel', { taskId }),
    onProgress: (callback) => {
      const handler = (_event: unknown, data: unknown) => callback(data as { percent: number; stage: string; message?: string });
      ipcRenderer.on('translation:progress', handler);
      return () => ipcRenderer.removeListener('translation:progress', handler);
    },
    onComplete: (callback) => {
      const handler = (_event: unknown, data: unknown) => callback(data as { taskId: string; outputPath: string });
      ipcRenderer.on('translation:complete', handler);
      return () => ipcRenderer.removeListener('translation:complete', handler);
    },
    onError: (callback) => {
      const handler = (_event: unknown, data: unknown) => callback(data as { taskId: string; code: string; message: string });
      ipcRenderer.on('translation:error', handler);
      return () => ipcRenderer.removeListener('translation:error', handler);
    },
  },
  file: {
    select: () => ipcRenderer.invoke('file:select'),
    open: (filePath) => ipcRenderer.invoke('file:open', { filePath }),
    openOutputDir: () => ipcRenderer.invoke('file:openOutputDir'),
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings) => ipcRenderer.send('settings:save', settings),
    testConnection: (args) => ipcRenderer.invoke('settings:testConnection', args),
  },
  license: {
    activate: (code) => ipcRenderer.invoke('license:activate', { code }),
    validate: () => ipcRenderer.invoke('license:validate'),
  },
  term: {
    getList: () => ipcRenderer.invoke('term:getList'),
    import: (filePath) => ipcRenderer.invoke('term:import', { filePath }),
  },
  history: {
    getList: () => ipcRenderer.invoke('history:getList'),
    delete: (taskId) => ipcRenderer.invoke('history:delete', { taskId }),
    clear: () => ipcRenderer.invoke('history:clear'),
  },
  memory: {
    getStats: () => ipcRenderer.invoke('memory:getStats'),
    clear: () => ipcRenderer.invoke('memory:clear'),
  },
  app: {
    checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
    getDiagnostics: () => ipcRenderer.invoke('app:getDiagnostics'),
  },
} satisfies ElectronAPI);
