# 英文转中文文档翻译工具 — 技术架构设计方案

> 模块三：技术架构设计

---

## 1. 整体架构设计

### 1.1 Electron vs Tauri 选型

| 维度 | Electron | Tauri | 推荐 |
|------|---------|-------|------|
| **前端框架** | Chromium + Node.js | 系统 WebView + Rust | — |
| **安装包体积** | ~150-200MB | ~5-15MB | Tauri |
| **内存占用** | ~200-400MB | ~50-100MB | Tauri |
| **启动速度** | 2-5 秒 | <1 秒 | Tauri |
| **生态成熟度** | 极高，npm 全生态 | 中等，快速发展中 | Electron |
| **原生能力** | Node.js 原生模块 | Rust FFI，系统 API | 各有优势 |
| **开发门槛** | 低（JS/TS 全栈） | 中高（需 Rust） | Electron |
| **跨平台** | Win/Mac/Linux | Win/Mac/Linux | 持平 |
| **社区方案** | 极丰富 | 较丰富 | Electron |
| **安全模型** | 较弱（Node 全权限） | 强（Rust 内存安全） | Tauri |
| **自动更新** | electron-updater（成熟） | tauri-updater（可用） | Electron |
| **Python 集成** | 子进程 / python-embedded | 子进程 / python-embedded | 持平 |

**推荐方案：Electron 首发**

理由：
1. 团队技术栈以 JS/TS 为主，开发效率高
2. 生态成熟，问题解决方案多，社区支持好
3. Node.js 原生模块支持好，集成 Python 后端方便
4. 自动更新方案成熟（electron-updater）
5. 安装包体积可通过压缩优化到 ~120MB
6. 后续有余力可考虑 Tauri 版本作为轻量替代

**包体优化策略：**
- 使用 `electron-builder` 的 `asar` 打包
- Python 运行时使用 `python-embedded`（~30MB）
- OCR 模型文件按需下载，不打包进安装包
- 中文字体使用系统字体 + 内置一个精简子集字体
- 目标：安装包 ≤ 150MB

### 1.2 前后端通信架构

```
┌─────────────────────────────────────────────────────────┐
│                    Electron 应用                         │
│                                                         │
│  ┌─────────────┐    IPC     ┌──────────────────────┐   │
│  │  渲染进程     │◄─────────►│     主进程             │   │
│  │  (Frontend)  │           │  (Main Process)       │   │
│  │              │           │                       │   │
│  │  React/Vue   │           │  ┌─────────────────┐  │   │
│  │  UI 组件      │           │  │  IPC Handlers   │  │   │
│  │  状态管理      │           │  └────────┬────────┘  │   │
│  └─────────────┘           │           │           │   │
│                             │  ┌────────▼────────┐  │   │
│                             │  │  Service Layer  │  │   │
│                             │  │  (业务逻辑)      │  │   │
│                             │  └────────┬────────┘  │   │
│                             │           │           │   │
│                             │  ┌────────▼────────┐  │   │
│                             │  │  Python Worker  │  │   │
│                             │  │  (子进程)        │  │   │
│                             │  └─────────────────┘  │   │
│                             └──────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**IPC 通信机制：**

```typescript
// 主进程 → 渲染进程（单向通知）
ipcMain.emit('translation:progress', { percent: 65, stage: 'translating' });
ipcMain.emit('translation:complete', { outputPath: '/path/to/output.docx' });
ipcMain.emit('translation:error', { code: 'API_TIMEOUT', message: '...' });

// 渲染进程 → 主进程（请求-响应）
const result = await ipcRenderer.invoke('translation:start', {
  filePath: '/path/to/input.docx',
  style: 'business',
  termTables: ['computer'],
  outputFormat: 'docx'
});

