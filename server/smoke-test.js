async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.message || data.error || `Request failed (${response.status})`);
  }
  return data;
}

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.message || data.error || `Request failed (${response.status})`);
  }
  return data;
}

async function runProxySmokeTest({ baseUrl, licenseCode, text = 'Hello world' }) {
  const normalized = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalized) throw new Error('Base URL is required');
  if (!licenseCode) throw new Error('License code is required');

  const health = await getJson(`${normalized}/api/health`);
  const license = await postJson(`${normalized}/api/license/validate`, { licenseCode });
  const translation = await postJson(`${normalized}/api/translate`, {
    licenseCode,
    text,
    style: 'business',
    termTables: [],
  });

  return {
    ok: true,
    baseUrl: normalized,
    health,
    license,
    translation,
  };
}

if (require.main === module) {
  const [, , baseUrl, licenseCode, ...textParts] = process.argv;
  runProxySmokeTest({
    baseUrl: baseUrl || process.env.PROXY_SERVER_URL,
    licenseCode: licenseCode || process.env.PROXY_LICENSE_CODE,
    text: textParts.join(' ') || process.env.PROXY_SMOKE_TEXT || 'Hello world',
  })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}

module.exports = {
  runProxySmokeTest,
};
