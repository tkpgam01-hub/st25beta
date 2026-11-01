const API = require('../api/endpoints');
const Pilot = require('../api/upstream-endpoints');

module.exports = (app, context) => {
  const service = require('../services/plinko')({
    balance: async (sid, fresh = false) => {
      const player = await context.callIslePilot(Pilot.player(sid), 'GET', null, fresh);
      const balance = player?.wallet?.balance;
      if (player && !player.error && !player._status && Number.isFinite(balance) && balance >= 0) {
        return balance;
      }
      const data = context.getPortalData ? context.getPortalData() : null;
      if (data && data.userWallets && typeof data.userWallets[sid] === 'number') {
        return data.userWallets[sid];
      }
      throw Object.assign(Error('Không đọc được ví Lúa.'), { status: 503 });
    },
    change: async (sid, amount, reason) => {
      try {
        const res = await context.callIslePilot(Pilot.playerCurrency(sid), 'POST', { amount, reason });
        if (res) {
          const bal = typeof res.balance === 'number' ? res.balance :
                      typeof res.wallet?.balance === 'number' ? res.wallet.balance : null;
          if (bal !== null && bal >= 0) {
            return { ok: true, applied: true, balance: bal };
          }
          if (res.ok === true || res.success === true) {
            const player = await context.callIslePilot(Pilot.player(sid), 'GET', null, true);
            const freshBal = player?.wallet?.balance;
            if (typeof freshBal === 'number' && freshBal >= 0) {
              return { ok: true, applied: true, balance: freshBal };
            }
          }
        }
        // Local portal data fallback
        const data = context.getPortalData ? context.getPortalData() : null;
        if (data && data.userWallets && typeof data.userWallets[sid] === 'number') {
          data.userWallets[sid] = Math.max(0, data.userWallets[sid] + amount);
          if (context.savePortalData) context.savePortalData(data);
          return { ok: true, balance: data.userWallets[sid], applied: true };
        }
        return res;
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
      console.error('Plinko controller error:', e);
      res.status(500).json({ error: 'Lỗi xử lý Plinko. Vui lòng thử lại.' });
    }
  };

  app.get(API.routes.plinkoState, handler(req => service.state(context.getRequestSteamId(req))));
  app.post(API.routes.plinkoPrepare, handler(req => service.prepare(context.getRequestSteamId(req))));
  app.post(API.routes.plinkoPlay, handler(req => service.play(context.getRequestSteamId(req), req.body)));
};
