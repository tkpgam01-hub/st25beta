const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
// player feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {path, Auth, getPortalData, callIslePilot, posToLatLng, parseCookies, getRequestSteamId, normalizeStatPct, linkPlayerBySteamId, SUPER_ADMINS, isUserAdmin, cleanExpiredTrades, getPlayerGarageStatus} = context;


// 3. Steam OpenID Login URL
app.get(ST25API.routes.playerSteamLogin, (req, res) => {
  if (!Auth.configured) return res.status(503).json({ error: 'Máy chủ chưa cấu hình SESSION_SECRET.' });
  const redirect = Auth.safeRedirect(req.query.redirect);
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const proto = forwardedProto || (req.secure || process.env.VERCEL || process.env.NODE_ENV === 'production' ? 'https' : req.protocol);
  const origin = process.env.PUBLIC_ORIGIN || `${proto}://${host}`;
  const state = require('node:crypto').randomBytes(24).toString('hex');
  const returnTo = `${origin}${ST25API.routes.playerSteamCallback}?state=${state}&redirect=${encodeURIComponent(redirect)}`;
  res.cookie('st25_login_state', Auth.sign({ kind: 'login', state, returnTo, expires: Date.now() + 600000 }), Auth.cookieOptions(req, 600000));
  const params = new URLSearchParams({ 'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'checkid_setup', 'openid.return_to': returnTo, 'openid.realm': origin,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select', 'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select' });
  res.redirect('https://steamcommunity.com/openid/login?' + params);
});


app.get(ST25API.routes.playerSteamCallback, async (req, res) => {
  if (!Auth.configured) return res.status(503).json({ error: 'Máy chủ chưa cấu hình SESSION_SECRET.' });
  const login = Auth.verify(parseCookies(req).st25_login_state);
  res.clearCookie('st25_login_state', { path: '/' });
  const claimedId = req.query['openid.claimed_id'];
  const match = typeof claimedId === 'string' && claimedId.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
  const signed = String(req.query['openid.signed'] || '').split(',');
  const openidReturnTo = req.query['openid.return_to'];
  const returnToMatches = Boolean(login && login.returnTo && openidReturnTo && (
    login.returnTo === openidReturnTo ||
    decodeURIComponent(login.returnTo) === decodeURIComponent(openidReturnTo) ||
    login.returnTo.replace(/^https?:/, '') === openidReturnTo.replace(/^https?:/, '') ||
    decodeURIComponent(login.returnTo).replace(/^https?:/, '') === decodeURIComponent(openidReturnTo).replace(/^https?:/, '')
  ));
  if (!login || login.kind !== 'login' || login.state !== req.query.state || !returnToMatches ||
      req.query['openid.mode'] !== 'id_res' || req.query['openid.op_endpoint'] !== 'https://steamcommunity.com/openid/login' ||
      req.query['openid.identity'] !== claimedId || !match ||
      !['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce'].every(key => signed.includes(key))) {
    return res.status(401).json({ error: 'Phiên đăng nhập Steam không hợp lệ. Vui lòng đăng nhập lại.' });
  }
  try {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) if (key.startsWith('openid.') && typeof value === 'string') params.set(key, value);
    params.set('openid.mode', 'check_authentication');
    const response = await fetch('https://steamcommunity.com/openid/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ST25-Portal/1.0' },
      body: params,
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok || !/^is_valid:true\r?$/m.test(await response.text())) return res.status(401).json({ error: 'Steam không xác nhận đăng nhập.' });
    const steamId = match[1];
    res.cookie('st25_session_token', Auth.sign({ kind: 'session', steamId, expires: Date.now() + Auth.SESSION_MS }), Auth.cookieOptions(req));
    res.clearCookie('st25_steam_id', { path: '/' });
    const redirect = Auth.safeRedirect(req.query.redirect);
    res.redirect(redirect + (redirect.includes('?') ? '&' : '?') + 'steamId=' + steamId + '&login=success');
  } catch {
    res.status(503).json({ error: 'Không thể xác minh đăng nhập với Steam. Vui lòng thử lại.' });
  }
});


// 4. Liên kết / Đăng nhập Steam bằng Steam ID (Dành cho member & admin)
app.post(ST25API.routes.playerLoginManual, (req, res) => {
  res.status(403).json({ error: 'Vui lòng đăng nhập qua Steam để xác minh tài khoản.', loginUrl: ST25API.routes.playerSteamLogin });
});


// 5. Get Current Player info (Strictly based on requesting user's SteamID)
// Lightweight live read: no garage/role/trade work on the fast vitals path.
app.get(ST25API.routes.playerVitals, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.status(401).json({ error: 'Chưa đăng nhập' });
  const player = await callIslePilot(PilotAPI.player(steamId));
  if (!player || player.error || player._status) return res.status(503).json({ error: 'Không thể cập nhật chỉ số' });
  const location = posToLatLng(player.position);
  return res.json({ steam_id: steamId, dino: {
    species: player.species,
    gender: player.female ? 'Cái (Female)' : 'Đực (Male)',
    growth: Math.round((player.growth || 0) * 100),
    health: normalizeStatPct(player.health, player.maxHealth),
    hunger: normalizeStatPct(player.hunger, player.maxHunger),
    thirst: normalizeStatPct(player.thirst, player.maxThirst),
    isPrimeElder: !!player.isPrimeElder,
    grid: location.grid
  } });
});


