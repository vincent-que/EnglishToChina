# 英文转中文文档翻译工具 — AI 开发者指令

> 此文件在每次 Claude Code 会话开始时自动加载，指导 AI 理解项目、遵循规范、产出高质量代码。

---

## 项目概述

**产品**：英文转中文桌面翻译工具，上传英文 PDF/Word，输出排版完全一致的中文翻译文档。

**核心卖点**：翻译后排版不乱、表格不崩、本地处理隐私安全。

**技术栈**：Electron + React 18 + TypeScript + Vite + Python 3.11 embedded

**销售平台**：闲鱼/淘宝/小红书，¥29-199 一次购买终身使用

---

## 项目结构

```
english-to-china-translator/
├── src/
│   ├── main/                     # Electron 主进程（Node.js）
│   │   ├── index.ts              # 入口，窗口管理
│   │   ├── ipc/                  # IPC 处理器（渲染进程↔主进程通信）
│   │   ├── services/             # 业务逻辑层
│   │   │   ├── translate.service.ts  # 翻译调度
│   │   │   ├── file.service.ts       # 文件操作
│   │   │   ├── license.service.ts    # 授权验证
│   │   │   └── engine.service.ts     # 引擎管理
│   │   ├── workers/              # Python Worker 子进程管理
│   │   └── database/             # SQLite（better-sqlite3）
│   ├── renderer/                 # 渲染进程（React + TypeScript）
│   │   ├── App.tsx
│   │   ├── pages/                # 页面组件
│   │   │   ├── Workspace.tsx     # 工作台（主页）
│   │   │   ├── Settings.tsx      # 设置
│   │   │   ├── Preview.tsx       # 翻译结果预览
│   │   │   └── Activation.tsx    # 激活授权
│   │   ├── components/           # 复用 UI 组件
│   │   ├── stores/               # Zustand 状态管理
│   │   └── hooks/                # 自定义 Hooks
│   └── shared/                   # 主进程+渲染进程共享
│       ├── types.ts              # 共享类型定义
│       ├── constants.ts          # 常量
│       └── ipc-channels.ts       # IPC 通道名
├── python/                       # Python 后端（文档处理）
│   ├── parsers/
│   │   ├── pdf_parser.py         # PyMuPDF + pdfplumber
│   │   └── word_parser.py        # python-docx
│   ├── translators/
│   │   └── engine.py             # 翻译引擎适配
│   ├── rebuilders/
│   │   ├── pdf_rebuilder.py      # ReportLab
│   │   └── word_rebuilder.py     # python-docx 回写
│   ├── ocr/
│   │   └── ocr_engine.py         # PaddleOCR
│   └── worker.py                 # Python Worker 入口（stdin/stdout JSON）
├── resources/
│   └── fonts/                    # 内置中文字体（Noto Sans SC）
├── design/                       # 设计文档（参考用，不打包）
│   ├── 00-components.html        # UI 组件库
│   ├── 01-workspace.html         # 工作台原型
│   ├── 02-settings.html          # 设置页原型
│   ├── 03-preview.html           # 预览页原型
│   ├── 04-activation.html        # 激活页原型
│   ├── 05-preferences.html       # 偏好设置原型
│   ├── 06-technical-architecture.md  # 技术架构设计
│   ├── 07-anti-piracy-license.md    # 反破解与授权设计
│   └── 08-business-model-operations.md # 商业模式设计
├── package.json
├── requirements.txt
├── electron-builder.yml
└── vite.config.ts
```

---

## 核心架构决策

### 主进程 vs 渲染进程

| 职责 | 主进程（Node.js） | 渲染进程（React） |
|------|------------------|------------------|
| 窗口管理 | ✅ | ❌ |
| IPC 路由 | ✅ | ❌ |
| 文件操作 | ✅ | ❌ |
| Python Worker | ✅ | ❌ |
| 翻译 API 调用 | ✅ | ❌ |
| 授权验证 | ✅ | ❌ |
| UI 渲染 | ❌ | ✅ |
| 用户交互 | ❌ | ✅ |
| 状态展示 | ❌ | ✅ |

