const crypto = require('node:crypto');
const http = require('node:http');

const DEFAULT_PORT = 8787;
const LICENSE_PREFIX = 'english-to-china-monthly-license-v1';
const MONTHLY_CODE_PATTERN = /^ETC-(\d{6})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{6})$/;

function createChecksum(yyyymm, payload) {
  return crypto
    .createHash('sha256')
    .update(`${LICENSE_PREFIX}|${yyyymm}|${payload}`)
    .digest('hex')
    .slice(0, 6)
    .toUpperCase();
}

function generateMonthlyLicense(yyyymm, payload) {
  return `ETC-${yyyymm}-${payload}-${createChecksum(yyyymm, payload)}`;
}

function validateMonthlyLicense(code, now = new Date()) {
  const normalized = String(code || '').trim().toUpperCase();
  const match = MONTHLY_CODE_PATTERN.exec(normalized);
  if (!match) {
    return { valid: false, status: 'invalid', message: 'Invalid license format' };
  }

  const [, yyyymm, partA, partB, checksum] = match;
  if (checksum !== createChecksum(yyyymm, `${partA}-${partB}`)) {
    return { valid: false, status: 'invalid', message: 'Invalid license checksum' };
  }

  const year = Number(yyyymm.slice(0, 4));
  const month = Number(yyyymm.slice(4, 6));
  if (!year || month < 1 || month > 12) {
    return { valid: false, status: 'invalid', message: 'Invalid license month' };
  }

  const validFrom = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const expiresAt = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const expired = now.getTime() >= expiresAt.getTime();

  return {
    valid: !expired,
    status: expired ? 'expired' : 'active',
    plan: 'monthly',
    validFrom: validFrom.toISOString(),
    expiresAt: expiresAt.toISOString(),
    message: expired ? 'License expired' : 'License active',
    features: ['proxy-translation', 'docx', 'pdf'],
  };
}

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function sendJson(res, statusCode, body) {
  const data = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function sendHtml(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getModelConfig(env) {
  return resolveModelPool(env)[0] || {
    name: 'default',
    apiKeyConfigured: false,
    apiKey: '',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
  };
}

function toModelConfig(item, fallbackName) {
  const apiKey = String(item.apiKey || item.key || '').trim();
  const baseUrl = normalizeBaseUrl(item.baseUrl || item.base_url || '');
  const model = String(item.model || '').trim();
  if (!apiKey || !baseUrl || !model) return null;
  return {
    name: String(item.name || fallbackName || model).trim(),
    apiKey,
    apiKeyConfigured: true,
    baseUrl,
    model,
  };
}

function resolveModelPool(env) {
  if (env.MODEL_POOL) {
    try {
      const parsed = JSON.parse(env.MODEL_POOL);
      if (Array.isArray(parsed)) {
        const pool = parsed
          .map((item, index) => toModelConfig(item || {}, `model-${index + 1}`))
          .filter(Boolean);
        if (pool.length > 0) return pool;
      }
    } catch {
      // Fall through to single-model env config.
    }
  }

  const apiKey = env.MODEL_API_KEY || env.KIMI_API_KEY;
  return [{
    name: env.MODEL_NAME || env.KIMI_MODEL || 'moonshot',
    apiKey,
    apiKeyConfigured: Boolean(env.MODEL_API_KEY || env.KIMI_API_KEY),
    baseUrl: normalizeBaseUrl(env.MODEL_BASE_URL || env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1'),
    model: env.MODEL_NAME || env.KIMI_MODEL || 'moonshot-v1-8k',
  }];
}

function renderStatusPage(env) {
  const model = getModelConfig(env);
  const statusLabel = model.apiKeyConfigured ? 'Configured' : 'Missing API key';
  const statusClass = model.apiKeyConfigured ? 'ok' : 'warn';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>English to China Translation Proxy</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f7f8fa; color: #1f2937; }
    main { max-width: 820px; margin: 48px auto; padding: 0 24px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .panel { margin-top: 20px; padding: 20px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 13px; font-weight: 700; }
    .ok { background: #dcfce7; color: #166534; }
    .warn { background: #fef3c7; color: #92400e; }
    code { background: #f3f4f6; padding: 2px 5px; border-radius: 4px; }
    li { margin: 8px 0; }
  </style>
</head>
<body>
  <main>
    <h1>English to China Translation Proxy</h1>
    <p>Service is running. Use the endpoints below for desktop translation.</p>
    <section class="panel">
      <p>Model status: <span class="badge ${statusClass}">${statusLabel}</span></p>
      <p>Model: <code>${escapeHtml(model.model)}</code></p>
      <p>Base URL: <code>${escapeHtml(model.baseUrl)}</code></p>
    </section>
    <section class="panel">
      <h2>Endpoints</h2>
      <ul>
        <li><code>GET /api/health</code></li>
        <li><code>POST /api/license/validate</code></li>
        <li><code>POST /api/translate</code></li>
      </ul>
    </section>
  </main>
</body>
</html>`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function flattenTerms(termTables) {
  const terms = [];
  for (const table of Array.isArray(termTables) ? termTables : []) {
    for (const entry of Array.isArray(table && table.entries) ? table.entries : []) {
      const source = String(entry.source || '').trim();
      const target = String(entry.target || '').trim();
      if (source && target) terms.push(`${source} => ${target}`);
    }
  }
  return terms.slice(0, 80);
}

function buildMessages({ text, style, termTables }) {
  const styleInstruction = {
    academic: 'Use formal academic Chinese. Preserve technical meaning and paragraph structure.',
    business: 'Use clear professional Chinese suitable for business documents.',
    casual: 'Use natural everyday Chinese while preserving the original meaning.',
  }[style] || 'Use clear professional Chinese suitable for business documents.';

  const terms = flattenTerms(termTables);
  const termInstruction = terms.length
    ? `\nUse this glossary when relevant:\n${terms.join('\n')}`
    : '';

  return [
    {
      role: 'system',
      content: [
        'You are a professional English-to-Chinese document translator.',
        styleInstruction,
        'Return only the Chinese translation. Do not add explanations.',
        'Preserve numbers, units, product names, and placeholders.',
        termInstruction,
      ].filter(Boolean).join('\n'),
    },
    { role: 'user', content: `<text>${text}</text>` },
  ];
}

function cleanTranslation(value) {
  return String(value || '')
    .trim()
    .replace(/^<text>\s*/i, '')
    .replace(/\s*<\/text>$/i, '')
    .trim();
}

function createProxyServer(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || (() => new Date());

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      const modelPool = resolveModelPool(env);
      const modelConfig = modelPool[0] || getModelConfig(env);
      sendJson(res, 200, {
        success: true,
        ok: true,
        service: 'english-to-china-proxy',
        modelConfigured: modelConfig.apiKeyConfigured,
        modelBaseUrl: modelConfig.baseUrl,
        model: modelConfig.model,
        modelPoolSize: modelPool.filter((item) => item.apiKeyConfigured).length,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      sendHtml(res, 200, renderStatusPage(env));
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 404, { success: false, message: 'Not found' });
      return;
    }

    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { success: false, message: error.message });
      return;
    }

    if (url.pathname === '/api/license/validate') {
      const license = validateMonthlyLicense(body.licenseCode || body.code, now());
      sendJson(res, license.valid ? 200 : 403, { success: license.valid, license, message: license.message });
      return;
    }

    if (url.pathname !== '/api/translate') {
      sendJson(res, 404, { success: false, message: 'Not found' });
      return;
    }

    const license = validateMonthlyLicense(body.licenseCode, now());
    if (!license.valid) {
      sendJson(res, 403, { success: false, message: license.message, license });
      return;
    }

    const text = String(body.text || '').trim();
    if (!text) {
      sendJson(res, 400, { success: false, message: 'Text is required' });
      return;
    }

    const modelPool = resolveModelPool(env).filter((item) => item.apiKeyConfigured);
    if (modelPool.length === 0) {
      sendJson(res, 503, { success: false, message: 'Server model API key is not configured' });
      return;
    }

    const errors = [];
    for (const modelConfig of modelPool) {
      try {
        const upstream = await fetchImpl(`${modelConfig.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${modelConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelConfig.model,
            temperature: 0.2,
            messages: buildMessages({
              text,
              style: body.style,
              termTables: body.termTables,
            }),
          }),
        });

        let data = {};
        try {
          data = await upstream.json();
        } catch {
          data = {};
        }

        if (!upstream.ok) {
          errors.push(`${modelConfig.name}: ${data.error && data.error.message ? data.error.message : `HTTP ${upstream.status}`}`);
          continue;
        }

        const translatedText = cleanTranslation(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
        if (!translatedText) {
          errors.push(`${modelConfig.name}: empty translation`);
          continue;
        }

        sendJson(res, 200, {
          success: true,
          translatedText,
          model: modelConfig.model,
          provider: modelConfig.name,
        });
        return;
      } catch (error) {
        errors.push(`${modelConfig.name}: ${error.message || 'request failed'}`);
      }
    }

    sendJson(res, 502, {
      success: false,
      message: errors.length ? `All upstream models failed: ${errors.join('; ')}` : 'Proxy translation failed',
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const server = createProxyServer();
  server.listen(port, () => {
    console.log(`Translation proxy listening on http://127.0.0.1:${port}`);
  });
}

module.exports = {
  buildMessages,
  cleanTranslation,
  createProxyServer,
  generateMonthlyLicense,
  renderStatusPage,
  resolveModelPool,
  validateMonthlyLicense,
};