// 渲染进程 → 主进程（单向通知）
ipcRenderer.send('settings:save', { apiKey: '...', model: 'deepseek' });
```

**IPC 接口清单：**

| 通道 | 方向 | 说明 |
|------|------|------|
| `translation:start` | 渲染→主（invoke） | 开始翻译任务 |
| `translation:cancel` | 渲染→主（send） | 取消翻译 |
| `translation:progress` | 主→渲染（emit） | 翻译进度更新 |
| `translation:complete` | 主→渲染（emit） | 翻译完成 |
| `translation:error` | 主→渲染（emit） | 翻译错误 |
| `file:select` | 渲染→主（invoke） | 选择文件对话框 |
| `file:open` | 渲染→主（invoke） | 打开输出文件 |
| `settings:get` | 渲染→主（invoke） | 获取设置 |
| `settings:save` | 渲染→主（send） | 保存设置 |
| `license:activate` | 渲染→主（invoke） | 激活授权码 |
| `license:validate` | 渲染→主（invoke） | 验证授权状态 |
| `term:getList` | 渲染→主（invoke） | 获取术语表列表 |
| `term:import` | 渲染→主（invoke） | 导入术语表 |
| `history:getList` | 渲染→主（invoke） | 获取翻译历史 |
| `app:checkUpdate` | 渲染→主（invoke） | 检查更新 |

### 1.3 进程模型

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron 主进程                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Window   │  │ IPC      │  │ Auto     │  │ Tray       │  │
│  │ Manager  │  │ Handlers │  │ Updater  │  │ Manager    │  │
│  └──────────┘  └────┬─────┘  └──────────┘  └────────────┘  │
│                     │                                       │
│  ┌──────────────────▼──────────────────────────────────┐   │
│  │              Service Layer                           │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │ File     │ │ Translate│ │ License  │            │   │
│  │  │ Service  │ │ Service  │ │ Service  │            │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘            │   │
│  └───────┼────────────┼────────────┼───────────────────┘   │
│          │            │            │                         │
│  ┌───────▼────┐ ┌─────▼─────┐ ┌───▼──────┐                │
│  │ Python     │ │ Python    │ │ HTTP     │                │
│  │ Doc Worker │ │ OCR Worker│ │ Client   │                │
│  │ (子进程)    │ │ (子进程)   │ │ (API)    │                │
│  └────────────┘ └───────────┘ └──────────┘                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     渲染进程 (Chromium)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  React / Vue 应用                                     │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐  │   │
│  │  │ UI 组件  │ │ 状态管理 │ │ 路由    │ │ IPC 桥接  │  │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └───────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   Python Worker 子进程                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ PDF      │ │ Word     │ │ OCR      │ │ 排版重建      │   │
│  │ Parser   │ │ Parser   │ │ Engine   │ │ Engine       │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**进程职责：**

| 进程 | 职责 | 技术栈 |
|------|------|--------|
| **主进程** | 窗口管理、IPC 路由、系统托盘、自动更新、授权验证 | Electron + Node.js |
| **渲染进程** | UI 渲染、用户交互、状态展示 | React + TypeScript |
| **Python Worker** | 文档解析、OCR、排版重建（CPU 密集型） | Python 3.11 + PyMuPDF + python-docx |
| **API Client** | 调用翻译大模型 API | Node.js（主进程内） |

---

## 2. 核心模块详细设计

### 2.1 模块 A — 文档解析引擎

#### PDF 解析选型

| 库 | 语言 | 优势 | 劣势 | 推荐 |
|----|------|------|------|------|
| **PyMuPDF (fitz)** | Python | 速度快、API 丰富、支持文字/图片/表格提取 | GPL 许可证 | ⭐ MVP 首选 |
| **pdfplumber** | Python | 表格提取能力强、精度高 | 速度较慢 | 表格补充 |
| **pdf.js** | JS | 纯前端、无需 Python | 功能有限、无表格提取 | 预览用 |

**推荐方案：PyMuPDF 主力 + pdfplumber 表格补充**

```python
# PDF 解析流程
class PDFParser:
    def parse(self, pdf_path: str) -> DocumentModel:
        """解析 PDF 为标准化中间格式"""
        doc = fitz.open(pdf_path)
        model = DocumentModel()

        for page_num, page in enumerate(doc):
            # 1. 提取文本块（含位置、字体、大小信息）
            blocks = page.get_text("dict")["blocks"]

            # 2. 提取表格（pdfplumber 补充）
            tables = pdfplumber.open(pdf_path).pages[page_num].extract_tables()

            # 3. 提取图片
            images = page.get_images(full=True)

            # 4. 构建页面模型
            page_model = PageModel(
                blocks=self._parse_blocks(blocks),
                tables=self._parse_tables(tables),
                images=self._parse_images(images),
                width=page.rect.width,
                height=page.rect.height
            )
            model.pages.append(page_model)

        return model
```

#### Word 解析选型

| 库 | 语言 | 优势 | 劣势 | 推荐 |
|----|------|------|------|------|
| **python-docx** | Python | 成熟稳定、API 完善、样式保留好 | 复杂格式支持有限 | ⭐ 首选 |
| **mammoth.js** | JS | 纯 JS、HTML 转换方便 | 不支持回写 | 预览用 |
| **docxtemplater** | JS | 模板渲染能力强 | 解析能力弱 | 输出用 |

**推荐方案：python-docx 解析 + python-docx 回写**

```python
# Word 解析流程
class WordParser:
    def parse(self, docx_path: str) -> DocumentModel:
        """解析 Word 为标准化中间格式"""
        doc = Document(docx_path)
        model = DocumentModel()

        for para in doc.paragraphs:
            style = self._extract_para_style(para)
            runs = self._extract_runs(para)
            model.paragraphs.append(ParagraphModel(
                text=para.text, style=style, runs=runs, level=para.style.name
            ))

        for table in doc.tables:
            model.tables.append(self._parse_table(table))

        model.headers = self._extract_headers(doc)
        model.footers = self._extract_footers(doc)
        return model