**关键原则**：渲染进程不直接访问 Node.js API、文件系统或网络。所有敏感操作通过 IPC 调用主进程。

### IPC 通道清单

| 通道 | 方向 | 类型 | 说明 |
|------|------|------|------|
| `translation:start` | 渲染→主 | invoke | 开始翻译任务 |
| `translation:cancel` | 渲染→主 | send | 取消翻译 |
| `translation:progress` | 主→渲染 | emit | 翻译进度更新 |
| `translation:complete` | 主→渲染 | emit | 翻译完成 |
| `translation:error` | 主→渲染 | emit | 翻译错误 |
| `file:select` | 渲染→主 | invoke | 选择文件对话框 |
| `file:open` | 渲染→主 | invoke | 打开输出文件 |
| `settings:get` | 渲染→主 | invoke | 获取设置 |
| `settings:save` | 渲染→主 | send | 保存设置 |
| `license:activate` | 渲染→主 | invoke | 激活授权码 |
| `license:validate` | 渲染→主 | invoke | 验证授权状态 |
| `term:getList` | 渲染→主 | invoke | 获取术语表列表 |
| `term:import` | 渲染→主 | invoke | 导入术语表 |
| `history:getList` | 渲染→主 | invoke | 获取翻译历史 |
| `app:checkUpdate` | 渲染→主 | invoke | 检查更新 |

### Python Worker 通信协议

```json
// 主进程 → Python Worker（stdin）
{ "command": "parse", "filePath": "/path/to/file.docx", "options": {} }

// Python Worker → 主进程（stdout）
{ "status": "success", "data": { "documentModel": {...} } }
{ "status": "error", "code": "PARSE_FAILED", "message": "..." }
```

### DocumentModel（核心中间数据结构）

```typescript
interface DocumentModel {
  meta: { sourceFile: string; format: 'pdf' | 'docx'; pages: number };
  pages: PageModel[];
  translations: Record<string, string>;  // blockId → 翻译文本
}

interface PageModel {
  pageNumber: number;
  blocks: BlockModel[];
  tables: TableModel[];
  images: ImageModel[];
  width: number;
  height: number;
}

interface BlockModel {
  id: string;
  type: 'heading' | 'paragraph' | 'list' | 'caption';
  text: string;
  position: { x: number; y: number; width: number; height: number };
  style: { fontFamily: string; fontSize: number; bold: boolean; italic: boolean };
}
```

### 翻译引擎适配器

所有国内引擎兼容 OpenAI API 格式，使用统一的 `OpenAICompatibleProvider` 适配器：

```typescript
// 引擎注册表（6 个国内引擎）
const ENGINE_REGISTRY = {
  deepseek:    { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', recommend: true },
  qwen:        { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', recommend: true },
  glm:         { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', recommend: true },
  moonshot:    { baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  baichuan:    { baseUrl: 'https://api.baichuan-ai.com/v1', model: 'Baichuan4' },
  siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
};
```

---

## 设计文档引用

遇到特定问题时，查阅对应设计文档：

