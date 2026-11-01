const express = require('express');
const cors = require('cors');
const Auth = require('../core/auth');
module.exports = function installSecurity(app, {getPortalData}) {
app.disable('x-powered-by');
app.use(cors({ origin: false }));
// Reject cross-origin browser mutations, including requests without JSON bodies.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.get('host')) return res.status(403).json({ error: 'Nguồn yêu cầu không hợp lệ.' });
    } catch { return res.status(403).json({ error: 'Nguồn yêu cầu không hợp lệ.' }); }
  }
  next();
});
const pendingMutations = new Set();
app.use('/api', (req, res, next) => {
  const steamId = Auth.getRequestSteamId(req);
  if (!steamId || ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/player/logout') return next();
  if (pendingMutations.has(steamId)) return res.status(429).json({ error: 'Yêu cầu trước đang được xử lý. Vui lòng đợi.' });
  pendingMutations.add(steamId);
  res.once('finish', () => pendingMutations.delete(steamId));
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', (req, res, next) => {
  const steamId = Auth.getRequestSteamId(req);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && steamId && req.body?.steamId && String(req.body.steamId).trim() !== steamId) {
    return res.status(403).json({ error: 'Chỉ được thao tác tài khoản Steam đang đăng nhập.' });
  }
  next();
});

// Lock shared participants and listings before an asynchronous transaction begins.
app.use('/api', (req, res, next) => {
  const steamId = Auth.getRequestSteamId(req);
  if (!steamId || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const keys = new Set();
  const body = req.body || {};
  if (req.path === '/market/transfer' && /^\d{17}$/.test(String(body.receiverSteamId || ''))) keys.add(String(body.receiverSteamId));
  if (['/market/buy', '/market/cancel-listing'].includes(req.path)) {
    const listingId = String(body.itemId || body.listingId || '');
    if (listingId) keys.add('listing:' + listingId);
    const listing = (getPortalData().marketListings || []).find(item => item.id === listingId);
    if (listing?.sellerSteamId) keys.add(listing.sellerSteamId);
  }
  if (req.path.startsWith('/trade/') && body.tradeId) {
    keys.add('trade:' + String(body.tradeId));
    const trade = (getPortalData().trades || []).find(item => item.id === body.tradeId);
    if (trade?.senderSteamId) keys.add(trade.senderSteamId);
    if (trade?.receiverSteamId) keys.add(trade.receiverSteamId);
  }
  keys.delete(steamId);
  if ([...keys].some(key => pendingMutations.has(key))) return res.status(429).json({ error: 'Giao dịch liên quan đang được xử lý. Vui lòng đợi.' });
  req.mutationLocks = [...keys];
  for (const key of keys) pendingMutations.add(key);
  res.once('finish', () => { for (const key of keys) pendingMutations.delete(key); });
  next();
});

for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
  const register = app[method].bind(app);
  app[method] = (route, ...handlers) => register(route, ...handlers.map(handler =>
    typeof handler === 'function' && handler.constructor.name === 'AsyncFunction'
      ? (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next).finally(() => { if (res.destroyed) { pendingMutations.delete(Auth.getRequestSteamId(req)); for (const key of req.mutationLocks || []) pendingMutations.delete(key); } }) : handler));
}


};
