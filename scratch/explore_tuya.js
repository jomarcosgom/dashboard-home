const https = require('https');
const crypto = require('crypto');

const clientId = '74ck4j47xj7d9dgen3yt';
const clientSecret = 'c2783a0b6d014e4d8dbd69016751cf67';
const host = 'openapi.tuyaeu.com';
const uid = 'eu1769091078980awtS2';
const devId = 'bf44dea17bc950a254jrfh';

function req(method, path, token = '') {
  const t = Date.now().toString();
  const bodyHash = crypto.createHash('sha256').update('').digest('hex');
  const signStr = clientId + token + t + [method, bodyHash, '', path].join('\n');
  const sign = crypto.createHmac('sha256', clientSecret).update(signStr).digest('hex').toUpperCase();

  const headers = {
    'client_id': clientId,
    'sign': sign,
    't': t,
    'sign_method': 'HMAC-SHA256',
    'Content-Type': 'application/json'
  };
  if (token) headers['access_token'] = token;

  return new Promise((resolve, reject) => {
    const r = https.request({ hostname: host, port: 443, path, method, headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d || '{}')));
    });
    r.on('error', reject);
    r.end();
  });
}

async function main() {
  const tokenRes = await req('GET', '/v1.0/token?grant_type=1');
  const token = tokenRes.result.access_token;

  const now = Date.now();
  const start = now - (7 * 24 * 3600 * 1000);
  const logs = await req('GET', `/v1.0/devices/${devId}/logs?start_time=${start}&end_time=${now}&type=7&size=20`, token);
  console.log('LOGS:', JSON.stringify(logs, null, 2));
}

main().catch(console.error);