| 场景 | 查阅文件 | 章节 |
|------|---------|------|
| UI 组件样式/交互 | `design/00-components.html` | 对应组件 |
| 工作台页面布局 | `design/01-workspace.html` | 全文 |
| 设置页交互 | `design/02-settings.html` | 全文 |
| 翻译结果预览 | `design/03-preview.html` | 全文 |
| 激活流程 | `design/04-activation.html` | 全文 |
| IPC 通道定义 | `design/06-technical-architecture.md` | §1.2 |
| 进程模型 | `design/06-technical-architecture.md` | §1.3 |
| PDF 解析方案 | `design/06-technical-architecture.md` | §2.1 |
| Word 解析方案 | `design/06-technical-architecture.md` | §2.1 |
| 翻译引擎设计 | `design/06-technical-architecture.md` | §2.2 |
| 排版重建方案 | `design/06-technical-architecture.md` | §2.3 |
| DocumentModel | `design/06-technical-architecture.md` | §3 |
| 错误处理规范 | `design/06-technical-architecture.md` | §3 |
| 技术栈选型 | `design/06-technical-architecture.md` | §5 |
| 授权码格式 | `design/07-anti-piracy-license.md` | §4 |
| 设备指纹算法 | `design/07-anti-piracy-license.md` | §3 |
| 授权服务器 API | `design/07-anti-piracy-license.md` | §9.3 |
| 离线宽限期逻辑 | `design/07-anti-piracy-license.md` | §7 |
| 输出水印方案 | `design/07-anti-piracy-license.md` | §5 |

---

## 编码规范

### TypeScript

- 严格模式（`strict: true`）
- 优先使用 `interface` 而非 `type`（除联合类型）
- 函数参数使用解构：`function translate({ text, engine, options }: TranslateParams)`
- 异步操作统一使用 `async/await`，不使用 `.then()`
- 错误使用自定义 `AppError` 类，不抛原始 Error

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 变量/函数 | camelCase | `translateText`, `getLicenseStatus` |
| 组件 | PascalCase | `Workspace`, `FileList`, `EngineSelect` |
| 常量 | UPPER_SNAKE | `ENGINE_REGISTRY`, `MAX_DEVICES` |
| 接口 | PascalCase，无 I 前缀 | `DocumentModel`, `TranslationProvider` |
| 文件（TS/TSX） | kebab-case | `translate-service.ts`, `file-list.tsx` |
| 文件（Python） | snake_case | `pdf_parser.py`, `word_rebuilder.py` |
| IPC 通道 | `namespace:action` | `translation:start`, `license:activate` |
| CSS 变量 | kebab-case | `--primary`, `--bg-card` |

### 错误处理

```typescript
// 统一错误格式
interface AppError {
  code: string;        // 'API_TIMEOUT' | 'FILE_FORMAT_UNSUPPORTED' | 'LICENSE_EXPIRED' ...
  message: string;     // 用户友好的中文消息
  detail?: string;     // 技术详情（仅日志）
  recoverable: boolean; // 是否可恢复
}

// 错误码（来自 06-technical-architecture.md §3）
// API_RATE_LIMITED    → 指数退避重试，最多 3 次
// API_QUOTA_EXCEEDED  → 提示用户充值或切换自备 Key
// API_TIMEOUT         → 5 秒后重试，最多 3 次
// FILE_FORMAT_UNSUPPORTED → 终止，提示支持的格式
// LICENSE_EXPIRED     → 跳转激活页面
```

### IPC 通信规范

```typescript
// 渲染进程调用主进程（请求-响应）
const result = await ipcRenderer.invoke('translation:start', {
  filePath: '/path/to/file.docx',
  style: 'business',
  termTables: ['computer'],
  outputFormat: 'docx'
});

// 主进程通知渲染进程（单向）
ipcMain.emit('translation:progress', { percent: 65, stage: 'translating' });

// 渲染进程监听通知
ipcRenderer.on('translation:progress', (event, data) => {
  updateProgress(data.percent, data.stage);
});
```

---

## UI 开发规范

### 设计系统 CSS 变量

