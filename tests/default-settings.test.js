const assert = require('node:assert/strict');
const test = require('node:test');

const { DEFAULT_SETTINGS, resolveDefaultSettings } = require('../dist/main/shared/constants.js');

test('keeps proxy server url empty unless a customer default is provided', () => {
  assert.equal(DEFAULT_SETTINGS.proxyServerUrl, '');
  assert.equal(resolveDefaultSettings({}).proxyServerUrl, '');
});

test('uses CUSTOMER_PROXY_SERVER_URL as the packaged default proxy server url', () => {
  const settings = resolveDefaultSettings({
    CUSTOMER_PROXY_SERVER_URL: ' https://translate.example.com/ ',
  });

  assert.equal(settings.proxyServerUrl, 'https://translate.example.com');
});
