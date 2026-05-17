# 授权与反滥用设计（隐私优先版）

> 当前版本不采集 MAC、CPU、硬盘序列号、主板序列号等硬件标识，不做本机绑定，也不提供终端管理列表。授权系统只围绕授权码、订单状态、签名授权令牌和离线宽限期实现。

## 1. 目标

授权系统用于降低安装包被直接转卖、授权码被公开分享、试用额度被滥用的风险，同时尽量减少隐私数据处理。

核心目标：

- 安装包可以公开分发，但核心功能需要有效授权或试用状态。
- 授权验证依赖服务端签发的短期签名令牌。
- 本地只缓存必要的授权状态，不保存硬件身份。
- 网络不可用时允许有限离线使用，避免影响正常客户。
- 服务端可以按授权码、订单、账户、异常调用量进行风控。

## 2. 授权模型

| 模式 | 说明 | 本地状态 |
| --- | --- | --- |
| 试用 | 默认可用，限制批量任务、并发和高级格式能力 | `trial` |
| 专业版 | 输入授权码并通过服务端验证后启用 | `active` |
| 过期 | 授权过期或订阅失效 | `expired` |
| 无效 | 授权码被撤销、格式错误或签名校验失败 | `invalid` |

客户端保存的授权信息：

```json
{
  "status": "active",
  "plan": "pro",
  "activatedAt": "2026-05-17T10:00:00.000Z",
  "expiresAt": "2027-05-17T10:00:00.000Z",
  "features": ["batch", "pdf", "docx", "term-table"],
  "token": "server-signed-token"
}
```

不保存：

- MAC 地址、CPU ID、硬盘序列号、主板序列号。
- 操作系统账户名、计算机名。
- 浏览器特征、硬件哈希或任何可用于唯一识别本机的组合标识。

## 3. 验证流程

### 3.1 首次激活

1. 用户输入授权码。
2. 客户端请求 `POST /license/activate`。
3. 服务端校验授权码、订单状态、过期时间和黑名单。
4. 服务端返回签名令牌和可用功能列表。
5. 客户端保存令牌，并进入 `active` 状态。

### 3.2 启动校验

1. 客户端读取本地签名令牌。
2. 先在本地校验签名、过期时间和功能列表。
3. 网络可用时调用 `POST /license/validate` 刷新状态。
4. 网络不可用时进入离线宽限期。

### 3.3 离线宽限期

- 专业版默认允许 7 天离线使用。
- 每次在线验证成功后刷新 `lastValidatedAt`。
- 超过宽限期后降级为试用模式，并提示联网验证。

## 4. 反滥用策略

| 风险 | 对策 |
| --- | --- |
| 安装包被转卖 | 安装包无授权码时只能试用 |
| 授权码被公开分享 | 服务端按授权码验证频率、IP 分布、异常失败率风控 |
| 授权码倒卖 | 订单状态校验、黑名单、人工复核 |
| 批量刷试用 | 试用功能限制、API 调用限流、验证码或账号校验 |
| 本地文件被篡改 | 授权令牌签名校验、关键逻辑混淆、异常状态降级 |

## 5. 服务端接口

### POST `/license/activate`

请求：

```json
{
  "licenseCode": "XXXX-XXXX-XXXX-XXXX",
  "appVersion": "1.0.0"
}
```

响应：

```json
{
  "status": "active",
  "plan": "pro",
  "activatedAt": "2026-05-17T10:00:00.000Z",
  "expiresAt": "2027-05-17T10:00:00.000Z",
  "features": ["batch", "pdf", "docx", "term-table"],
  "token": "signed-license-token"
}
```

### POST `/license/validate`

请求：

```json
{
  "licenseCode": "XXXX-XXXX-XXXX-XXXX",
  "token": "signed-license-token",
  "appVersion": "1.0.0"
}
```

响应：

```json
{
  "status": "active",
  "plan": "pro",
  "expiresAt": "2027-05-17T10:00:00.000Z",
  "features": ["batch", "pdf", "docx", "term-table"],
  "token": "signed-license-token"
}
```

### POST `/license/deactivate`

用于当前授权码退出登录或清除本机授权缓存。服务端只记录授权码状态变化，不需要本机身份。

## 6. 数据库设计

### 表：`licenses`

```sql
CREATE TABLE licenses (
  id              UUID PRIMARY KEY,
  license_code    VARCHAR(64) UNIQUE NOT NULL,
  plan            VARCHAR(32) NOT NULL,
  status          VARCHAR(20) NOT NULL,
  order_id        VARCHAR(64),
  activated_at    TIMESTAMP,
  expires_at      TIMESTAMP,
  revoked_at      TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_licenses_code ON licenses(license_code);
CREATE INDEX idx_licenses_status ON licenses(status);
```

### 表：`license_events`

```sql
CREATE TABLE license_events (
  id              UUID PRIMARY KEY,
  license_id      UUID REFERENCES licenses(id),
  event_type      VARCHAR(32) NOT NULL,
  app_version     VARCHAR(32),
  ip_hash         VARCHAR(64),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_license ON license_events(license_id);
CREATE INDEX idx_events_type ON license_events(event_type);
```

`ip_hash` 仅用于粗粒度风控，可定期清理；不用于本机绑定。

## 7. 客户端实现计划

### 已保留

- `license:activate`
- `license:validate`
- 本地授权状态缓存
- 功能开关列表

### 需要实现

- 服务端签名令牌校验。
- 离线宽限期逻辑。
- 授权状态 UI。
- 授权码清除/重新激活。
- 服务端授权 API。

### 明确不实现

- 硬件标识采集。
- 本机绑定。
- 终端列表管理。
- 基于本机唯一标识的试用限制。

## 8. 当前代码落点

| 模块 | 文件 | 状态 |
| --- | --- | --- |
| 类型定义 | `src/shared/types.ts` | `LicenseInfo` 已移除硬件数量字段 |
| IPC | `src/main/ipc/handlers.ts` | 仍为占位实现 |
| 激活页 | `src/renderer/pages/Activation.tsx` | 需接真实服务端 |
| 设置页 | `src/renderer/pages/Settings.tsx` | 与授权无直接耦合 |

## 9. 验收标准

- 全仓库不出现硬件识别、绑定列表、终端上限等实现或文案。
- 激活和验证接口不上传本机身份字段。
- 断网场景能根据本地签名令牌进入可解释的离线状态。
- 授权码撤销后，下一次在线验证会降级并给出清晰提示。
