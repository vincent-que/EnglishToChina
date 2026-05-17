# 英文转中文翻译工具 — 项目开发状态报告

> 生成日期：2026-05-17
> 基于源码逐文件审查，对照 CLAUDE.md 设计文档与开发阶段规划

---

## 一、项目总览

| 维度 | 状态 |
|------|------|
| 当前阶段 | Phase 1 完成，Phase 2 核心流程跑通，后续阶段未启动 |
| 代码骨架 | 完整（Electron + React + Python 三层架构已搭建） |
| 核心翻译链路 | 可运行（解析 → 翻译 → 重建） |
| 商业化功能 | 未实现（授权、OCR、术语表管理等） |
| 可发布状态 | 不可发布（缺少授权系统、字体资源、应用图标） |

---

## 二、已完成模块清单

### 2.1 Electron 主进程

| 文件 | 功能 | 状态 |
|------|------|------|
| `src/main/index.ts` | 应用入口、窗口管理、生命周期 | 完整 |
| `src/main/preload.ts` | IPC 桥接，暴露 electronAPI 到渲染进程 | 完整 |
| `src/main/ipc/handlers.ts` | 注册所有 IPC 处理器 | 框架完整，部分为 stub |
| `src/main/services/translate.service.ts` | 翻译任务调度（parse → translate → rebuild） | 完整 |
| `src/main/services/file.service.ts` | 文件操作（输出路径、存在检查） | 完整 |
| `src/main/services/settings.service.ts` | 设置持久化（JSON 文件读写） | 完整 |
| `src/main/workers/python-worker.ts` | Python 子进程管理（spawn、stdin/stdout 协议） | 完整 |

### 2.2 React 渲染进程

| 文件 | 功能 | 状态 |
|------|------|------|
| `src/renderer/App.tsx` | 根组件，页面路由切换 | 完整 |
| `src/renderer/components/Sidebar.tsx` | 侧边栏导航（4个页面入口 + 暗色模式切换） | 完整 |
| `src/renderer/pages/Workspace.tsx` | 工作台（拖拽上传、任务列表、进度展示） | 完整 |
| `src/renderer/pages/Settings.tsx` | 设置页（引擎选择、API Key、测试连接、翻译风格、输出格式） | 基本完整 |
| `src/renderer/pages/Preview.tsx` | 翻译预览页（已完成任务列表、打开文件） | 完整 |
| `src/renderer/pages/Activation.tsx` | 激活页（授权码输入、状态展示） | UI 完整，后端为 stub |
| `src/renderer/stores/theme-store.ts` | 主题状态管理（亮/暗切换） | 完整 |
| `src/renderer/stores/translation-store.ts` | 翻译任务状态管理 | 完整 |
| `src/renderer/hooks/use-electron-api.ts` | Electron API 封装 Hook | 完整 |
| `src/renderer/styles/global.css` | 全局 CSS 变量与基础样式 | 完整 |

### 2.3 共享层

| 文件 | 功能 | 状态 |
|------|------|------|
| `src/shared/types.ts` | 全部 TypeScript 接口定义 | 完整 |
| `src/shared/constants.ts` | 引擎注册表、样式标签、默认设置 | 完整 |
| `src/shared/ipc-channels.ts` | IPC 通道名常量 | 完整 |

### 2.4 Python 后端

| 文件 | 功能 | 状态 |
|------|------|------|
| `python/worker.py` | Worker 入口，stdin/stdout JSON 协议 | 完整 |
| `python/pipeline.py` | 全流程编排（Parse → Translate → Rebuild） | 完整 |
| `python/parsers/word_parser.py` | DOCX 解析（段落、表格、合并单元格检测） | 完整 |
| `python/parsers/pdf_parser.py` | PDF 解析（pdf2docx 转换后委托 WordParser） | 完整 |
| `python/translators/engine.py` | 翻译引擎（6 国内引擎、分段、重试、跳过逻辑） | 完整 |
| `python/rebuilders/word_rebuilder.py` | DOCX 重建（run-level 格式保留） | 完整 |
| `python/rebuilders/pdf_rebuilder.py` | PDF 重建（docx2pdf / LibreOffice / ReportLab 三级降级） | 完整 |

### 2.5 配置与构建

