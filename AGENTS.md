# AGENTS.md

## 1. 项目基本信息

项目路径：`D:\project\xyWorkspace\EnglishToChina`

项目类型：Electron + React + TypeScript + Python Worker 桌面应用。

项目目标：

- 将英文 PDF / Word 文档翻译为中文。
- 尽量保持原文档排版、表格结构和输出格式。
- 支持输出 Word / PDF。
- 支持国内 OpenAI-compatible 大模型接口，当前默认 Kimi。
- 支持术语表、历史记录、任务队列、永久记忆和本地授权壳。

## 2. 后续 Codex 工作基准

后续开发默认采用“省 token、高效率、小步验证”的工作方式：

- 优先用 `rg` 精准检索，不泛读全工程。
- 只读取和当前任务相关的代码片段。
- 小步高收益修改，避免大面积重写。
- 子 agent 只用于窄范围检查，不做泛泛分析。
- 普通代码改动优先跑 `npm.cmd run typecheck`。
- 影响构建链路时再跑 `npm.cmd run build`。
- Python 改动跑 `python -m py_compile ...`。
- 不在每次小改后重新打包，关键节点再打包。
- 不重复解释已知上下文。
- 特殊情况、架构方向变更、可能高风险改动，先请示用户。

## 3. 重要约束

- 不要恢复设备指纹采集。
- 不要恢复设备绑定、设备管理、设备数量限制等设计。
- 不要把用户 API Key 写入代码、文档或日志。
- 不要使用破坏性 git / 文件命令。
- 不要随意删除用户已有改动。
- 不要为小功能做大规模重构。
- 手工编辑文件优先使用 `apply_patch`。

## 4. 当前已完成功能

### 4.1 翻译主链路

已实现：

- PDF / DOCX 解析。
- 文本翻译。
- Word / PDF 重建。
- Python Worker JSON line 通信。
- Python Worker 进度回传。
- 任务状态同步到前端。

PDF 当前主要链路：

```text
PDF -> pdf2docx -> WordParser -> TranslationEngine -> WordRebuilder / PDFRebuilder
```

### 4.2 翻译引擎

已支持：

- DeepSeek
- 通义千问
- GLM
- Moonshot / Kimi
- 百川
- 硅基流动

当前客户版默认翻译模式：服务端中转。`kimi` 仅作为本地备用模式中的可选引擎。

已完成：

- Kimi/Moonshot 兼容接口。
- API Key 测试连接。
- 翻译失败抛错，不再静默返回英文原文。
- 翻译结果会清理 `<text>` 包裹。

### 4.3 设置与安全

已完成：

- 设置页引擎选择。
- API Key 输入。
- API Key 显示 / 隐藏。
- API Key 测试连接。
- API Key 优先使用 Electron `safeStorage` 加密保存。
- 输出格式选择。
- 翻译风格选择。
- 运行环境自检。

注意：

- 如果系统安全存储不可用，API Key 会回退为普通本地保存。
- 后续可增加更明确的 UI 提示。

### 4.4 术语表

已完成：

- 支持 CSV / TSV / TXT / JSON 导入。
- 支持选择术语表。
- 翻译时注入术语。
- 永久记忆 Phase 1 中已支持“术语按需注入”，避免完整术语表全部进入 prompt。

### 4.5 任务与历史

已完成：

- 多文件任务队列。
- 并发限制：`concurrentLimit`。
- 翻译历史本地 JSON 持久化。
- 删除单条历史。
- 清空历史。
- 打开输出目录。
- 打开翻译结果文件。
- 失败任务支持重试。

### 4.6 永久记忆 Agent Phase 1

已实现本地永久记忆基础版，用于减少模型 token。

关键能力：

- 短文本翻译缓存。
- 当前文档术语按需注入。
- Python 翻译层跳过已有缓存译文。
- 设置页支持记忆开关。
- 设置页显示缓存数量。
- 设置页支持清空记忆。

关键文件：

- `src/main/services/memory.service.ts`
- `src/main/services/translate.service.ts`
- `python/translators/engine.py`
- `src/renderer/pages/Settings.tsx`

缓存位置：

```text
userData/memory/translation-cache.json
```

### 4.7 授权系统

当前授权系统已转向月度离线授权码，服务端翻译时仍需二次校验授权码。

已完成：

- 无设备指纹授权设计。
- 删除/改写设备指纹、设备绑定、设备管理相关内容。
- `LicenseService` 本地服务。
- 月度授权码格式校验。
- 授权有效期、剩余天数、本地状态缓存。
- 激活页接入本地授权壳。

