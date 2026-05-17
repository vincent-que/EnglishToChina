# Codex 开发交接摘要

> 用途：新一轮 Codex 对话读取本文件后，可快速接续当前项目开发。  
> 项目路径：`D:\project\xyWorkspace\EnglishToChina`

## 1. 项目概况

当前项目是一个 Electron + React + TypeScript + Python Worker 的英文文档转中文桌面工具。

目标：

- 输入英文 PDF / Word。
- 输出尽量保持原排版的中文 Word / PDF。
- 支持 Kimi 等 OpenAI-compatible 国内模型。
- 支持术语表、历史记录、任务队列、永久记忆和本地授权壳。

## 2. 当前开发原则

后续 Codex 默认采用省 token 高效率模式：

- 优先用 `rg` 精准定位，不泛读全工程。
- 小步高收益修改，避免大面积重写。
- 子 agent 只用于窄范围检查。
- 普通改动只跑必要验证：`typecheck` / `build` / Python 编译。
- 不反复打包，关键节点再打包。
- 不重复长篇解释上下文。
- 特殊情况先请示。

## 3. 已完成功能

### 翻译主链路

- PDF / DOCX 可进入解析、翻译、重建流程。
- PDF 优先走 `pdf2docx -> WordParser -> 翻译 -> WordRebuilder/PDFRebuilder`。
- Python Worker 支持 parse / translate / rebuild / pipeline。
- 翻译进度可从 Python Worker 回传主进程并更新 UI。

### 翻译引擎

- 默认引擎为 Kimi。
- 已支持 DeepSeek、通义千问、GLM、Moonshot/Kimi、百川、硅基流动等 OpenAI-compatible 接口。
- API 调用失败会抛错，不再静默返回英文原文。
- 设置页支持 API Key 测试连接。

### 设置与安全

- API Key 支持显示/隐藏。
- API Key 优先使用 Electron `safeStorage` 加密保存。
- 若系统安全存储不可用，会回退为普通本地保存。
- 设置页支持运行环境自检。

### 术语表

- 支持 CSV / TSV / TXT / JSON 导入。
- 支持选择术语表参与翻译。
- 术语表会传入 Python 翻译引擎。

### 历史与任务

- 翻译历史本地 JSON 持久化。
- 支持删除记录。
- 支持清空历史。
- 支持打开输出目录。
- 失败任务支持重试。
- 支持并发队列，受 `concurrentLimit` 控制。

### 永久记忆 Agent Phase 1

已实现基础版，用于减少模型 token：

- 新增 `src/main/services/memory.service.ts`。
- 短文本翻译缓存。
- 当前文档术语按需注入，避免完整术语表塞入 prompt。
- Python 翻译层会跳过已有缓存译文。
- 设置页支持永久记忆开关、缓存数量展示、清空记忆。
- 缓存文件位于 `userData/memory/translation-cache.json`。

### 授权系统

- 已删除设备指纹采集、设备绑定、设备管理相关设计和代码口径。
- 授权系统采用无设备指纹设计。
- 已新增 `LicenseService` 本地服务壳。
- 支持授权码格式校验。
- 支持本地待验证授权状态缓存。
- 尚未接入真实授权服务器和签名令牌校验。

### UI 文案

- 主界面、侧边栏、工作台、设置页、预览页、激活页主要乱码已清理。
- 最近一次源码乱码扫描无命中。

## 4. 关键文件

主进程：

- `src/main/index.ts`
- `src/main/ipc/handlers.ts`
- `src/main/workers/python-worker.ts`
- `src/main/services/translate.service.ts`
- `src/main/services/memory.service.ts`
- `src/main/services/settings.service.ts`
- `src/main/services/license.service.ts`
- `src/main/services/term.service.ts`
- `src/main/services/file.service.ts`

渲染进程：

- `src/renderer/pages/Workspace.tsx`
- `src/renderer/pages/Settings.tsx`
- `src/renderer/pages/Activation.tsx`
- `src/renderer/pages/Preview.tsx`
- `src/renderer/components/Sidebar.tsx`
- `src/renderer/hooks/use-electron-api.ts`
- `src/renderer/stores/translation-store.ts`
- `src/renderer/global.d.ts`

共享类型：

- `src/shared/types.ts`
- `src/shared/constants.ts`
- `src/shared/ipc-channels.ts`

Python：

- `python/worker.py`
- `python/pipeline.py`
- `python/translators/engine.py`
- `python/parsers/pdf_parser.py`
- `python/parsers/word_parser.py`
- `python/rebuilders/word_rebuilder.py`
- `python/rebuilders/pdf_rebuilder.py`

设计文档：

- `design/11-current-version-backlog.md`
- `design/12-permanent-memory-agent.md`
- `design/13-codex-handoff-summary.md`

## 5. 最近验证状态

最近一轮已通过：

```powershell
npm.cmd run typecheck
npm.cmd run build
python -m py_compile python\worker.py python\translators\engine.py python\rebuilders\pdf_rebuilder.py
```

源码乱码扫描最近无命中：

```powershell
rg "璇|鏂|涓|閿|鎵|娴|鑷|缈|鎺|楼|鈥|�" src python package.json requirements.txt -n
```

注意：最近一次“失败任务重试 + 工作台乱码清理”后只做了构建验证，未重新打包。

## 6. 当前产物

已有本地免安装包：

- `release/win-unpacked/英文转中文翻译工具.exe`
- `release/EnglishToChina-win-unpacked.zip`

注意：

- 该包适合本机测试。
- 尚不是正式可发版。
- 主要原因：Python embedded runtime、正式安装器、授权服务器、字体资源仍未完成。

## 7. 已知未完成事项

P0：

- 打包 Python embedded runtime 和依赖，解决无 Python 环境电脑不可用。
- 中文字体资源打包。
- 授权服务器和签名令牌校验。

P1：

- OCR 扫描版 PDF。
- PDF 高保真回归测试。
- NSIS 正式安装包，目前受 `winCodeSign` 下载/签名问题影响。
- 永久记忆 Agent Phase 2：文档摘要记忆、候选术语学习。

P2：

- SQLite 替代 JSON 存储。
- 记忆导入/导出。
- 自动更新。
- 崩溃日志和用户可控诊断信息。

## 8. 推荐下一步

建议优先做：

1. Python embedded runtime 打包方案。
2. 字体资源检查和打包。
3. 重新生成 `win-unpacked` 并在无系统 Python 环境下验证。

原因：

- 这是当前小范围试用的最大阻塞。
- 不依赖授权服务器。
- 不需要引入 OCR 大依赖。
- 能直接提升交付可用性。

## 9. 注意事项

- 不要恢复设备指纹、设备绑定、设备管理设计。
- 不要把用户 API Key 写进代码或文档。
- 不要大面积重写已稳定链路。
- 打包时优先使用：

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx.cmd electron-builder --win --dir --config.win.signAndEditExecutable=false
```

常规 `npm run dist:win` 可能因 `winCodeSign` 下载失败而失败。

