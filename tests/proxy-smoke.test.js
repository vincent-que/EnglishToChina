const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');

const { createProxyServer, generateMonthlyLicense } = require('../server/proxy-server');
const { runProxySmokeTest } = require('../server/smoke-test');

test('smoke test checks health, license validation, and translation', async () => {
  const licenseCode = generateMonthlyLicense('202605', 'ABCD-EFGH');
  const server = createProxyServer({
    now: () => new Date('2026-05-18T00:00:00.000Z'),
    env: {
      MODEL_API_KEY: 'test-key',
      MODEL_BASE_URL: 'https://example.test/v1',
      MODEL_NAME: 'moonshot-v1-8k',
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '测试成功' } }],
      }),
    }),
  });
  server.listen(0);
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const result = await runProxySmokeTest({
      baseUrl,
      licenseCode,
      text: 'Smoke test',
    });

    assert.equal(result.ok, true);
    assert.equal(result.health.modelConfigured, true);
    assert.equal(result.translation.translatedText, '测试成功');
  } finally {
    server.close();
    await once(server, 'close');
  }
});
