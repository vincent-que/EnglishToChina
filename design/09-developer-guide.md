# 英文转中文文档翻译工具 — 开发指引

> 给开发者的完整上手指南

---

## 1. 项目概览

**一句话定位**：上传英文 PDF/Word，输出排版完全一致的中文翻译文档。

**核心卖点**：翻译后排版不乱、表格不崩、本地处理隐私安全。

**技术栈**：

| 层级 | 技术 | 用途 |
|------|------|------|
| 桌面框架 | Electron | 窗口管理、IPC、打包分发 |
| 前端 | React 18 + TypeScript + Vite | UI 渲染 |
| 状态管理 | Zustand | 轻量级状态管理 |
| UI 组件 | Radix UI + Tailwind CSS | 组件库 |
| 后端运行时 | Node.js 20 LTS | 主进程业务逻辑 |
| 文档处理 | Python 3.11 embedded | PDF/Word 解析、OCR、排版重建 |
| 本地数据库 | better-sqlite3 | 配置、缓存、历史记录 |
| 打包 | electron-builder | 安装包生成 |

**核心数据流**：

```
用户上传文件
    ↓
文档解析引擎（Python Worker）
    ↓ DocumentModel (JSON)
提取待翻译文本 + 术语表注入
    ↓
翻译引擎（国内大模型 API）
    ↓ 翻译结果映射
排版重建引擎（Python Worker）
    ↓
输出文件（.docx / .pdf）
```

---

## 2. 设计文档索引

| 文件 | 类型 | 内容 | 开发阶段 | 必读？ |
|------|------|------|---------|--------|
| [00-components.html](00-components.html) | HTML | UI 组件库（按钮、输入、卡片等 17 种组件） | 全程 | ✅ 开发前必读 |
| [01-workspace.html](01-workspace.html) | HTML | 工作台页面原型（上传、文件列表、翻译进度） | Phase 2 | ✅ 开发前必读 |
| [02-settings.html](02-settings.html) | HTML | 设置页面原型（翻译风格、术语表、API 配置） | Phase 2 | 参考 |
| [03-preview.html](03-preview.html) | HTML | 翻译结果对照预览原型 | Phase 2 | 参考 |
| [04-activation.html](04-activation.html) | HTML | 激活授权页面原型 | Phase 4 | 参考 |
| [05-preferences.html](05-preferences.html) | HTML | 翻译偏好设置原型 | Phase 3 | 参考 |
| [06-technical-architecture.md](06-technical-architecture.md) | MD | 技术架构设计（IPC、模块设计、技术栈） | 全程 | ✅ 开发前必读 |
| [07-anti-piracy-license.md](07-anti-piracy-license.md) | MD | 反破解与授权系统设计 | Phase 4 | 参考 |
| [08-business-model-operations.md](08-business-model-operations.md) | MD | 商业模式与运营设计 | 发布后 | 按需参考 |

**阅读顺序建议**：
1. 先读本文档（09）了解全局
2. 再读 06 技术架构了解系统设计
3. 打开 00-components.html 了解设计系统
4. 打开 01-workspace.html 了解主页面交互
5. 其余文档按开发阶段按需查阅

---

## 3. 开发环境搭建

### 3.1 基础环境

```bash
# Node.js 20 LTS
node --version  # v20.x.x
npm --version   # 10.x.x

# Python 3.11（用于文档处理）
python --version  # 3.11.x

# 包管理
npm install -g pnpm  # 推荐使用 pnpm
```

### 3.2 项目初始化

```bash
# 创建项目目录
mkdir english-to-china-translator
cd english-to-china-translator

# 初始化 Electron + Vite + React
pnpm create electron-vite .

# 安装前端依赖
pnpm add react react-dom zustand @radix-ui/react-* tailwindcss lucide-react

# 安装后端依赖
pnpm add better-sqlite3 electron-updater

# 安装开发依赖
pnpm add -D typescript @types/react electron electron-builder
pnpm add -D javascript-obfuscator
```

### 3.3 Python 依赖

```bash
# 创建 requirements.txt
pip install PyMuPDF pdfplumber python-docx PaddleOCR reportlab

# 打包为 embedded Python（用于分发）
# 使用 python-embedded 或 PyInstaller 打包
```