| 文件 | 功能 | 状态 |
|------|------|------|
| `package.json` | 依赖、脚本、electron-builder 配置 | 完整 |
| `vite.config.ts` | Vite 构建配置（React 插件、路径别名） | 完整 |
| `tsconfig.json` / `tsconfig.main.json` / `tsconfig.renderer.json` | TypeScript 配置 | 完整 |
| `requirements.txt` | Python 依赖清单 | 完整 |

---

## 三、未开发模块清单

### 3.1 核心功能缺口

#### 3.1.1 翻译进度未实时传递到 UI

- **位置**：`translate.service.ts` + `python-worker.ts`
- **现状**：Python 的 `progress_callback` 仅写 stderr 日志，TranslateService 在阶段切换时发送固定百分比（5% → 20% → 80% → 100%），无法反映实际翻译进度
- **影响**：用户体验差，大文件翻译时进度条长时间不动
- **修复方向**：Python worker 通过 stdout 输出 progress 事件，Node 端解析后实时转发到渲染进程

#### 3.1.2 术语表注入为空壳

- **位置**：`python/translators/engine.py` → `_build_system_prompt()`
- **现状**：术语表仅拼接名称字符串到 prompt，未注入实际的术语对照内容（如 "computer → 计算机"）
- **影响**：术语表功能名存实亡
- **修复方向**：从数据库或文件读取术语条目，格式化为 prompt 注入内容

#### 3.1.3 批量队列并发控制缺失

- **位置**：`translate.service.ts`
- **现状**：`MAX_CONCURRENT_TRANSLATIONS = 3` 已定义但未实现，每个翻译任务立即启动
- **影响**：批量翻译时可能同时发起多个 API 请求，导致限流或内存溢出
- **修复方向**：实现任务队列，控制同时运行的翻译任务数

### 3.2 商业化功能缺口

#### 3.2.1 授权系统完全未实现

- **缺失文件**：`src/main/services/license.service.ts`
- **涉及模块**：
  - 授权码激活与签名令牌校验（`design/07-anti-piracy-license.md`）
  - 授权码格式与验证逻辑（§4）
  - 授权服务器 API 对接（§9.3）
  - 离线宽限期机制（§7）
  - 输出文档水印方案（§5）
- **现状**：`license:activate` 固定返回 `{ success: false }`，`license:validate` 固定返回 trial 状态
- **影响**：无法进行商业化销售

#### 3.2.2 OCR 模块未实现

- **缺失文件**：`python/ocr/ocr_engine.py`
- **现状**：`python/ocr/__init__.py` 为空，无任何 OCR 代码
- **影响**：扫描版 PDF（图片型）无法翻译
- **依赖**：PaddleOCR（requirements.txt 中未列出）

#### 3.2.3 术语表管理未实现

- **现状**：`term:getList` 返回空数组，`term:import` 返回空对象
- **缺失**：术语表 CRUD、导入/导出、数据库存储
- **影响**：用户无法自定义专业术语对照

#### 3.2.4 SQLite 数据库未搭建

- **缺失目录**：`src/main/database/`
- **缺失功能**：翻译历史持久化、术语表存储、用户配置存储
- **现状**：翻译历史仅存内存（`tasks` Map），重启后丢失

#### 3.2.5 自动更新检查未实现

- **现状**：`app:checkUpdate` 固定返回 `{ hasUpdate: false }`
- **缺失**：更新服务器对接、版本比对、下载更新逻辑

### 3.3 资源文件缺失

| 资源 | 路径 | 影响 |
|------|------|------|
| 应用图标 | `resources/icon.ico` | electron-builder 打包失败 |
| 中文字体 | `resources/fonts/NotoSansSC-Regular.otf` | PDF Rebuilder 的 ReportLab 纯 Python 方案无法渲染中文 |
| Python 嵌入式运行时 | `python-embedded/` | 打包后无法独立运行（依赖用户系统 Python） |

### 3.4 页面/功能未实现

| 页面 | 设计稿 | 状态 |
|------|--------|------|
| 偏好设置 | `design/05-preferences.html` | 有设计稿，无代码实现 |

---

## 四、代码质量问题

### 4.1 日志乱码

**位置**：`python/rebuilders/pdf_rebuilder.py`

多处日志输出包含乱码中文字符：

```python
# 第 173 行
logger.debug('ReportLab 鎴?python-docx 鏈畨瑁? %s', e)
# 第 178 行
logger.warning('鏃犳硶娉ㄥ唽涓枃瀛椾綋')
# 第 337 行
logger.info('绾?Python PDF 娓叉煋瀹屾垚: %s', pdf_path)
```

