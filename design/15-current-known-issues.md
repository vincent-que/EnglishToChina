# 当前问题记录

日期：2026-05-18

## 1. Kimi 单句可用，但文档翻译偶发 overloaded

现象：

- `npm.cmd run server:smoke -- http://127.0.0.1:8787 <授权码> "Hello world"` 可以成功返回中文译文。
- 客户端上传文档后，某些任务失败，错误类似：

```text
All upstream models failed: moonshot-v1-8k: The engine is currently overloaded, please try again later
```

已确认：

- 本地代理地址可用。
- 月度授权码校验可用。
- Kimi/Moonshot API Key 可用。
- 单句 `/api/translate` 可用。
- 失败发生在文档翻译的多段连续请求阶段。

判断：

- 这不是文件上传、解析、授权、服务端地址配置问题。
- 更可能是文档翻译连续调用上游模型时触发 Moonshot 临时过载或限流。
- 当前服务端已有模型池 fallback 能力，但本地测试配置中 `modelPoolSize` 为 1，只有 `moonshot-v1-8k` 一个上游模型，因此没有备用模型可切换。

后续建议：

1. 在服务端 `/api/translate` 增加临时错误重试退避。
   - 识别 `overloaded`、`429`、`503`、网络瞬断。
   - 建议最多重试 3 次：1s、2s、4s。
2. 客户端服务端翻译逐段调用时增加轻微限速。
   - 每段之间等待 200-500ms。
   - 避免文档拆段后瞬间连续打满上游。
3. 错误文案改为客户可读中文。
   - 例如：`模型当前繁忙，已自动重试 3 次，请稍后重试。`
4. 正式服务端配置 `MODEL_POOL`。
   - 至少配置第二个模型或备用 Key。
   - 当前单模型配置无法规避上游短时拥堵。

注意：

- 不要把任何用户 API Key 写入代码、文档、日志或提交记录。
- 后续调试真实上游时，Key 只通过当前进程环境变量传入。

## 2. 客户端提示“翻译服务地址未配置”

现象：

- 即使包内存在 `customer-config.json`，旧本地设置中保存过空 `proxyServerUrl` 时，客户端仍提示：

```text
翻译服务地址未配置，请联系管理员更新客户版配置
```

已处理：

- 新增 `resources/customer-config.json`，当前本机测试默认地址为：

```json
{
  "proxyServerUrl": "http://127.0.0.1:8787"
}
```

- `SettingsService` 支持读取：
  - `resources/customer-config.json`
  - `resources/resources/customer-config.json`
- 当客户默认地址存在、旧本地设置中的 `proxyServerUrl` 为空时，会自动使用客户默认地址。
- 如果用户手动填了非空服务端地址，仍然优先使用用户设置。

验证：

- `tests/customer-config.test.js` 覆盖了配置文件读取和空本地设置回退逻辑。