### 3.4 项目目录结构

```
english-to-china-translator/
├── src/
│   ├── main/                     # Electron 主进程
│   │   ├── index.ts              # 入口
│   │   ├── ipc/                  # IPC 处理器
│   │   │   ├── translation.ts    # translation:* 通道
│   │   │   ├── file.ts           # file:* 通道
│   │   │   ├── license.ts        # license:* 通道
│   │   │   └── settings.ts       # settings:* 通道
│   │   ├── services/             # 业务服务
│   │   │   ├── translate.service.ts
│   │   │   ├── file.service.ts
│   │   │   ├── license.service.ts
│   │   │   └── engine.service.ts
│   │   ├── workers/              # Python Worker 管理
│   │   │   └── python-worker.ts
│   │   └── database/             # SQLite 数据库
│   │       └── db.ts
│   ├── renderer/                 # 渲染进程 (React)
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Workspace.tsx     # 工作台
│   │   │   ├── Settings.tsx      # 设置
│   │   │   ├── Preview.tsx       # 预览
│   │   │   └── Activation.tsx    # 激活
│   │   ├── components/           # 复用组件
│   │   ├── stores/               # Zustand 状态
│   │   └── hooks/                # 自定义 Hooks
│   └── shared/                   # 共享类型
│       ├── types.ts
│       └── constants.ts
├── python/                       # Python 后端
│   ├── parsers/
│   │   ├── pdf_parser.py
│   │   └── word_parser.py
│   ├── translators/
│   │   └── engine.py
│   ├── rebuilders/
│   │   ├── pdf_rebuilder.py
│   │   └── word_rebuilder.py
│   ├── ocr/
│   │   └── ocr_engine.py
│   └── worker.py                 # Python Worker 入口
├── resources/                    # 打包资源
│   └── fonts/                    # 中文字体
├── package.json
├── requirements.txt
├── electron-builder.yml
└── vite.config.ts
```

---

## 4. 分阶段开发任务

### Phase 1（第 1 周）：项目骨架

**目标**：Electron + React + Vite 跑通，IPC 框架可用，Python Worker 可调用。

| 任务 | 说明 | 依赖设计文档 |
|------|------|-------------|
| Electron + Vite + React 初始化 | 项目脚手架，HMR 开发环境 | 06 §5 技术栈 |
| IPC 框架搭建 | preload 脚本、ipcMain/ipcRenderer 封装 | 06 §1.2 IPC 清单 |
| Python Worker 子进程管理 | spawn Python、消息通信、错误处理 | 06 §1.3 进程模型 |
| 侧边栏导航 + 页面路由 | React Router，4 个主页面 | 01-workspace.html |
| SQLite 数据库初始化 | better-sqlite3，建表 | 06 §2.4 |
| 设计系统 → React 主题 | CSS 变量 → Tailwind 配置 | 00-components.html |

**验收标准**：
- 应用启动，侧边栏可切换 4 个页面
- 点击按钮可触发 IPC 调用，主进程收到消息
- Python Worker 可执行简单脚本并返回结果

### Phase 2（第 2-5 周）：Word 翻译 MVP

**目标**：Word 文档翻译全流程跑通（解析 → 翻译 → 回写）。

| 任务 | 说明 | 依赖设计文档 |
|------|------|-------------|
| python-docx 解析 Word | 提取段落、表格、样式 → DocumentModel | 06 §2.1 Word 解析 |
| 翻译引擎适配层 | OpenAI 兼容适配器，支持 DeepSeek/通义千问/智谱 | 06 §2.2 引擎注册表 |
| python-docx 回写 | 在原文档基础上替换中文文本，保持格式 | 06 §2.3 排版重建 |
| 翻译进度展示 | 进度条 + 阶段文字（解析→翻译→排版→完成） | 01-workspace.html |
| 术语表基础功能 | 导入/管理术语表，注入翻译 Prompt | 02-settings.html |
| 翻译风格选择 | 学术/商务/口语三种风格 | 02-settings.html |
| 工作台文件上传 | 拖拽上传 + 文件列表 + 开始翻译 | 01-workspace.html |
| 翻译结果预览 | 左右对照（原文 vs 译文） | 03-preview.html |