```

#### 扫描版 PDF OCR

| 库 | 语言 | 优势 | 劣势 | 推荐 |
|----|------|------|------|------|
| **PaddleOCR** | Python | 中文识别优秀、版面分析强 | 模型大（~100MB） | ⭐ 首选 |
| **Tesseract** | Python/C++ | 开源老牌 | 中文识别弱、需训练 | 备选 |
| **商业 OCR API** | HTTP | 识别率最高 | 按次收费、隐私问题 | 补充 |

**推荐方案：PaddleOCR（本地离线）+ 版面分析**

```python
class OCREngine:
    def __init__(self):
        self.ocr = PaddleOCR(use_angle_cls=True, lang='ch')
        self.layout_analyzer = PPStructure()

    def process(self, image_path: str) -> PageModel:
        layout = self.layout_analyzer(image_path)
        for region in layout:
            if region['type'] == 'text':
                result = self.ocr.ocr(region['img'])
                region['text'] = self._format_ocr_result(result)
            elif region['type'] == 'table':
                result = self.ocr.ocr(region['img'])
                region['table'] = self._parse_table_from_ocr(result)
        return self._build_page_model(layout)
```

### 2.2 模块 B — 翻译引擎（国内引擎优先）

#### 设计原则

- **全部使用国内引擎**：国内直连，无需翻墙，延迟低，无合规风险
- **OpenAI 兼容格式**：绝大多数国内引擎兼容 OpenAI API，一套代码适配所有
- **用户友好**：支持支付宝/微信充值，注册即送免费额度

#### 国内引擎对比

| 引擎 | 厂商 | 模型 | 输入价格 | 输出价格 | 中文质量 | 长文本 |
|------|------|------|---------|---------|---------|--------|
| **DeepSeek** | 深度求索 | deepseek-chat | ¥1/百万 | ¥2/百万 | ⭐⭐⭐⭐⭐ | 128K |
| **通义千问** | 阿里 | qwen-plus | ¥0.8/百万 | ¥2/百万 | ⭐⭐⭐⭐⭐ | 128K |
| **智谱 GLM** | 智谱 AI | glm-4-flash | ¥0.1/百万 | ¥0.1/百万 | ⭐⭐⭐⭐ | 128K |
| **Moonshot** | 月之暗面 | moonshot-v1-8k | ¥1/百万 | ¥1/百万 | ⭐⭐⭐⭐ | 128K |
| **百川** | 百川智能 | Baichuan4 | ¥1/百万 | ¥1/百万 | ⭐⭐⭐⭐ | 32K |
| **硅基流动** | SiliconFlow | 多模型聚合 | 按模型 | 按模型 | ⭐⭐⭐⭐ | 按模型 |

#### 引擎优先级

```
默认推荐（性价比之王）
├── DeepSeek        — 综合最优，中文质量高，价格极低
├── 通义千问         — 阿里云背书，稳定性最好
└── 智谱 GLM-Flash   — 极致低价（¥0.1/百万），适合大量翻译

进阶选择（特定场景）
├── Moonshot         — 长文档能力强（128K 上下文）
├── 百川 Baichuan    — 中文文学性翻译优秀
└── 硅基流动         — 聚合平台，一个 Key 用多个模型

自定义扩展
└── 自定义 OpenAI 兼容引擎 — 用户手动配置 baseUrl + model
```

#### 多模型适配层

```typescript
interface TranslationProvider {
  name: string;
  translate(text: string, options: TranslateOptions): Promise<string>;
  translateBatch(texts: string[], options: TranslateOptions): Promise<string[]>;
  testConnection(apiKey: string): Promise<boolean>;
  estimateCost(texts: string[]): number;
}

interface TranslateOptions {
  style: 'academic' | 'business' | 'casual';
  termTable?: TermTable;
  context?: string;
  maxTokens?: number;
}

// OpenAI 兼容适配器 — 一个适配器覆盖所有国内引擎
class OpenAICompatibleProvider implements TranslationProvider {
  constructor(
    private config: {
      name: string;
      baseUrl: string;
      model: string;
      inputPrice: number;   // 元/百万 token
      outputPrice: number;
    }
  ) {}

