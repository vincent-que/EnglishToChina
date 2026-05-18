const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  mergeStoredSettings,
  resolvePackagedCustomerConfig,
} = require('../dist/main/main/services/settings.service.js');

test('reads packaged customer proxy server url from customer-config.json', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'etc-customer-config-'));
  fs.writeFileSync(
    path.join(tempDir, 'customer-config.json'),
    JSON.stringify({ proxyServerUrl: ' http://127.0.0.1:8787/ ' }),
    'utf-8'
  );

  const config = resolvePackagedCustomerConfig(tempDir);

  assert.equal(config.proxyServerUrl, 'http://127.0.0.1:8787');
});

test('reads customer proxy server url from electron-builder extraResources folder', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'etc-customer-config-'));
  fs.mkdirSync(path.join(tempDir, 'resources'));
  fs.writeFileSync(
    path.join(tempDir, 'resources', 'customer-config.json'),
    JSON.stringify({ proxyServerUrl: ' https://proxy.example.com/ ' }),
    'utf-8'
  );

  const config = resolvePackagedCustomerConfig(tempDir);

  assert.equal(config.proxyServerUrl, 'https://proxy.example.com');
});

test('uses customer default proxy when stored settings contain an empty proxy url', () => {
  const settings = mergeStoredSettings(
    { proxyServerUrl: 'http://127.0.0.1:8787', translationMode: 'proxy' },
    { proxyServerUrl: '' }
  );

  assert.equal(settings.proxyServerUrl, 'http://127.0.0.1:8787');
});

test('keeps user proxy url when stored settings contain a non-empty proxy url', () => {
  const settings = mergeStoredSettings(
    { proxyServerUrl: 'http://127.0.0.1:8787', translationMode: 'proxy' },
    { proxyServerUrl: 'https://proxy.example.com' }
  );

  assert.equal(settings.proxyServerUrl, 'https://proxy.example.com');
});
