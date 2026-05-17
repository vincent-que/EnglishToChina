import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { PythonWorkerManager } from '../workers/python-worker';
import { FileService } from './file.service';
import { SettingsService } from './settings.service';
import { MemoryService } from './memory.service';
import type { TranslationTask, AppSettings, DocumentModel, TranslationProgress } from '../../shared/types';
import { getFileType } from '../../shared/types';

interface TranslateTaskOptions {
  style: AppSettings['style'];
  termTables: unknown[];
  outputFormat: AppSettings['outputFormat'];
  apiKey?: string;
  engine?: string;
}

export class TranslateService {
  private tasks = new Map<string, TranslationTask>();
  private queue: Array<{ task: TranslationTask; options: TranslateTaskOptions }> = [];
  private activeCount = 0;
  private historyPath: string;
  private worker: PythonWorkerManager;
  private win: BrowserWindow;
  private fileService: FileService;
  private settingsService: SettingsService;
  private memoryService: MemoryService;

  constructor(worker: PythonWorkerManager, win: BrowserWindow, memoryService = new MemoryService()) {
    this.worker = worker;
    this.win = win;
    this.fileService = new FileService();
    this.settingsService = new SettingsService();
    this.memoryService = memoryService;
    this.historyPath = path.join(app.getPath('userData'), 'translation-history.json');
    this.tasks = this.loadHistory();
  }