  async translate(text: string, options: TranslateOptions): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: this.buildSystemPrompt(options) },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
        max_tokens: 4096
      })
    });
    const data = await response.json();
    return data.choices[0].message.content;
  }
}

// 引擎注册表
const ENGINE_REGISTRY = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    inputPrice: 1,
    outputPrice: 2,
    description: '综合最优，中文翻译质量高',
    recommend: true
  },
  qwen: {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    inputPrice: 0.8,
    outputPrice: 2,
    description: '阿里云背书，稳定性最好',
    recommend: true
  },
  glm: {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    inputPrice: 0.1,
    outputPrice: 0.1,
    description: '极致低价，适合大量翻译',
    recommend: true
  },
  moonshot: {
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    inputPrice: 1,
    outputPrice: 1,
    description: '长文档能力强，适合大文件'
  },
  baichuan: {
    name: '百川大模型',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    model: 'Baichuan4',
    inputPrice: 1,
    outputPrice: 1,
    description: '中文文学性翻译优秀'
  },
  siliconflow: {
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
    inputPrice: 0.5,
    outputPrice: 1,
    description: '聚合平台，一个 Key 用多个模型'
  }
};

// 翻译引擎管理器
class TranslationEngine {
  private providers: Map<string, OpenAICompatibleProvider> = new Map();

  constructor() {
    for (const [key, config] of Object.entries(ENGINE_REGISTRY)) {
      this.providers.set(key, new OpenAICompatibleProvider(config));
    }
  }

  async translate(text: string, engine: string, options: TranslateOptions): Promise<string> {
    const provider = this.providers.get(engine);
    if (!provider) throw new Error(`Unknown engine: ${engine}`);
    return provider.translate(text, options);
  }

  getRecommendedEngines(): EngineInfo[] {
    return Object.entries(ENGINE_REGISTRY)
      .filter(([_, config]) => config.recommend)
      .map(([key, config]) => ({ key, ...config }));
  }
}
```

#### 翻译策略

**长文本分段：**
- 长度 ≤ 2000 token → 直接翻译
- 长度 > 2000 token → 按句子边界分段，每段 ≤ 1500 token，前后段保留 200 token 重叠

**表格翻译：**
- 逐单元格翻译，保持表格结构标记
- 数字/公式/单位不翻译，原样保留
- 表头单独翻译，注入上下文说明

**术语表注入 Prompt：**
```
你是一位专业的英译中文档翻译专家。请将以下英文文档翻译为中文。
翻译风格：{style_description}
必须严格遵守以下术语表：{term_table_entries}
```

#### 成本对比（10 页 A4 文档，约 5000 中文字）

| 引擎 | 输入 token | 输出 token | 总成本 | 性价比排名 |
|------|-----------|-----------|--------|-----------|
| 智谱 GLM-Flash | ~8000 | ~6000 | **¥0.0014** | 🥇 |
| 硅基流动 (DeepSeek) | ~8000 | ~6000 | ¥0.01 | 🥈 |
| DeepSeek | ~8000 | ~6000 | ¥0.02 | 🥉 |
| 通义千问 | ~8000 | ~6000 | ¥0.02 | 🥉 |
| Moonshot | ~8000 | ~6000 | ¥0.02 | — |
| 百川 | ~8000 | ~6000 | ¥0.02 | — |

> **结论**：国内引擎翻译 10 页文档成本不到 ¥0.02，即使翻译 100 页也只需 ¥0.20。

#### API Key 获取引导

| 引擎 | 注册地址 | 免费额度 | 充值方式 |
|------|---------|---------|---------|
| DeepSeek | platform.deepseek.com | 注册送 ¥5 | 支付宝/微信 |
| 通义千问 | dashscope.console.aliyun.com | 注册送 100 万 token | 支付宝 |
| 智谱 GLM | open.bigmodel.cn | 注册送 500 万 token | 支付宝/微信 |
| Moonshot | platform.moonshot.cn | 注册送 ¥15 | 支付宝/微信 |
| 百川 | platform.baichuan-ai.com | 注册送 ¥5 | 支付宝 |
| 硅基流动 | cloud.siliconflow.cn | 注册送 ¥14 | 支付宝/微信 |

### 2.3 模块 C — 排版重建引擎

#### PDF 输出：ReportLab（精确排版控制）
#### Word 输出：python-docx 回写（在原文档基础上替换文本，保持所有格式）

#### 中文字体处理

```python
class FontManager:
    BUNDLED_FONTS = {
        'NotoSansSC-Regular': 'fonts/NotoSansSC-Regular.otf',
        'NotoSansSC-Bold': 'fonts/NotoSansSC-Bold.otf',
    }

    FONT_MAPPING = {
        'Arial': 'NotoSansSC',
        'Helvetica': 'NotoSansSC',
        'Times New Roman': 'NotoSansSC',
        'Calibri': 'NotoSansSC',
        'Cambria': 'NotoSansSC',
    }
