const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
const test = require('node:test');

const {
  createProxyServer,
  generateMonthlyLicense,
  validateMonthlyLicense,
} = require('../server/proxy-server');

function requestJson(url, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = http.request(url, {
      method,
      headers: data ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      } : undefined,
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: raw ? JSON.parse(raw) : {},
        });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('validates monthly license code windows', () => {
  const code = generateMonthlyLicense('202605', 'ABCD-EFGH');

  assert.equal(validateMonthlyLicense(code, new Date('2026-05-18T00:00:00.000Z')).valid, true);
  assert.equal(validateMonthlyLicense(code, new Date('2026-06-01T00:00:00.000Z')).valid, false);
  assert.equal(validateMonthlyLicense('ETC-202605-ABCD-EFGH-000000', new Date('2026-05-18T00:00:00.000Z')).valid, false);
});

test('translate endpoint validates license and returns upstream translation', async () => {
  const licenseCode = generateMonthlyLicense('202605', 'ABCD-EFGH');
  const calls = [];
  const server = createProxyServer({
    now: () => new Date('2026-05-18T00:00:00.000Z'),
    env: {
      MODEL_API_KEY: 'test-key',
      MODEL_BASE_URL: 'https://example.test/v1',
      MODEL_NAME: 'moonshot-v1-8k',
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '<text>你好，世界</text>' } }],
        }),
      };
    },
  });
  server.listen(0);
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const invalid = await requestJson(`${baseUrl}/api/license/validate`, {
      method: 'POST',
      body: { licenseCode: 'bad-code' },
    });
    assert.equal(invalid.statusCode, 403);
    assert.equal(invalid.body.success, false);

    const translated = await requestJson(`${baseUrl}/api/translate`, {
      method: 'POST',
      body: {
        licenseCode,
        text: 'Hello, world',
        style: 'business',
        termTables: [{ entries: [{ source: 'world', target: '世界' }] }],
      },
    });

    assert.equal(translated.statusCode, 200);
    assert.equal(translated.body.success, true);
    assert.equal(translated.body.translatedText, '你好，世界');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://example.test/v1/chat/completions');
    assert.equal(JSON.parse(calls[0].options.body).model, 'moonshot-v1-8k');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('root endpoint returns a human-readable service status page', async () => {
  const server = createProxyServer({
    env: {
      MODEL_API_KEY: 'test-key',
      MODEL_BASE_URL: 'https://example.test/v1',
      MODEL_NAME: 'moonshot-v1-8k',
    },
  });
  server.listen(0);
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const page = await new Promise((resolve, reject) => {
      http.get(baseUrl, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            contentType: res.headers['content-type'],
            body: raw,
          });
        });
      }).on('error', reject);
    });

    assert.equal(page.statusCode, 200);
    assert.match(page.contentType, /text\/html/);
    assert.match(page.body, /English to China Translation Proxy/);
    assert.match(page.body, /\/api\/health/);
    assert.match(page.body, /moonshot-v1-8k/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('translate endpoint falls back to the next model when the first upstream fails', async () => {
  const licenseCode = generateMonthlyLicense('202605', 'ABCD-EFGH');
  const calls = [];
  const server = createProxyServer({
    now: () => new Date('2026-05-18T00:00:00.000Z'),
    env: {
      MODEL_POOL: JSON.stringify([
        { name: 'primary', apiKey: 'key-a', baseUrl: 'https://primary.example/v1', model: 'model-a' },
        { name: 'backup', apiKey: 'key-b', baseUrl: 'https://backup.example/v1', model: 'model-b' },
      ]),
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: { message: 'rate limited' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '备用模型成功' } }],
        }),
      };
    },
  });
  server.listen(0);
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const translated = await requestJson(`${baseUrl}/api/translate`, {
      method: 'POST',
      body: {
        licenseCode,
        text: 'Fallback test',
        style: 'business',
        termTables: [],
      },
    });

    assert.equal(translated.statusCode, 200);
    assert.equal(translated.body.success, true);
    assert.equal(translated.body.translatedText, '备用模型成功');
    assert.equal(translated.body.model, 'model-b');
    assert.equal(translated.body.provider, 'backup');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://primary.example/v1/chat/completions');
    assert.equal(calls[1].url, 'https://backup.example/v1/chat/completions');
  } finally {
    server.close();
    await once(server, 'close');
  }
});
