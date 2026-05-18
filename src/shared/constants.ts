import type { EngineConfig } from './types';

export const ENGINE_REGISTRY: Record<string, EngineConfig> = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    inputPrice: 1,
    outputPrice: 2,
    description: '综合表现均衡，适合通用文档翻译',
    recommend: true,
  },
  qwen: {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    inputPrice: 0.8,
    outputPrice: 2,
    description: '阿里云兼容接口，稳定性较好',
    recommend: true,
  },
  glm: {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    inputPrice: 0.1,
    outputPrice: 0.1,
    description: '成本较低，适合大批量文档',
  },
  moonshot: {
    name: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    inputPrice: 1,
    outputPrice: 1,
    description: '长文本能力较好，适合合同、说明书等长文档',
  },
  kimi: {
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    inputPrice: 1,
    outputPrice: 1,
    description: 'Moonshot Kimi 兼容接口，当前默认推荐',
    recommend: true,
  },
  baichuan: {
    name: '百川大模型',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    model: 'Baichuan4',
    inputPrice: 1,
    outputPrice: 1,
    description: '适合中文表达润色和行业文档翻译',
  },
  siliconflow: {
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
    inputPrice: 0.5,
    outputPrice: 1,
    description: '聚合平台，一个 Key 可使用多个模型',
  },
};

export const STYLE_LABELS: Record<string, string> = {
  academic: '学术正式',
  business: '商务通用',
  casual: '日常口语',
};

export const MAX_FILE_SIZE_MB = 100;
export const MAX_CONCURRENT_TRANSLATIONS = 3;
export const MAX_TOKEN_PER_SEGMENT = 1500;
export const OVERLAP_TOKENS = 200;
export const CHUNK_PAGES = 20;
export const MAX_MEMORY_MB = 512;

export const SUPPORTED_FORMATS = ['.pdf', '.docx', '.doc'];

export const FONT_MAPPING: Record<string, string> = {
  Arial: 'NotoSansSC',
  Helvetica: 'NotoSansSC',
  'Times New Roman': 'NotoSansSC',
  Calibri: 'NotoSansSC',
  Cambria: 'NotoSansSC',
};

export const IPC_CHANNELS = {
  TRANSLATION_START: 'translation:start',
  TRANSLATION_CANCEL: 'translation:cancel',
  TRANSLATION_PROGRESS: 'translation:progress',
  TRANSLATION_COMPLETE: 'translation:complete',
  TRANSLATION_ERROR: 'translation:error',
  FILE_SELECT: 'file:select',
  FILE_OPEN: 'file:open',
  FILE_OPEN_OUTPUT_DIR: 'file:openOutputDir',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_TEST_CONNECTION: 'settings:testConnection',
  LICENSE_ACTIVATE: 'license:activate',
  LICENSE_VALIDATE: 'license:validate',
  TERM_GET_LIST: 'term:getList',
  TERM_IMPORT: 'term:import',
  HISTORY_GET_LIST: 'history:getList',
  HISTORY_DELETE: 'history:delete',
  HISTORY_CLEAR: 'history:clear',
  MEMORY_GET_STATS: 'memory:getStats',
  MEMORY_CLEAR: 'memory:clear',
  APP_CHECK_UPDATE: 'app:checkUpdate',
  APP_GET_DIAGNOSTICS: 'app:getDiagnostics',
} as const;

export const DEFAULT_SETTINGS = {
  engine: 'kimi',
  apiKey: '',
  translationMode: 'proxy' as const,
  proxyServerUrl: '',
  style: 'business' as const,
  outputFormat: 'docx' as const,
  autoSave: true,
  theme: 'light' as const,
  concurrentLimit: 3,
  termTableIds: [],
  memoryEnabled: true,
};

export function resolveDefaultSettings(env: Record<string, string | undefined> = {}) {
  const proxyServerUrl = (env.CUSTOMER_PROXY_SERVER_URL || '').trim().replace(/\/+$/, '');
  return {
    ...DEFAULT_SETTINGS,
    proxyServerUrl: proxyServerUrl || DEFAULT_SETTINGS.proxyServerUrl,
  };
}