未完成：

- 翻译服务端 API。
- 授权码服务端二次校验。
- 服务端模型池自动切换。
- 授权撤销与黑名单。

## 5. 关键文件索引

### 主进程

- `src/main/index.ts`
- `src/main/ipc/handlers.ts`
- `src/main/workers/python-worker.ts`
- `src/main/services/translate.service.ts`
- `src/main/services/memory.service.ts`
- `src/main/services/settings.service.ts`
- `src/main/services/license.service.ts`
- `src/main/services/term.service.ts`
- `src/main/services/file.service.ts`

### 渲染进程

- `src/renderer/pages/Workspace.tsx`
- `src/renderer/pages/Settings.tsx`
- `src/renderer/pages/Activation.tsx`
- `src/renderer/pages/Preview.tsx`
- `src/renderer/components/Sidebar.tsx`
- `src/renderer/hooks/use-electron-api.ts`
- `src/renderer/stores/translation-store.ts`
- `src/renderer/global.d.ts`

### 共享类型和常量

- `src/shared/types.ts`
- `src/shared/constants.ts`
- `src/shared/ipc-channels.ts`

### Python

- `python/worker.py`
- `python/pipeline.py`
- `python/translators/engine.py`
- `python/parsers/pdf_parser.py`
- `python/parsers/word_parser.py`
- `python/rebuilders/word_rebuilder.py`
- `python/rebuilders/pdf_rebuilder.py`

### 设计文档

- `design/11-current-version-backlog.md`
- `design/12-permanent-memory-agent.md`
- `design/13-codex-handoff-summary.md`
- `design/14-client-feedback-roadmap.md`

## 6. 最近验证命令

常用验证：

```powershell
npm.cmd run typecheck
npm.cmd run build
python -m py_compile python\worker.py python\translators\engine.py python\rebuilders\pdf_rebuilder.py
```

乱码扫描：

```powershell
rg "璇|鏂|涓|閿|鎵|娴|鑷|缈|鎺|楼|鈥|�" src python package.json requirements.txt -n
```

最近状态：

- `typecheck` 通过。
- `build` 通过。
- Python 编译检查通过。
- 源码乱码扫描无命中。

## 7. 当前打包状态

已有本地免安装目录包：

```text
release/win-unpacked/英文转中文翻译工具.exe
release/EnglishToChina-win-unpacked.zip
```

注意：

- 最近一次小改之后未重新打包。
- 当前包适合本机测试，不是正式发布版。
- 主要阻塞：Python embedded runtime、正式安装器、字体资源、授权服务器。

推荐打包命令：

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx.cmd electron-builder --win --dir --config.win.signAndEditExecutable=false
```

不要优先使用：

```powershell
npm.cmd run dist:win
```

原因：

- 该命令可能因 `winCodeSign` 下载或签名资源问题失败。

## 8. 当前主要未完成事项

P0：

- 配置并验证服务端翻译代理地址。
- 完成服务端 `/api/health`、`/api/translate`、`/api/license/validate`。
- 用有效月度授权码验证客户 ZIP 不填写模型 Key 也能翻译。
- 打包中文字体资源，并在无系统 Python 的 Windows 环境验证运行。

P1：

- 接入真实授权服务器。
- 实现签名授权令牌校验。
- 实现离线宽限期。
- OCR 扫描版 PDF。
- PDF 高保真视觉回归测试。
- NSIS 正式安装包。

P2：

- 永久记忆 Agent Phase 2：
  - 文档摘要记忆。
  - 候选术语学习。
  - 记忆导入/导出。
- SQLite 替代 JSON。
- 自动更新。
- 崩溃日志和诊断信息导出。

## 9. 推荐下一步

建议优先做：

1. 配置客户版翻译服务地址。
2. 实现并部署服务端模型池自动切换。
3. 用月度授权码跑通 DOCX/PDF 样例翻译。
4. 补充中文字体资源。
5. 重新生成客户 ZIP 并在干净 Windows 环境验证。

理由：

- 这是小范围试用的最大阻塞。
- 不依赖授权服务器。
- 不需要马上引入 OCR 大模型或 OCR 依赖。
- 能直接提升交付可用性。

## 10. 已知风险

- 没有内置 Python 时，目标电脑必须安装系统 Python。
- PDF 输出在没有 Word / LibreOffice / docx2pdf 能力时会走 ReportLab fallback，排版保真有限。
- 授权服务目前只是本地壳，不能用于正式商业发布。
- `design/11-current-version-backlog.md` 历史上存在编码显示问题，不建议为小功能大面积重写。
