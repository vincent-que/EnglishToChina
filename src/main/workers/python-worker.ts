import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

interface WorkerRequest {
  id: string;
  command: string;
  payload: Record<string, unknown>;
}

interface WorkerResponse {
  id: string;
  status: 'success' | 'error';
  data?: unknown;
  error?: { code: string; message: string };
}

type PendingCallback = {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  onProgress?: (progress: { percent: number; stage: string }) => void;
};

export class PythonWorkerManager {
  private process: ChildProcess | null = null;
  private pending = new Map<string, PendingCallback>();
  private buffer = '';
  private stderrBuffer = '';
  private requestId = 0;

  constructor() {
    this.ensureProcess();
  }

  getRuntimeInfo(): {
    pythonPath: string;
    workerScript: string;
    embeddedPythonPath: string;
    hasEmbeddedPython: boolean;
    usesEmbeddedPython: boolean;
    workerExists: boolean;
  } {
    const embedded = this.getEmbeddedPythonPath();
    const workerScript = this.getWorkerScript();
    const pythonPath = this.getPythonPath();
    return {
      pythonPath,
      workerScript,
      embeddedPythonPath: embedded,
      hasEmbeddedPython: fs.existsSync(embedded),
      usesEmbeddedPython: path.normalize(pythonPath) === path.normalize(embedded),
      workerExists: fs.existsSync(workerScript),
    };
  }

  private getEmbeddedPythonPath(): string {
    if (process.env.PYTHON_EMBEDDED_PATH) {
      return path.join(process.env.PYTHON_EMBEDDED_PATH, 'python.exe');
    }

    const candidates = app.isPackaged
      ? [path.join(process.resourcesPath, 'python-embedded', 'python.exe')]
      : [
          path.join(this.getAppRoot(), 'python-embedded', 'python.exe'),
          path.join(this.getAppRoot(), 'resources', 'python-embedded', 'python.exe'),
        ];

    return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
  }

  private getPythonPath(): string {
    if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
    const embedded = this.getEmbeddedPythonPath();
    if (fs.existsSync(embedded)) return embedded;
    return 'python';
  }

  private getWorkerScript(): string {
    const base = app.isPackaged ? process.resourcesPath : this.getAppRoot();
    return path.join(base, 'python', 'worker.py');
  }

  private getAppRoot(): string {
    return path.join(__dirname, '../../../..');
  }

  private ensureProcess(): void {
    if (this.process && !this.process.killed) return;

    const pythonPath = this.getPythonPath();
    const scriptPath = this.getWorkerScript();
    const pythonDir = path.dirname(scriptPath);

    const env = {
      ...process.env,
      ENGLISH_TO_CHINA_RESOURCES: app.isPackaged
        ? path.join(process.resourcesPath, 'resources')
        : path.join(this.getAppRoot(), 'resources'),
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    };

    this.process = spawn(pythonPath, ['-u', '-X', 'utf8', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      cwd: pythonDir,
      env,
    });

    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString();
      this.processStderrBuffer();
    });

    this.process.on('error', (err) => {
      console.error('[Python Worker] failed to start:', err);
      this.process = null;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(`Python Worker 启动失败：${err.message}。请在打包前运行 npm.cmd run python:prepare-embedded，或安装系统 Python 与 requirements.txt 依赖。`));
        this.pending.delete(id);
      }
    });

    this.process.on('exit', (code) => {
      console.log(`[Python Worker] exited with code ${code}`);
      this.process = null;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(`Python Worker 已退出，退出码：${code}。请在设置页运行环境自检查看 Python 依赖状态。`));
        this.pending.delete(id);
      }
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response: WorkerResponse = JSON.parse(line);
        const pending = this.pending.get(response.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pending.delete(response.id);
          if (response.status === 'success') {
            pending.resolve(response.data);
          } else {
            pending.reject(new Error(response.error?.message || 'Unknown error'));
          }
        }
      } catch {
        console.warn('[Python Worker] non-JSON output:', line);
      }
    }
  }

  private processStderrBuffer(): void {
    const lines = this.stderrBuffer.split('\n');
    this.stderrBuffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith('PROGRESS:')) {
        try {
          const progress = JSON.parse(line.slice('PROGRESS:'.length)) as {
            id: string;
            percent: number;
            stage: string;
          };
          this.pending.get(progress.id)?.onProgress?.({
            percent: progress.percent,
            stage: progress.stage,
          });
          continue;
        } catch {
          console.warn('[Python Worker] invalid progress output:', line);
        }
      }

      console.log('[Python Worker]', line);
    }
  }

  async execute<T = unknown>(
    command: string,
    payload: Record<string, unknown> = {},
    timeoutMs = 60000,
    onProgress?: (progress: { percent: number; stage: string }) => void
  ): Promise<T> {
    this.ensureProcess();

    const id = `req_${++this.requestId}`;
    const request: WorkerRequest = { id, command, payload };
    console.log('[Python Worker] execute:', command, 'filePath:', payload.filePath || 'N/A');

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Python worker timeout after ${timeoutMs}ms for command: ${command}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
        timeout,
        onProgress,
      });

      this.process!.stdin?.write(JSON.stringify(request) + '\n');
    });
  }

  terminate(): void {
    if (this.process && !this.process.killed) {
      this.process.stdin?.end();
      this.process.kill();
      this.process = null;
    }
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Worker terminated'));
      this.pending.delete(id);
    }
  }
}
