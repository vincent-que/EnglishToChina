interface ElectronAPI {
  translation: {
    start: (args: { filePath: string; style: string; termTables: string[]; outputFormat: string }) => Promise<{ taskId: string }>;
    cancel: (taskId: string) => void;
    onProgress: (callback: (data: { taskId?: string; percent: number; stage: string; message?: string }) => void) => () => void;
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

declare interface Window {
  electronAPI?: ElectronAPI;
}
