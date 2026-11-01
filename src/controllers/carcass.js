const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
// carcass feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {getPortalData, savePortalData, callIslePilot, getRequestSteamId, getLivePlayerBalance, modifyLivePlayerBalance, CARCASS_TYPES} = context;


app.get(ST25API.routes.carcassTypes, async (req, res) => {
  const steamId = getRequestSteamId(req);
  const userBalance = steamId ? await getLivePlayerBalance(steamId) : 0;
  const data = getPortalData();
  const userOrders = steamId ? (data.carcassOrders || []).filter(o => o.steamId === steamId) : [];
  res.json({
    balance: userBalance,
    types: CARCASS_TYPES,
    orders: userOrders
  });
});


app.post(ST25API.routes.carcassOrder, async (req, res) => {
  const { carcassId } = req.body;
  const carcass = CARCASS_TYPES.find(c => c.id === carcassId);
  if (!carcass) return res.status(400).json({ error: "Loại xác không hợp lệ!" });

  const steamId = getRequestSteamId(req);
  if (!steamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam để gọi thả xác!" });
  }

  const data = getPortalData();
  const userBal = await getLivePlayerBalance(steamId);

  if (userBal < carcass.price) {
    return res.status(400).json({ error: `Tài khoản của bạn không đủ Lúa để gọi thả xác! Cần ${carcass.price} Lúa 🌾 (Hiện có trên server: ${userBal} Lúa).` });
  }

  // 1. Trừ Lúa trực tiếp từ tài khoản qua IslePilot API
  const deductRes = await modifyLivePlayerBalance(steamId, -carcass.price, `Thả xác tiếp tế ${carcass.name}`);

  let playerName = `Player_${steamId.slice(-4)}`;
  const pilotPlayer = await callIslePilot(PilotAPI.player(steamId));
  if (pilotPlayer && pilotPlayer.name) {
    playerName = pilotPlayer.name;
  }

  // 2. KÍCH HOẠT LỆNH THẬT TRÊN MÁY CHỦ ISLEPILOT:
  // - 2.1 LỆNH RỚT XÁC VẬT LÝ THEO ĐÚNG LOÀI & GROWTH TRỰC TIẾP TẠI TỌA ĐỘ NGƯỜI CHƠI
  await callIslePilot(PilotAPI.paths.commands, 'POST', {
    action: 'carcass',
    steamId: steamId,
    offerId: carcass.id,
    species: carcass.species,
    growth: carcass.growthVal,
    bones: false
  });

  // - 2.2 Phát thông báo tiếp tế toàn server qua IslePilot
  await callIslePilot(PilotAPI.paths.commands, 'POST', {
    action: 'announce',
    message: `🌾 TIẾP TẾ ST25: Đã thả xác [${carcass.name}] ngay vị trí ${playerName}! 🥩`,
    title: "CARCASS DROP"
  });

  const order = {
    id: `drop-${Date.now()}`,
    steamId,
    carcassName: carcass.name,
    price: carcass.price,
    orderedAt: new Date().toLocaleString('vi-VN'),
    status: "Đã Rớt Xác Thành Công",
    note: "Đã thả xác vật lý rơi ngay vị trí của bạn trong game để ăn thịt!"
  };
  data.carcassOrders.unshift(order);
  savePortalData(data);

  res.json({
    success: true,
    message: `Đã trừ ${carcass.price} Lúa 🌾 trong tài khoản. Xác [${carcass.name}] đã được thả rớt ngay vị trí của bạn trong game!`,
    newBalance: deductRes.balance,
    order
  });
});
};