**原因**：开发环境下文件编码不一致导致。需统一为 UTF-8 并修复乱码字符串。

### 4.2 错误处理未统一

**设计要求**：使用 `AppError` 类，统一错误码体系（`API_TIMEOUT`、`FILE_FORMAT_UNSUPPORTED` 等）

**现状**：代码中直接 `throw new Error()`，未使用 `AppError` 接口。`TranslationTask.error` 字段虽然类型定义了 `AppError`，但实际赋值时字段不完整。

### 4.3 暗色模式 CSS 不完整

**现状**：`data-theme="dark"` 选择器已设置，`global.css` 中定义了暗色模式 CSS 变量，但各组件的内联 `<style>` 块中大量使用 CSS 变量，未验证暗色模式下的视觉效果。

---

## 五、开发阶段对照表

| 阶段 | 计划周期 | 计划内容 | 实际完成度 |
|------|---------|---------|-----------|
| Phase 1 | 1 周 | Electron + React + Vite 初始化，IPC 框架，Python Worker | **95%** — 仅缺数据库模块 |
| Phase 2 | 3-4 周 | Word 翻译 MVP，翻译引擎适配，进度展示 | **70%** — 核心流程跑通，进度实时传递、术语表注入、并发控制未完成 |
| Phase 3 | 2-3 周 | PDF 翻译，复杂表格，批量队列，设置页 | **50%** — PDF 翻译可运行，批量队列和偏好设置页未实现 |
| Phase 4 | 2-3 周 | OCR，授权系统，代码混淆，打包 | **5%** — 仅有 UI 壳，后端全部未实现 |

---

## 六、建议开发优先级

### P0 — 发布阻塞项（必须完成）

| 序号 | 任务 | 预估工时 | 说明 |
|------|------|---------|------|
| 1 | 补充中文字体资源 (Noto Sans SC) | 0.5 天 | PDF 输出依赖 |
| 2 | 设计并添加应用图标 (icon.ico) | 0.5 天 | 打包依赖 |
| 3 | 修复翻译进度实时传递 | 0.5 天 | 用户体验核心 |
| 4 | 实现授权系统 (license.service) | 3-5 天 | 商业化前提 |
| 5 | 打包测试 (electron-builder) | 1 天 | 验证端到端流程 |

### P1 — 核心体验提升

| 序号 | 任务 | 预估工时 | 说明 |
|------|------|---------|------|
| 6 | 术语表管理功能（CRUD + 注入） | 1-2 天 | 专业用户需求 |
| 7 | SQLite 数据库搭建 | 1-2 天 | 历史记录持久化 |
| 8 | 修复 PDF Rebuilder 日志乱码 | 0.5 天 | 代码质量 |
| 9 | 统一错误处理 (AppError) | 1 天 | 代码质量 |

### P2 — 功能完善

| 序号 | 任务 | 预估工时 | 说明 |
|------|------|---------|------|
| 10 | OCR 模块 (PaddleOCR) | 2-3 天 | 扫描版 PDF 支持 |
| 11 | 偏好设置页面 | 1 天 | UI 完整性 |
| 12 | 暗色模式 CSS 完善 | 1 天 | UI 完整性 |
| 13 | 批量队列并发控制 | 1 天 | 稳定性 |

### P3 — 发布后迭代

| 序号 | 任务 | 预估工时 | 说明 |
|------|------|---------|------|
| 14 | 自动更新检查 | 1-2 天 | 运营需求 |
| 15 | 代码混淆 + 安全加固 | 1-2 天 | 反破解 |
| 16 | Python 嵌入式运行时打包 | 1-2 天 | 安装包独立性 |

---

## 七、技术债务清单

| 序号 | 问题 | 文件 | 严重度 |
|------|------|------|--------|
| 1 | 日志乱码（UTF-8 编码问题） | `pdf_rebuilder.py` | 中 |
| 2 | Error 未使用 AppError 类型 | `translate.service.ts` / `handlers.ts` | 中 |
| 3 | TranslationTask.error 字段赋值不完整 | `translate.service.ts:44` | 低 |
| 4 | 暗色模式未完整覆盖 | 各组件内联 style | 低 |
| 5 | `electron-builder.yml` 嵌入 package.json 而非独立文件 | `package.json` | 低 |
