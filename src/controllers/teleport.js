const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
// teleport feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {callIslePilot, getRequestSteamId} = context;


// 15.2 Teleport Locations & Action
app.get(ST25API.routes.teleportDestinations, async (req, res) => {
  const data = await callIslePilot(PilotAPI.paths.teleportLocations);
  if (data && data.locations) {
    return res.json(data.locations);
  }
  if (data && data._status === 403) {
    return res.status(403).json({ error: "Chức năng dịch chuyển chưa được mở trên máy chủ (Thiếu scope teleport:read)." });
  }
  res.json([]);
});


app.post(ST25API.routes.teleportExecute, async (req, res) => {
  const { locationId } = req.body;
  const steamId = getRequestSteamId(req);
  if (!steamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam trước khi dịch chuyển!" });
  }
  if (!locationId) {
    return res.status(400).json({ error: "Vui lòng chọn điểm dịch chuyển!" });
  }

  const result = await callIslePilot(PilotAPI.playerTeleport(steamId), 'POST', { locationId });
  if (result && !result.error && !result.missingScope) {
    return res.json({ success: true, message: "Dịch chuyển thành công! Vui lòng kiểm tra trong game.", data: result });
  }

  res.status(result?._status || 400).json({
    error: result?.error || "Dịch chuyển thất bại. Vui lòng kiểm tra lại máu, growth hoặc trạng thái an toàn!"
  });
});


// 15.3 Friend Teleport Code (Create & Redeem)
app.post(ST25API.routes.teleportFriendCode, async (req, res) => {
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.status(401).json({ error: "Vui lòng đăng nhập Steam!" });

  const result = await callIslePilot(PilotAPI.playerTeleportFriendCode(steamId), 'POST', {});
  if (result && !result.error) {
    return res.json(result);
  }
  res.status(result?._status || 400).json({ error: result?.error || "Không thể tạo mã dịch chuyển bạn bè lúc này!" });
});


app.post(ST25API.routes.teleportRedeemFriend, async (req, res) => {
  const { code } = req.body;
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.status(401).json({ error: "Vui lòng đăng nhập Steam!" });
  if (!code) return res.status(400).json({ error: "Vui lòng nhập mã bạn bè!" });

  const result = await callIslePilot(PilotAPI.playerTeleportRedeem(steamId), 'POST', { code });
  if (result && !result.error) {
    return res.json({ success: true, message: "Đã kích hoạt dịch chuyển đến vị trí bạn bè!", data: result });
  }
  res.status(result?._status || 400).json({ error: result?.error || "Mã bạn bè không hợp lệ hoặc đã hết hạn!" });
});
};
