const API = require('../api/endpoints');
const Pilot = require('../api/upstream-endpoints');

module.exports = (app, context) => {
  const service = require('../services/roulette')({
    balance: async (sid, fresh = false) => {
      const player = await context.callIslePilot(Pilot.player(sid), 'GET', null, fresh);
      const balance = player?.wallet?.balance;
      if (!player || player.error || player._status || !Number.isFinite(balance) || balance < 0) {
        throw Object.assign(new Error('Không đọc được số dư ví Lúa từ máy chủ.'), { status: 503 });
      }
      return balance;
    },
    change: async (sid, amount, reason) => {
      try {
        return await context.callIslePilot(Pilot.playerCurrency(sid), 'POST', { amount, reason });
      } finally {
        context.clearPlayerCache(sid);
      }
    }
  });

  const handler = action => async (req, res) => {
    try {
      res.json(await action(req));
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      console.error('Roulette error:', e);
      res.status(500).json({ error: 'Lỗi xử lý vòng quay. Vui lòng thử lại.' });
    }
  };

  app.get(API.routes.rouletteState, handler(req => service.state(context.getRequestSteamId(req))));
  app.post(API.routes.roulettePrepare, handler(req => service.prepare(context.getRequestSteamId(req))));
  app.post(API.routes.rouletteSpin, handler(req => service.spin(context.getRequestSteamId(req), req.body)));

  app.post(API.routes.rouletteDevLogin, (req, res) => {
    const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    if (!isLocal && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Chức năng chỉ hỗ trợ kiểm thử.' });
    }
    const steamId = process.env.ADMIN_SUPER_STEAM_IDS ? process.env.ADMIN_SUPER_STEAM_IDS.split(',')[0].trim() : '76561198789527189';
    const Auth = require('../core/auth');
    const token = Auth.sign({ kind: 'session', steamId, expires: Date.now() + Auth.SESSION_MS });
    res.cookie('st25_session_token', token, Auth.cookieOptions(req));
    return res.json({ ok: true, steamId, message: 'Đã kích hoạt phiên đăng nhập Test Admin!' });
  });
};