**验收标准**：
- 上传 .docx 文件，翻译完成输出中文 .docx
- 排版基本保持（标题、段落、表格结构）
- 翻译进度实时更新
- 可选择翻译风格和术语表

### Phase 3（第 6-8 周）：PDF + 批量

**目标**：PDF 翻译、复杂表格、批量处理、设置完善。

| 任务 | 说明 | 依赖设计文档 |
|------|------|-------------|
| PyMuPDF 解析 PDF | 提取文本块（含位置/字体/大小） | 06 §2.1 PDF 解析 |
| pdfplumber 表格补充 | 精确提取表格结构 | 06 §2.1 PDF 解析 |
| ReportLab 生成中文 PDF | 按 DocumentModel 重建 PDF | 06 §2.3 PDF 输出 |
| 中文字体处理 | FontManager，系统字体 + 内置子集字体 | 06 §2.3 字体映射 |
| 复杂表格处理 | 合并单元格、跨页表格、样式保留 | 06 §2.1 |
| 批量任务队列 | 最大并发 2 个，失败重试，单文件失败不影响其他 | 06 §2.4 |
| 翻译历史记录 | 本地 SQLite 存储，可查看/重新导出 | 06 §2.4 |
| 设置页完善 | API 配置、引擎选择、输出目录 | 02-settings.html |

**验收标准**：
- 文字版 PDF 翻译后排版基本保持
- 表格结构完整保留
- 可批量上传多个文件
- 设置页可配置 API Key 和翻译引擎

### Phase 4（第 9-11 周）：授权 + 发布

**目标**：授权系统、安全加固、打包发布。

| 任务 | 说明 | 依赖设计文档 |
|------|------|-------------|
| PaddleOCR 扫描版 PDF | OCR + 版面分析 | 06 §2.1 OCR |
| 授权码生成工具 | Ed25519 签名，离线生成 | 07 §4 授权码体系 |
| 授权服务器 | Serverless 函数，4 个 API | 07 §9 服务器设计 |
| 客户端 License Service | 授权码、签名令牌、离线宽限期 | 07 |
| 激活页面对接 | 04-activation.html 接入真实 IPC | 04-activation.html |
| 授权信息对接 | 05-preferences.html 接入真实授权 API | 05-preferences.html |
| 代码混淆 | javascript-obfuscator 配置 | 07 §6.1 |
| 输出水印 | 零宽字符(docx) + 间距微调(pdf) | 07 §6 水印 |
| 完整性校验 | 启动时文件哈希检查 | 07 §6.2 |
| electron-builder 打包 | NSIS 安装包，~150MB | 06 §5 打包 |
| 自动更新 | electron-updater | 06 §5 |

**验收标准**：
- 扫描版 PDF 可 OCR 翻译
- 授权码可激活，签名令牌校验生效
- 离线 7 天内正常，超期降级为试用
- 安装包可正常安装/卸载
- 代码已混淆，输出带水印

---

## 5. 关键模块开发指引

### 5.1 文档解析引擎

**参考**：06-technical-architecture.md §2.1

**输入**：文件路径（.docx / .pdf）
**输出**：DocumentModel（JSON）

```typescript
// DocumentModel 核心结构
interface DocumentModel {
  meta: {
    sourceFile: string;
    format: 'pdf' | 'docx';
    pages: number;
  };
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

**Python Worker 通信协议**：
```json
// 主进程 → Python Worker
{ "command": "parse", "filePath": "/path/to/file.docx", "options": {} }