```

### 2.4 模块 D — 文件 I/O 和批处理

- **大文件分片处理**：每次处理 20 页，处理完释放内存，动态调整分片大小
- **批量任务队列**：最大并发 2 个任务，失败自动重试，单文件失败不影响其他

---

## 3. 数据流设计

```
用户上传文件 → 文件验证 → 文档解析引擎 → DocumentModel (JSON)
    → 提取待翻译文本 + 术语表注入 → 翻译引擎 (API 调用)
    → 翻译结果映射 → 排版重建引擎 → 输出文件 (.docx/.pdf)
```

### 中间数据结构 (DocumentModel)

```json
{
  "meta": { "sourceFile": "report.pdf", "format": "pdf", "pages": 50 },
  "pages": [{
    "pageNumber": 1,
    "blocks": [{
      "id": "block_001",
      "type": "heading",
      "text": "Annual Report 2024",
      "position": { "x": 72, "y": 100, "width": 451, "height": 36 },
      "style": { "fontFamily": "Arial", "fontSize": 22, "bold": true }
    }],
    "tables": [{ "id": "table_001", "rows": 5, "cols": 4, "cells": [...] }],
    "images": [{ "id": "img_001", "position": {...} }]
  }],
  "translations": { "block_001": "2024 年度报告" }
}
```

### 错误处理

| 错误码 | 处理策略 |
|--------|---------|
| `API_RATE_LIMITED` | 指数退避重试，最多 3 次 |
| `API_QUOTA_EXCEEDED` | 提示用户充值或切换自备 Key |
| `API_TIMEOUT` | 5 秒后重试，最多 3 次 |
| `FILE_FORMAT_UNSUPPORTED` | 终止，提示支持的格式 |
| `LICENSE_EXPIRED` | 跳转激活页面 |

---

## 4. 性能设计

- **并行翻译**：最多 3 个并发 API 请求
- **大文件内存控制**：分片处理 + 主动 GC，内存上限 512MB
- **进度预估**：加权平均算法，最近 10 个样本，最近的权重更高

---

## 5. 技术栈推荐清单

### 前端（渲染进程）

| 类别 | 推荐 |
|------|------|
| 框架 | React 18 + TypeScript |
| 状态管理 | Zustand |
| UI 组件 | Radix UI + Tailwind CSS |
| 构建工具 | Vite |

### 后端（主进程 + Python Worker）

| 类别 | 推荐 |
|------|------|
| 运行时 | Node.js 20 LTS |
| Python | Python 3.11 embedded |
| PDF 解析 | PyMuPDF + pdfplumber |
| Word 处理 | python-docx |
| OCR | PaddleOCR |
| PDF 生成 | ReportLab |
| 数据库 | better-sqlite3 |

### 打包和分发

| 类别 | 推荐 |
|------|------|
| 打包 | electron-builder |
| 自动更新 | electron-updater |
| 安装包 | NSIS (Windows) |
| 代码混淆 | javascript-obfuscator |

---

## 6. 项目目录结构

```
english-to-china-translator/
├── src/
│   ├── main/                     # Electron 主进程
│   │   ├── index.ts
│   │   ├── ipc/                  # IPC 处理器
│   │   ├── services/             # 业务服务
│   │   ├── workers/              # Python Worker 管理
│   │   └── database/             # SQLite 数据库
│   ├── renderer/                 # 渲染进程 (React)
│   │   ├── components/
│   │   ├── stores/
│   │   └── hooks/
│   └── shared/                   # 共享类型
├── python/                       # Python 后端
│   ├── parsers/
│   ├── translators/
│   ├── rebuilders/
│   └── ocr/
├── resources/                    # 打包资源
├── package.json
└── requirements.txt
```

---

## 7. 实施路线

| 阶段 | 周期 | 内容 |
|------|------|------|
| Phase 1 | 1 周 | Electron + React + Vite 项目初始化，IPC 框架，Python Worker 集成 |
| Phase 2 | 3-4 周 | Word 翻译 MVP，翻译引擎适配层，进度展示，术语表基础 |
| Phase 3 | 2-3 周 | PDF 翻译，复杂表格，批量队列，历史和设置 |
| Phase 4 | 2-3 周 | OCR，授权系统，自动更新，代码混淆和打包 |
