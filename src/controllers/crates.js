const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
// crates feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {getPortalData, savePortalData, callIslePilot, clearPlayerCache, getRequestSteamId, getLivePlayerBalance, modifyLivePlayerBalance, GACHA_HALLOWEEN_FALLBACK, getLiveIslePilotCrates} = context;


// 1. Danh sách các hòm mở thưởng (Đồng bộ thời gian thực từ IslePilot Cloud)
app.get(ST25API.routes.cratesList, async (req, res) => {
  const steamId = getRequestSteamId(req);
  const userBal = steamId ? await getLivePlayerBalance(steamId) : 0;
  const crates = await getLiveIslePilotCrates();

  res.json({
    steamId: steamId || null,
    balance: userBal,
    crates: crates,
    cloudSync: true,
    serverDashboardUrl: "https://islepilot.eu/dashboard/servers/cmufraiwk7fnooa01vpdzdhm4"
  });
});


// 2. Mở Hòm May Mắn — Tính Năng Hiện Đang Tạm Đóng
app.post(ST25API.routes.cratesOpen, async (req, res) => {
  const steamId = getRequestSteamId(req);

  if (!steamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam để quay thưởng!" });
  }

  const cleanSteamId = String(steamId || '').trim();
  if (req.body.steamId && req.body.steamId !== cleanSteamId) {
    return res.status(403).json({ error: "Tài khoản không hợp lệ!" });
  }

  return res.status(403).json({ error: "Tính năng Mở Hòm May Mắn hiện đang tạm đóng để bảo trì!" });
});
};