// Python Worker → 主进程
{ "status": "success", "data": { "documentModel": {...} } }
{ "status": "error", "code": "PARSE_FAILED", "message": "..." }
```

### 5.2 翻译引擎

**参考**：06-technical-architecture.md §2.2

**关键接口**：
```typescript
interface TranslationProvider {
  name: string;
  translate(text: string, options: TranslateOptions): Promise<string>;
  testConnection(apiKey: string): Promise<boolean>;
  estimateCost(texts: string[]): number;
}
```

**引擎注册表**（6 个国内引擎）：见 06 §2.2 ENGINE_REGISTRY

**翻译策略**：
- 长度 ≤ 2000 token → 直接翻译
- 长度 > 2000 token → 按句子边界分段，每段 ≤ 1500 token
- 表格逐单元格翻译，数字/公式不翻译
- 术语表注入 System Prompt

### 5.3 排版重建引擎

**参考**：06-technical-architecture.md §2.3

**Word 输出**：python-docx 回写（在原文档基础上替换文本，保持所有格式）
**PDF 输出**：ReportLab（按 DocumentModel 精确排版）

### 5.4 授权系统

**参考**：07-anti-piracy-license.md 全文

**关键模块**：
- 授权令牌校验：07
- 授权码格式：07 §4
- License Service：07 §2 + §7
- API 接口：07 §9.3

### 5.5 UI 页面

**参考**：00-components.html（设计系统） + 01~05 页面原型

**页面映射**：
| 原型文件 | React 页面 | 路由 |
|---------|-----------|------|
| 01-workspace.html | Workspace.tsx | / |
| 02-settings.html | Settings.tsx | /settings |
| 03-preview.html | Preview.tsx | /preview |
| 04-activation.html | Activation.tsx | /activation |
| 05-preferences.html | Preferences.tsx | /preferences |

---

## 6. UI 开发指引

### 6.1 设计系统 → React 主题

从 00-components.html 提取 CSS 变量，配置 Tailwind：

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1E3A5F',
          hover: '#16304F',
          light: '#4A7AB5',
          lighter: '#D6E4F0',
        },
        accent: {
          DEFAULT: '#2ECC71',
          hover: '#27AE60',
        },
        // ... 其他颜色
      },
      fontFamily: {
        zh: ['"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        en: ['"DM Sans"', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
    },
  },
};
```

### 6.2 暗色模式

```typescript
// 使用 Zustand 管理主题
const useThemeStore = create((set) => ({
  theme: 'light',
  toggleTheme: () => set((state) => ({
    theme: state.theme === 'light' ? 'dark' : 'light'
  })),
}));

// 应用到 html 标签
useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme);
}, [theme]);
```

### 6.3 组件拆分建议

| 原型中的组件 | React 组件名 | 来源 |
|-------------|-------------|------|
| 侧边栏导航 | `<Sidebar />` | 01-workspace.html |
| 文件上传区 | `<UploadZone />` | 01-workspace.html |
| 文件列表 | `<FileList />` | 01-workspace.html |
| 翻译进度 | `<TranslationProgress />` | 01-workspace.html |
| 翻译风格卡片 | `<StyleCard />` | 02-settings.html |
| 引擎选择下拉 | `<EngineSelect />` | 02-settings.html |
| 对照预览 | `<ComparisonPreview />` | 03-preview.html |
| 授权码输入 | `<LicenseInput />` | 04-activation.html |
| 授权信息卡片 | `<LicenseInfoCard />` | 05-preferences.html |

---

## 7. 注意事项

### 7.1 Python 嵌入式运行时

- 使用 `python-embedded`（~30MB）而非完整 Python 安装
- 所需依赖预装到 embedded 目录
- 通过 `child_process.spawn` 调用 Python Worker
- 通信使用 stdin/stdout JSON 消息

### 7.2 中文字体

- 内置精简子集字体（Noto Sans SC Regular + Bold，~5MB）
- 输出文档优先使用系统字体（微软雅黑、苹方）
- FontManager 处理英文字体→中文字体映射

### 7.3 大文件内存控制

- 分片处理：每次处理 20 页，处理完释放内存
- 动态调整：根据可用内存调整分片大小
- 内存上限：512MB
- 大文件提示：超过 50 页时提示用户预计时间

### 7.4 错误处理规范

所有错误使用统一格式：
```typescript
interface AppError {
  code: string;       // 如 'API_TIMEOUT'
  message: string;    // 用户友好的中文消息
  detail?: string;    // 技术详情（仅日志）
  recoverable: boolean; // 是否可恢复
}
```

错误码见 06-technical-architecture.md §3 错误处理表。

### 7.5 IPC 安全

- 渲染进程不直接访问 Node.js API
- 所有 IPC 通道在 preload 脚本中显式暴露
- 主进程验证所有来自渲染进程的输入
- 敏感操作（文件写入、网络请求）仅在主进程执行
