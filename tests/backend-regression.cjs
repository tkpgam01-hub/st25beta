const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs');
process.env.SESSION_SECRET = 'offline-test-secret-no-live-credentials';
process.env.ISLEPILOT_API_TOKEN = 'offline-test-token';
const Auth = require('../server-auth');
const steam = '76561198000000001';
const token = Auth.sign({ kind: 'session', steamId: steam, expires: Date.now() + 60000 });
const cookie = `st25_session_token=${token}`;
let mode = 'fail', release;
global.fetch = async (url) => {
  if (mode === 'verified' && url === 'https://steamcommunity.com/openid/login') return { ok: true, text: async () => 'is_valid:true' };
  if (mode === 'debit-fail' && !url.endsWith('/currency')) return { ok: true, json: async () => ({ wallet: { balance: 10 } }) };
  if (mode === 'slow') await new Promise(resolve => { release = resolve; });
  return { ok: false, status: 503, json: async () => ({ error: 'Offline test' }) };
};
const app = require('../server');
const server = app.listen(0, '127.0.0.1');
const dataFile = require('../src/core/config').dataFile;
const originalData = fs.readFileSync(dataFile, 'utf8');
function request(url, method = 'GET', headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers }, res => {
      let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject); req.end(body);
  });
}
(async () => {
  await new Promise(resolve => server.once('listening', resolve));
  assert.equal(Auth.getRequestSteamId({ headers: { cookie } }), steam);
  for (const headers of [{ cookie: `st25_steam_id=${steam}` }, { 'x-steam-id': steam }, { 'x-admin-steam-id': steam }, { cookie: 'st25_session_token=invalid' }])
    assert.equal(Auth.getRequestSteamId({ headers, query: { steamId: steam }, body: { steamId: steam } }), null);
  assert.equal(Auth.verify(Auth.sign({ expires: Date.now() - 1 })), null);
  assert.equal(Auth.verify(token + 'x'), null);
  assert.equal(Auth.safeRedirect('//example.com'), '/lien-ket-steam.html');
  assert.equal(Auth.safeRedirect('/\\example.com'), '/lien-ket-steam.html');
  assert.equal(Auth.parseCookies({ headers: { cookie: 'broken=%ZZ; okay=hello%20world' } }).okay, 'hello world');
  for (const url of ['/server-config.json', '/portal-data.json', '/server.js', '/server-auth.js', '/package.json', '/tests/README.md', '/node_modules/express/package.json', '/.git/config'])
    assert.equal((await request(url)).status, 404, url);
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/assets/js/app.js')).status, 200);
  assert.equal((await request('/api/player/me?steamId=' + steam, 'GET', { 'x-steam-id': steam })).text.includes('"linked":false'), true);
  assert.equal((await request('/api/player/login-manual', 'POST', { 'Content-Type': 'application/json' }, JSON.stringify({ steamId: steam }))).status, 403);
  assert.equal((await request('/api/player/steam/callback?openid.claimed_id=https://steamcommunity.com/openid/id/' + steam)).status, 401);
  assert.equal((await request('/api/player/logout', 'POST', { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await request('/api/player/me', 'GET', { Cookie: cookie })).status, 503);
  const status = JSON.parse((await request('/api/server/status')).text);
  assert.equal(status.online, false); assert.equal(status.online_players, 0);
  assert.equal((await request('/api/support/my-tickets')).status, 401);
  assert.equal((await request('/api/player/team')).status, 401);
  const transferHeaders = { Cookie: cookie, 'Content-Type': 'application/json' };
  const transferBody = JSON.stringify({ receiverSteamId: '76561198000000002', amount: 1 });
  assert.equal((await request('/api/market/transfer', 'POST', transferHeaders, transferBody)).status, 500);
  mode = 'debit-fail';
  assert.equal((await request('/api/market/transfer', 'POST', transferHeaders, transferBody)).status, 500);
  assert.equal((await request('/api/crates/open', 'POST', transferHeaders, JSON.stringify({steamId:'76561198000000002'}))).status, 403);
  mode = 'slow';
  const first = request('/api/market/transfer', 'POST', transferHeaders, transferBody);
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await request('/api/skin/buy', 'POST', transferHeaders, '{}')).status, 429);
  const receiverToken = Auth.sign({ kind: 'session', steamId: '76561198000000002', expires: Date.now() + 60000 });
  assert.equal((await request('/api/skin/buy', 'POST', { Cookie: 'st25_session_token=' + receiverToken, 'Content-Type': 'application/json' }, '{}')).status, 429);
  release(); await first; mode = 'fail';
  assert.equal((await request('/api/player/logout', 'POST', { Cookie: cookie })).status, 200);
  const login = await request('/api/player/steam/login?redirect=%2Fgara.html');
  assert.equal(login.status, 302);
  const loginCookie = login.headers['set-cookie'][0].split(';')[0];
  const returnTo = new URL(login.headers.location).searchParams.get('openid.return_to');
  const callback = new URL(returnTo);
  const openid = { 'openid.mode':'id_res', 'openid.return_to': returnTo, 'openid.op_endpoint':'https://steamcommunity.com/openid/login', 'openid.identity': 'https://steamcommunity.com/openid/id/' + steam, 'openid.claimed_id': 'https://steamcommunity.com/openid/id/' + steam, 'openid.response_nonce': new Date().toISOString() + 'test', 'openid.signed':'op_endpoint,claimed_id,identity,return_to,response_nonce' };
  for (const [key, value] of Object.entries(openid)) callback.searchParams.set(key, value);
  mode = 'verified';
  const loggedIn = await request(callback.pathname + callback.search, 'GET', { Cookie: loginCookie });
  assert.equal(loggedIn.status, 302);
  const signedCookie = loggedIn.headers['set-cookie'].find(value => value.startsWith('st25_session_token='));
  assert.match(signedCookie, /HttpOnly/);
  assert.match(signedCookie, /SameSite=Lax/);
  assert.equal(Auth.getRequestSteamId({ headers: { cookie: signedCookie.split(';')[0] } }), steam);
  assert.equal(fs.readFileSync(dataFile, 'utf8'), originalData);
  console.log('PASS backend: signed/expired/tampered sessions, spoofed IDs, private files, invalid OpenID, CSRF, offline status, failed balance, concurrent mutations; no live calls or data changes');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