  startTask(filePath: string, options: TranslateTaskOptions): string {
    if (!filePath) throw new Error('文件路径不能为空');
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task: TranslationTask = {
      id: taskId,
      filePath,
      fileName: filePath.split(/[/\\]/).pop() || filePath,
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
    };
    this.tasks.set(taskId, task);
    this.saveHistory();
    this.queue.push({ task, options });
    this.processQueue();
    return taskId;
  }

  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status !== 'complete' && task.status !== 'error') {
      task.status = 'error';
      task.error = { code: 'CANCELLED', message: '翻译已取消', recoverable: false };
      this.saveHistory();
    }
  }

  getTaskHistory(): TranslationTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  removeTask(taskId: string): TranslationTask[] {
    this.tasks.delete(taskId);
    this.queue = this.queue.filter((item) => item.task.id !== taskId);
    this.saveHistory();
    return this.getTaskHistory();
  }

  clearHistory(): TranslationTask[] {
    this.tasks.clear();
    this.queue = [];
    this.saveHistory();
    return [];
  }

  private loadHistory(): Map<string, TranslationTask> {
    try {
      if (!fs.existsSync(this.historyPath)) return new Map();
      const data = JSON.parse(fs.readFileSync(this.historyPath, 'utf-8')) as TranslationTask[];
      return new Map(data.map((task) => {
        if (task.status !== 'complete' && task.status !== 'error') {
          return [task.id, {
            ...task,
            status: 'error',
            error: {
              code: 'INTERRUPTED',
              message: '上次运行中断，请重新翻译',
              recoverable: true,
            },
          } satisfies TranslationTask];
        }
        return [task.id, task];
      }));
    } catch (err) {
      console.error('Failed to load translation history:', err);
      return new Map();
    }
  }

  private saveHistory(): void {
    try {
      fs.mkdirSync(path.dirname(this.historyPath), { recursive: true });
      fs.writeFileSync(
        this.historyPath,
        JSON.stringify(this.getTaskHistory().slice(0, 200), null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error('Failed to save translation history:', err);
    }
  }

  private processQueue(): void {
    const settings = this.settingsService.getSettings();
    const limit = Math.max(1, settings.concurrentLimit || 1);

    while (this.activeCount < limit && this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (next.task.status === 'error') continue;

      this.activeCount += 1;
      this.runTask(next.task, next.options)
        .catch((err) => {
          next.task.status = 'error';
          next.task.error = {
            code: 'TRANSLATION_FAILED',
            message: err.message || '翻译失败',
            recoverable: true,
          };
          this.sendError(next.task.id, next.task.error);
          this.saveHistory();
        })
        .finally(() => {
          this.activeCount -= 1;
          this.processQueue();
        });
    }
  }

  private async runTask(task: TranslationTask, options: TranslateTaskOptions): Promise<void> {
    const fileType = getFileType(task.filePath);
    if (fileType === 'unknown') {
      throw new Error('不支持的文件格式');
    }

    const settings = this.settingsService.getSettings();
    const apiKey = options.apiKey || settings.apiKey;
    const engine = options.engine || settings.engine;

    if (!apiKey) {
      throw new Error('请先在设置中配置 API Key');
    }

    task.status = 'parsing';
    this.saveHistory();
    this.sendProgress(task.id, { percent: 5, stage: 'parsing', message: '正在解析文档...' });

    const docModel = await this.worker.execute<DocumentModel>(
      'parse',
      { filePath: task.filePath, format: fileType },
      120000
    );

    this.sendProgress(task.id, { percent: 20, stage: 'translating', message: '正在翻译...' });
    task.status = 'translating';
    this.saveHistory();

    const memoryPrepared = settings.memoryEnabled
      ? this.memoryService.prepareDocument({
        documentModel: docModel,
        engine,
        style: options.style,
        termTables: options.termTables,
      })
      : { documentModel: docModel, termTables: options.termTables, stats: null };

    if (memoryPrepared.stats) {
      this.sendProgress(task.id, {
        percent: 22,
        stage: 'translating',
        message: `记忆命中 ${memoryPrepared.stats.cacheHits} 条，术语注入 ${memoryPrepared.stats.injectedTerms}/${memoryPrepared.stats.originalTerms} 条`,
      });
    }

    const translated = await this.worker.execute<DocumentModel>(
      'translate',
      {
        documentModel: memoryPrepared.documentModel,
        style: options.style,
        termTables: memoryPrepared.termTables,
        apiKey,
        engine,
      },
      300000,
      ({ percent, stage }) => {
        const mappedPercent = 20 + Math.round(percent * 0.6);
        this.sendProgress(task.id, {
          percent: Math.min(79, mappedPercent),
          stage: 'translating',
          message: stage,
        });
      }
    );

    if (settings.memoryEnabled) {
      const stats = this.memoryService.saveDocumentTranslations({
        sourceDocument: docModel,
        translatedDocument: translated,
        engine,
        style: options.style,
        termTables: memoryPrepared.termTables,
      });
      if (stats.cacheWrites > 0) {
        this.sendProgress(task.id, {
          percent: 79,
          stage: 'translating',
          message: `已写入 ${stats.cacheWrites} 条翻译记忆`,
        });
      }
    }

    this.sendProgress(task.id, { percent: 80, stage: 'rebuilding', message: '正在重建文档...' });
    task.status = 'rebuilding';
    this.saveHistory();

    const outputPath = this.fileService.getOutputPath(task.fileName, options.outputFormat);

    await this.worker.execute(
      'rebuild',
      {
        documentModel: translated,
        outputPath,
        format: options.outputFormat,
        sourcePath: task.filePath,
      },
      120000
    );

    if (!this.fileService.fileExists(outputPath)) {
      throw new Error(`输出文件未生成: ${outputPath}`);
    }

    task.status = 'complete';
    task.progress = 100;
    task.outputPath = outputPath;
    task.completedAt = Date.now();
    this.saveHistory();

    this.sendProgress(task.id, { percent: 100, stage: 'complete', message: '翻译完成' });
    this.sendComplete(task.id, outputPath);
  }

  private sendProgress(taskId: string, progress: TranslationProgress): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('translation:progress', { taskId, ...progress });
    }
  }

  private sendComplete(taskId: string, outputPath: string): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('translation:complete', { taskId, outputPath });
    }
  }

  private sendError(taskId: string, error: NonNullable<TranslationTask['error']>): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('translation:error', { taskId, ...error });
    }
  }
}
