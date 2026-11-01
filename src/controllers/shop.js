const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
// shop feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {callIslePilot, getRequestSteamId} = context;


// 15.4 Official IslePilot Shop Dinos
app.get(ST25API.routes.shopDinosCatalog, async (req, res) => {
  const data = await callIslePilot(PilotAPI.paths.shopDinos);
  if (data && data.dinos) {
    return res.json(data.dinos);
  }
  if (data && data._status === 403) {
    return res.status(403).json({ error: "Shop Khủng Long chưa kích hoạt scope shop:read." });
  }
  res.json([]);
});


app.post(ST25API.routes.shopBuyDino, async (req, res) => {
  const { dinoListingId } = req.body;
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.status(401).json({ error: "Vui lòng đăng nhập Steam!" });
  if (!dinoListingId) return res.status(400).json({ error: "Thiếu thông tin vật phẩm!" });

  const result = await callIslePilot(PilotAPI.playerDinos(steamId), 'POST', { listingId: dinoListingId });
  if (result && !result.error) {
    return res.json({ success: true, message: "Đã mua khủng long thành công vào Gara Cloud!", data: result });
  }
  res.status(result?._status || 400).json({ error: result?.error || "Giao dịch không thành công!" });
});


// 15.5 Official IslePilot Shop Skins & Player Owned Skins
app.get(ST25API.routes.shopSkinsCatalog, async (req, res) => {
  const data = await callIslePilot(PilotAPI.paths.shopSkins);
  if (data && data.skins) {
    return res.json(data.skins);
  }
  res.json([]);
});
};
