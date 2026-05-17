import { app, shell } from 'electron';
import path from 'path';
import fs from 'fs';

export class FileService {
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(app.getPath('userData'), 'translations');
    this.ensureDir(this.outputDir);
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  getOutputPath(fileName: string, format: string): string {
    const baseName = path.basename(fileName, path.extname(fileName));
    const timestamp = Date.now();
    const ext = format === 'pdf' ? '.pdf' : '.docx';
    const outputName = `${baseName}_中文_${timestamp}${ext}`;
    return path.join(this.outputDir, outputName);
  }

  getOutputDir(): string {
    return this.outputDir;
  }

  openFile(filePath: string): void {
    shell.openPath(filePath);
  }

  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  getFileSize(filePath: string): number {
    try {
      return fs.statSync(filePath).size;
    } catch {
      return 0;
    }
  }
}
