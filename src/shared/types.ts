export interface DocumentModel {
  meta: {
    sourceFile: string;
    format: 'pdf' | 'docx';
    pages: number;
  };
  pages: PageModel[];
  translations: Record<string, string>;
}

export interface PageModel {
  pageNumber: number;
  blocks: BlockModel[];
  tables: TableModel[];
  images: ImageModel[];
  width: number;
  height: number;
}

export interface BlockModel {
  id: string;
  type: 'heading' | 'paragraph' | 'list' | 'caption';
  text: string;
  position: { x: number; y: number; width: number; height: number };
  style: {
    fontFamily: string;
    fontSize: number;
    bold: boolean;
    italic: boolean;
  };
}

export interface TableModel {
  id: string;
  rows: number;
  cols: number;
  cells: TableCellModel[][];
  position: { x: number; y: number; width: number; height: number };
}

export interface TableCellModel {
  text: string;
  rowSpan: number;
  colSpan: number;
}

export interface ImageModel {
  id: string;
  position: { x: number; y: number; width: number; height: number };
  data?: string;
}

export interface TranslateOptions {
  style: 'academic' | 'business' | 'casual';
  termTable?: TermTable;
  context?: string;
  maxTokens?: number;
}

export interface TermTable {
  id: string;
  name: string;
  entries: TermEntry[];
}

export interface TermEntry {
  source: string;
  target: string;
}

export interface TranslationProgress {
  percent: number;
  stage: 'parsing' | 'translating' | 'rebuilding' | 'complete' | 'error';
  message?: string;
  currentBlock?: number;
  totalBlocks?: number;
}

export interface EngineConfig {
  name: string;
  baseUrl: string;
  model: string;
  inputPrice: number;
  outputPrice: number;
  description: string;
  recommend?: boolean;
}

export interface AppError {
  code: string;
  message: string;
  detail?: string;
  recoverable: boolean;
}

export interface TranslationTask {
  id: string;
  filePath: string;
  fileName: string;
  status: 'pending' | 'parsing' | 'translating' | 'rebuilding' | 'complete' | 'error';
  progress: number;
  outputPath?: string;
  error?: AppError;
  createdAt: number;
  completedAt?: number;
}

export interface AppSettings {
  engine: string;
  apiKey: string;
  style: 'academic' | 'business' | 'casual';
  outputFormat: 'docx' | 'pdf';
  autoSave: boolean;
  theme: 'light' | 'dark';
  concurrentLimit: number;
  termTableIds: string[];
  memoryEnabled: boolean;
  customEngine?: {
    baseUrl: string;
    model: string;
  };
}

export interface LicenseInfo {
  status: 'active' | 'expired' | 'trial' | 'invalid';
  plan?: string;
  activatedAt?: string;
  expiresAt?: string;
  features: string[];
}

export type FileType = 'pdf' | 'docx' | 'unknown';

export function getFileType(fileName: string): FileType {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  return 'unknown';
}