```css
:root {
  /* 颜色 */
  --primary: #1E3A5F;
  --primary-hover: #16304F;
  --primary-light: #4A7AB5;
  --primary-lighter: #D6E4F0;
  --accent: #2ECC71;
  --accent-hover: #27AE60;
  --warning: #F39C12;
  --error: #E74C3C;
  --info: #3498DB;

  /* 背景 */
  --bg-page: #F8F9FA;
  --bg-card: #FFFFFF;
  --bg-input: #FFFFFF;

  /* 文字 */
  --text-primary: #2C3E50;
  --text-secondary: #6C757D;
  --text-tertiary: #ADB5BD;

  /* 边框 */
  --border: #E9ECEF;
  --border-hover: #CED4DA;

  /* 阴影 */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.10);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.14);

  /* 圆角 */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  /* 字体 */
  --font-zh: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-en: "DM Sans", -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", "Consolas", monospace;
}

/* 暗色模式 */
[data-theme="dark"] {
  --primary: #4A90D9;
  --bg-page: #0F1117;
  --bg-card: #16213E;
  --border: #2A2A4A;
  --text-primary: #E8E8E8;
  --text-secondary: #A0A0B0;
}
```

### 暗色模式实现

```typescript
// Zustand store
const useThemeStore = create((set) => ({
  theme: 'light' as 'light' | 'dark',
  toggleTheme: () => set((state) => ({
    theme: state.theme === 'light' ? 'dark' : 'light'
  })),
}));

// 应用到 html 标签
useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme);
}, [theme]);
```

### 组件拆分原则

- 每个页面对应 1 个主组件 + 若干子组件
- 复用组件放 `components/` 目录
- 页面专属组件放页面文件内（不导出）
- 从 `00-components.html` 中提取的组件保持样式一致

### 字体使用

- 中文正文：`var(--font-zh)`
- 英文标题/数字：`var(--font-en)`
- 代码/授权码：`var(--font-mono)`
- 文档预览正文：额外使用 `"Noto Serif SC"` 衬线体

---

## 关键约束

1. **Python 嵌入式运行时**：使用 `python-embedded`（~30MB），预装依赖，不依赖用户环境
2. **大文件内存控制**：分片处理（每次 20 页），内存上限 512MB，处理完主动释放
3. **授权验证在主进程**：License Service 在主进程运行，渲染进程无法绕过
4. **翻译引擎全部国内**：DeepSeek/通义千问/智谱/Moonshot/百川/硅基流动，无海外引擎
5. **安装包 ≤ 150MB**：ASAR 打包 + Python embedded + 精简字体
6. **中文字体映射**：Arial/Helvetica/Calibri → Noto Sans SC
7. **翻译分段策略**：≤2000 token 直接翻译，>2000 token 按句子分段（≤1500 token，200 token 重叠）
8. **表格翻译**：逐单元格翻译，数字/公式/单位不翻译
9. **术语表注入**：注入到翻译 System Prompt 中

---

## 开发阶段

当前项目处于 **设计完成、待开发** 状态。开发按以下阶段推进：

| 阶段 | 周期 | 内容 | 验收标准 |
|------|------|------|---------|
| Phase 1 | 1 周 | Electron + React + Vite 初始化，IPC 框架，Python Worker | 侧边栏可切换页面，IPC 可调用，Python 可执行 |
| Phase 2 | 3-4 周 | Word 翻译 MVP，翻译引擎适配，进度展示 | .docx 翻译输出中文，排版基本保持 |
| Phase 3 | 2-3 周 | PDF 翻译，复杂表格，批量队列，设置页 | PDF 翻译后排版保持，可批量处理 |
| Phase 4 | 2-3 周 | OCR，授权系统，代码混淆，打包 | 扫描版 PDF 可翻译，授权激活生效，安装包可安装 |

---

## 注意事项

- **不要重新设计已有内容**：ENGINE_REGISTRY、DocumentModel、IPC 通道等已在设计文档中定义，直接使用
- **不要使用海外引擎**：GPT-4、Claude 等不在引擎列表中，只使用国内引擎
- **渲染进程安全**：不暴露 Node.js API 给渲染进程，所有操作通过 IPC
- **错误提示用中文**：面向用户的错误消息使用中文，不显示技术错误码
- **参考 HTML 原型**：UI 开发时打开对应的 HTML 原型文件，保持样式一致