app.get(ST25API.routes.playerMe, async (req, res) => {
  const reqSteamId = getRequestSteamId(req);
  if (reqSteamId) {
    const pilotPlayer = await callIslePilot(PilotAPI.player(reqSteamId));
    if (pilotPlayer && !pilotPlayer.error && !pilotPlayer._status) {
      const loc = posToLatLng(pilotPlayer.position);
      const isAdmin = isUserAdmin(reqSteamId);
      const isSuperAdmin = SUPER_ADMINS.includes(String(reqSteamId).trim());
      const garageStatus = await getPlayerGarageStatus(reqSteamId, { player: pilotPlayer, fresh: false });
      const portalData = getPortalData();
      cleanExpiredTrades(portalData);
      const incomingTrades = (portalData.trades || []).filter(t => t.receiverSteamId === reqSteamId && t.status === 'pending');
      const notifications = incomingTrades.map(t => ({
        type: 'trade_incoming',
        title: `Lời mời giao dịch từ ${t.senderName}`,
        desc: t.senderDino ? `${t.senderDino.species} [${t.senderDino.growth}%]` : `${t.senderLua} Lúa 🌾`,
        time: t.createdAt,
        expiresAtTimestamp: t.expiresAtTimestamp || (t.createdAtTimestamp ? t.createdAtTimestamp + 30000 : 0),
        tradeId: t.id,
        link: 'giao-dich.html'
      }));

      return res.json({
        steam_id: reqSteamId,
        persona_name: pilotPlayer.name || `Player_${reqSteamId.slice(-4)}`,
        avatar: pilotPlayer.avatar || "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg",
        role: garageStatus.roleName || "Thành viên ST25",
        roleKey: garageStatus.roleKey || "default",
        maxSlots: garageStatus.maxSlots || 3,
        totalParked: garageStatus.totalParked || 0,
        notifications: notifications,
        unreadCount: notifications.length,
        linked: true,
        isLoggedIn: true,
        isAdmin: isAdmin,
        isSuperAdmin: isSuperAdmin,
        playtime_hours: Math.round((pilotPlayer.totalPlaySec || 0) / 3600),
        coins: (pilotPlayer.wallet && pilotPlayer.wallet.balance) !== undefined ? pilotPlayer.wallet.balance : ((getPortalData().userWallets && getPortalData().userWallets[reqSteamId]) || 0),
        balance: (pilotPlayer.wallet && pilotPlayer.wallet.balance) !== undefined ? pilotPlayer.wallet.balance : ((getPortalData().userWallets && getPortalData().userWallets[reqSteamId]) || 0),
        lua: (pilotPlayer.wallet && pilotPlayer.wallet.balance) !== undefined ? pilotPlayer.wallet.balance : ((getPortalData().userWallets && getPortalData().userWallets[reqSteamId]) || 0),
        discord: pilotPlayer.discord,
        dino: {
          species: pilotPlayer.species,
          gender: pilotPlayer.female ? "Cái (Female)" : "Đực (Male)",
          growth: Math.round((pilotPlayer.growth || 0) * 100),
          health: normalizeStatPct(pilotPlayer.health, pilotPlayer.maxHealth),
          hunger: normalizeStatPct(pilotPlayer.hunger, pilotPlayer.maxHunger),
          thirst: normalizeStatPct(pilotPlayer.thirst, pilotPlayer.maxThirst),
          stamina: 100,
          isPrimeElder: pilotPlayer.isPrimeElder || false,
          position: pilotPlayer.position,
          lat: loc.lat,
          lng: loc.lng,
          grid: loc.grid
        }
      });
    }
  }

  if (reqSteamId) return res.status(503).json({ error: 'Không thể cập nhật tài khoản IslePilot.' });
  res.json({ linked: false, isLoggedIn: false, isAdmin: false, isSuperAdmin: false, persona_name: "Chưa liên kết", avatar: null, coins: 0, balance: 0, lua: 0 });
});


app.post(ST25API.routes.playerLogout, (req, res) => {
  res.clearCookie('st25_steam_id');
  res.clearCookie('st25_session_token');
  res.json({ success: true, message: "Đã đăng xuất thành công!" });
});



// Chuyển đổi nhanh Steam ID Profile
app.post(ST25API.routes.playerSessionSwitch, async (req, res) => {
  const { steamId } = req.body;
  if (!steamId) return res.status(400).json({ error: "Thiếu steamId" });
  await linkPlayerBySteamId(steamId);
  res.json({ success: true });
});


/* ==================== ISLEPILOT V1 OFFICIAL STANDARD ENDPOINTS ==================== */

// 15.1 Daily Bonus Reward (POST /api/player/daily -> IslePilot /players/{steamId}/daily)
app.post(ST25API.routes.playerDaily, async (req, res) => {
  const steamId = getRequestSteamId(req);
  if (!steamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam trước khi điểm danh nhận thưởng!" });
  }

  const result = await callIslePilot(PilotAPI.playerDaily(steamId), 'POST', {});
  if (result && !result.error && !result.missingScope) {
    return res.json({
      success: true,
      message: "Điểm danh hàng ngày thành công! Bạn đã nhận Lúa 🌾 thưởng từ máy chủ.",
      data: result
    });
  }

  if (result && result._status === 403) {
    return res.status(403).json({ error: "Tính năng Điểm Danh Daily chưa được cấp quyền trên gói máy chủ (Thiếu scope currency:write)." });
  }

  // Fallback if already claimed or other message
  res.status(result?._status || 400).json({
    error: result?.error || "Không thể nhận thưởng hôm nay. Bạn có thể đã điểm danh rồi hoặc máy chủ bận!"
  });
});


app.get(ST25API.routes.playerOwnedSkins, async (req, res) => {
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.json({ skins: [] });

  const data = await callIslePilot(PilotAPI.playerSkins(steamId));
  if (data && data.skins) {
    return res.json(data.skins);
  }
  res.json([]);
});
};
