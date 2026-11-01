const crypto = require('node:crypto');
require('./config');

const configured = typeof process.env.SESSION_SECRET === 'string' && process.env.SESSION_SECRET.length >= 32;
const secret = configured ? process.env.SESSION_SECRET : crypto.randomBytes(32).toString('hex');
const SESSION_MS = 30 * 24 * 3600 * 1000;
function sign(data) {
  if (!configured) throw Object.assign(new Error('Máy chủ cần SESSION_SECRET ít nhất 32 ký tự.'), {status:503});
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
function verify(token) {
  if (!configured) return null;
  try {
    const [payload, signature, extra] = String(token || '').split('.');
    if (!payload || !signature || extra) return null;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(data.expires) && data.expires > Date.now() ? data : null;
  } catch { return null; }
}
function parseCookies(req) {
  const cookies = Object.create(null);
  for (const item of String(req.headers.cookie || '').split(';')) {
    const equals = item.indexOf('=');
    if (equals < 0) continue;
    try { cookies[item.slice(0, equals).trim()] = decodeURIComponent(item.slice(equals + 1)); } catch {}
  }
  return cookies;
}
function getRequestSteamId(req) {
  if (!configured) return null;
  const session = verify(parseCookies(req).st25_session_token);
  return session?.kind === 'session' && /^\d{17}$/.test(session.steamId) ? session.steamId : null;
}
function safeRedirect(value) {
  return typeof value === 'string' && /^\/(?!\/)/.test(value) && !/[\\\r\n]/.test(value)
    ? value : '/lien-ket-steam.html';
}
function cookieOptions(req, maxAge = SESSION_MS) {
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const isHttps = !!(req?.secure || forwardedProto === 'https' || (process.env.PUBLIC_ORIGIN && process.env.PUBLIC_ORIGIN.toLowerCase().startsWith('https:')));
  return { maxAge, path: '/', httpOnly: true, sameSite: 'lax', secure: isHttps };
}
module.exports = { sign, verify, parseCookies, getRequestSteamId, safeRedirect, cookieOptions, SESSION_MS, configured };
