const crypto = require('crypto');

const now = new Date();
const month = process.argv[2] || `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
const count = Number(process.argv[3] || '1');

if (!/^\d{6}$/.test(month)) {
  console.error('Usage: npm.cmd run license:generate -- YYYYMM [count]');
  process.exit(1);
}

function checksum(yyyymm, payload) {
  return crypto
    .createHash('sha256')
    .update(`english-to-china-monthly-license-v1|${yyyymm}|${payload}`)
    .digest('hex')
    .slice(0, 6)
    .toUpperCase();
}

function randomPart() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let i = 0; i < 4; i += 1) {
    value += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return value;
}

for (let i = 0; i < count; i += 1) {
  const payload = `${randomPart()}-${randomPart()}`;
  console.log(`ETC-${month}-${payload}-${checksum(month, payload)}`);
}
