# Translation Proxy Server

This server provides the customer-facing translation proxy used by the desktop app.

## Endpoints

- `GET /api/health`
- `POST /api/license/validate`
- `POST /api/translate`

## Environment

Required:

```powershell
$env:MODEL_API_KEY="your-model-api-key"
```

Optional:

```powershell
$env:PORT="8787"
$env:MODEL_BASE_URL="https://api.moonshot.cn/v1"
$env:MODEL_NAME="moonshot-v1-8k"
```

For automatic model failover, configure `MODEL_POOL` instead of the single-model variables:

```powershell
$env:MODEL_POOL='[
  {"name":"kimi-primary","apiKey":"your-primary-key","baseUrl":"https://api.moonshot.cn/v1","model":"moonshot-v1-8k"},
  {"name":"kimi-backup","apiKey":"your-backup-key","baseUrl":"https://api.moonshot.cn/v1","model":"moonshot-v1-8k"}
]'
```

The proxy tries models in order. If one upstream returns an error or an empty translation, it automatically tries the next configured model.

Kimi-compatible aliases are also supported:

```powershell
$env:KIMI_API_KEY="your-kimi-api-key"
$env:KIMI_BASE_URL="https://api.moonshot.cn/v1"
$env:KIMI_MODEL="moonshot-v1-8k"
```

## Start

```powershell
npm.cmd run server:proxy
```

Default local URL:

```text
http://127.0.0.1:8787
```

## Smoke Test

Generate a monthly license code:

```powershell
npm.cmd run license:generate -- 202605 1
```

Check health:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/health
```

Validate license:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/license/validate `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"licenseCode":"ETC-202605-XXXX-XXXX-XXXXXX"}'
```

Translate one segment:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/translate `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"licenseCode":"ETC-202605-XXXX-XXXX-XXXXXX","text":"Hello world","style":"business","termTables":[]}'
```

Or run the full smoke check:

```powershell
npm.cmd run server:smoke -- http://127.0.0.1:8787 ETC-202605-XXXX-XXXX-XXXXXX "Hello world"
```

## Build Customer App With Default Proxy URL

Set the desktop app default proxy URL before building by editing:

```text
resources/customer-config.json
```

Example:

```json
{
  "proxyServerUrl": "https://your-proxy.example.com"
}
```

Then build:

```powershell
npm.cmd run build
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx.cmd electron-builder --win --dir --config.win.signAndEditExecutable=false
Compress-Archive -Path release\win-unpacked\* -DestinationPath release\EnglishToChina-win-unpacked.zip -Force
```

For local testing, `resources/customer-config.json` can point to `http://127.0.0.1:8787`.
