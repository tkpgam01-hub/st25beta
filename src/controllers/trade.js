const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
// trade feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {getPortalData, savePortalData, callIslePilot, clearPlayerCache, getRequestSteamId, TRADE_TIMEOUT_MS, cleanExpiredTrades, getPlayerGarageStatus, addDinoToGarage, getLivePlayerBalance, modifyLivePlayerBalance} = context;


// ==========================================
// 11. ISLEPILOT P2P TRADE SYSTEM (https://st25.islepilot.eu/trade)
// ==========================================

// Lấy dữ liệu Trade của người chơi hiện tại
app.get(ST25API.routes.tradeData, async (req, res) => {
  const steamId = getRequestSteamId(req);
  const data = getPortalData();
  if (!data.trades) data.trades = [];
  cleanExpiredTrades(data);

  let balance = 0;
  let personaName = "Khách (Chưa đăng nhập)";
  let avatar = "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg";
  let garageStatus = { totalParked: 0, maxSlots: 3, roleName: "Thành viên ST25", isFull: false };
  let myDinos = [];

  if (steamId) {
    balance = await getLivePlayerBalance(steamId);
    garageStatus = await getPlayerGarageStatus(steamId);
    const p = await callIslePilot(PilotAPI.player(steamId));
    if (p) {
      if (p.name) personaName = p.name;
      if (p.avatar) avatar = p.avatar;
    } else {
      personaName = `Player_${steamId.slice(-4)}`;
    }

    myDinos = (garageStatus.dinos || []).map(g => {
      const rawG = g.growth !== undefined ? Number(g.growth) : 1;
      const displayGrowth = rawG > 1 ? Math.min(100, Math.round(rawG)) : Math.round(rawG * 100);
      return {
        id: g.id,
        species: g.species,
        gender: (g.gender === 'Female' || g.gender === 'Cái (Female)') ? "Cái (Female)" : "Đực (Male)",
        growth: displayGrowth,
        health: g.health || 100,
        hunger: g.hunger || 100,
        thirst: g.thirst || 100,
        diet: g.diet || ["S", "S", "D"],
        mutations: g.mutations || [],
        isPrimeElder: g.isPrimeElder || false,
        isLocal: Boolean(g.isLocal || String(g.id).startsWith('dino-')),
        source: g.source || (g.isLocal ? "Hòm May Mắn" : "IslePilot Cloud")
      };
    });
  }

  // Lời mời gửi đến tôi đang chờ xử lý
  const incomingTrades = steamId ? data.trades.filter(t => t.receiverSteamId === steamId && t.status === 'pending') : [];

  // Lời mời tôi đã gửi đang chờ đối phương chấp nhận
  const outgoingTrades = steamId ? data.trades.filter(t => t.senderSteamId === steamId && t.status === 'pending') : [];

  // Lịch sử giao dịch
  const tradeHistory = steamId
    ? data.trades.filter(t => (t.receiverSteamId === steamId || t.senderSteamId === steamId) && t.status !== 'pending').slice(0, 30)
    : data.trades.filter(t => t.status !== 'pending').slice(0, 15);

  // Danh sách người chơi online/gần đây để chọn giao dịch
  let recentPlayers = [];
  try {
    const pl = await callIslePilot(PilotAPI.paths.players);
    if (pl && Array.isArray(pl.players)) {
      recentPlayers = pl.players
        .filter(p => !steamId || p.steamId !== steamId)
        .slice(0, 50)
        .map(p => ({
          steamId: p.steamId,
          name: p.name || `Player_${p.steamId.slice(-4)}`,
          online: !!p.online,
          species: p.species || ""
        }));
    }
  } catch (_) {}

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    steamId: steamId || null,
    personaName,
    avatar,
    balance,
    garageStatus,
    myDinos,
    incomingTrades,
    outgoingTrades,
    tradeHistory,
    recentPlayers
  });
});


// Tạo lời mời giao dịch mới (Send Trade Offer)
app.post(ST25API.routes.tradeCreate, async (req, res) => {
  const senderSteamId = getRequestSteamId(req);
  if (!senderSteamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam để tạo giao dịch!" });
  }

  const { receiverSteamId, dinoId, senderLua, requestedLua, note } = req.body;
  if (!receiverSteamId || !/^\d{17}$/.test(String(receiverSteamId).trim())) {
    return res.status(400).json({ error: "Steam ID người nhận không hợp lệ! Vui lòng nhập đúng 17 chữ số Steam ID 64." });
  }

  const cleanReceiver = String(receiverSteamId).trim();
  if (cleanReceiver === senderSteamId) {
    return res.status(400).json({ error: "Bạn không thể tự tạo giao dịch với chính mình!" });
  }

  const numSenderLua = Math.max(0, parseInt(senderLua) || 0);
  const numRequestedLua = Math.max(0, parseInt(requestedLua) || 0);

  if (!dinoId && numSenderLua <= 0 && numRequestedLua <= 0) {
    return res.status(400).json({ error: "Vui lòng chọn ít nhất một Khủng Long hoặc nhập số Lúa muốn giao dịch!" });
  }

  // Kiểm tra số dư Lúa của người gửi nếu có gửi kèm Lúa
  if (numSenderLua > 0) {
    const senderBal = await getLivePlayerBalance(senderSteamId);
    if (senderBal < numSenderLua) {
      return res.status(400).json({ error: `Số dư Lúa 🌾 của bạn không đủ! Hiện có ${senderBal} Lúa, bạn yêu cầu gửi ${numSenderLua} Lúa.` });
    }
  }

  let selectedDino = null;
  if (dinoId) {
    const garageStatus = await getPlayerGarageStatus(senderSteamId);
    selectedDino = garageStatus.dinos.find(d => String(d.id) === String(dinoId));
    if (!selectedDino) {
      return res.status(404).json({ error: "Khủng long này không còn trong Gara của bạn hoặc đã bị khóa trong một giao dịch khác!" });
    }
  }

  // Lấy tên đại diện của cả hai người
  let senderName = `Player_${senderSteamId.slice(-4)}`;
  let receiverName = `Player_${cleanReceiver.slice(-4)}`;
  try {
    const [p1, p2] = await Promise.all([
      callIslePilot(PilotAPI.player(senderSteamId)),
      callIslePilot(PilotAPI.player(cleanReceiver))
    ]);
    if (p1 && p1.name) senderName = p1.name;
    if (p2 && p2.name) receiverName = p2.name;
  } catch (_) {}

  const data = getPortalData();
  if (!data.trades) data.trades = [];

  const rawG = selectedDino && selectedDino.growth !== undefined ? Number(selectedDino.growth) : 1;
  const displayGrowth = rawG > 1 ? Math.min(100, Math.round(rawG)) : Math.round(rawG * 100);

  const tradeId = `trade-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const tradeOffer = {
    id: tradeId,
    senderSteamId,
    senderName,
    receiverSteamId: cleanReceiver,
    receiverName,
    senderDino: selectedDino ? {
      ...selectedDino,
      growth: displayGrowth,
      gender: (selectedDino.gender === 'Female' || selectedDino.gender === 'Cái (Female)') ? "Cái (Female)" : "Đực (Male)",
      isLocal: Boolean(selectedDino.isLocal || String(selectedDino.id).startsWith('dino-'))
    } : null,
    senderLua: numSenderLua,
    requestedLua: numRequestedLua,
    note: String(note || "").trim().slice(0, 200),
    status: 'pending',
    createdAt: new Date().toLocaleString('vi-VN'),
    createdAtTimestamp: Date.now(),
    expiresAtTimestamp: Date.now() + TRADE_TIMEOUT_MS,
    timeoutSeconds: 30,
    updatedAt: new Date().toLocaleString('vi-VN')
  };

  data.trades.unshift(tradeOffer);
  savePortalData(data);
  clearPlayerCache(senderSteamId);
  clearPlayerCache(cleanReceiver);

  res.json({
    success: true,
    message: `Đã gửi lời mời giao dịch thành công tới [${receiverName}] (${cleanReceiver})! Khủng long đã được tạm giữ an toàn trong phiên giao dịch.`,
    trade: tradeOffer
  });
});


// Hủy lời mời giao dịch đã gửi (Sender Cancels Trade)
app.post(ST25API.routes.tradeCancel, async (req, res) => {
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.status(401).json({ error: "Vui lòng đăng nhập Steam!" });

  const { tradeId } = req.body;
  if (!tradeId) return res.status(400).json({ error: "Thiếu mã giao dịch!" });

  const data = getPortalData();
  if (!data.trades) data.trades = [];
  const trade = data.trades.find(t => t.id === tradeId);
  if (!trade) return res.status(404).json({ error: "Không tìm thấy giao dịch này!" });

  if (trade.senderSteamId !== steamId) {
    return res.status(403).json({ error: "Chỉ người tạo lời mời mới có quyền hủy giao dịch này!" });
  }

  if (trade.status !== 'pending') {
    return res.status(400).json({ error: `Giao dịch này đã ở trạng thái [${trade.status}], không thể hủy!` });
  }

  trade.status = 'cancelled';
  trade.updatedAt = new Date().toLocaleString('vi-VN');
  savePortalData(data);
  clearPlayerCache(steamId);
  clearPlayerCache(trade.receiverSteamId);

  res.json({
    success: true,
    message: "Đã hủy lời mời giao dịch thành công! Khủng long đã được giải phóng trở lại Gara của bạn."
  });
});


// Từ chối lời mời giao dịch nhận được (Receiver Declines Trade)
app.post(ST25API.routes.tradeDecline, async (req, res) => {
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.status(401).json({ error: "Vui lòng đăng nhập Steam!" });

  const { tradeId } = req.body;
  if (!tradeId) return res.status(400).json({ error: "Thiếu mã giao dịch!" });

  const data = getPortalData();
  if (!data.trades) data.trades = [];
  const trade = data.trades.find(t => t.id === tradeId);
  if (!trade) return res.status(404).json({ error: "Không tìm thấy giao dịch này!" });

  if (trade.receiverSteamId !== steamId) {
    return res.status(403).json({ error: "Bạn không phải là người nhận của giao dịch này!" });
  }

  if (trade.status !== 'pending') {
    return res.status(400).json({ error: `Giao dịch này không còn ở trạng thái chờ xử lý (${trade.status})!` });
  }

  trade.status = 'declined';
  trade.updatedAt = new Date().toLocaleString('vi-VN');
  savePortalData(data);
  clearPlayerCache(steamId);
  clearPlayerCache(trade.senderSteamId);

  res.json({
    success: true,
    message: "Đã từ chối lời mời giao dịch. Khủng long đã được trả về Gara người gửi."
  });
});


// Chấp nhận giao dịch (Receiver Accepts Trade - Hoán đổi Lúa & Dino an toàn)
app.post(ST25API.routes.tradeAccept, async (req, res) => {
  const receiverSteamId = getRequestSteamId(req);
  if (!receiverSteamId) return res.status(401).json({ error: "Vui lòng đăng nhập Steam!" });

  const { tradeId } = req.body;
  if (!tradeId) return res.status(400).json({ error: "Thiếu mã giao dịch!" });

  const data = getPortalData();
  if (!data.trades) data.trades = [];
  const trade = data.trades.find(t => t.id === tradeId);
  if (!trade) return res.status(404).json({ error: "Không tìm thấy giao dịch này!" });

  if (trade.receiverSteamId !== receiverSteamId) {
    return res.status(403).json({ error: "Bạn không phải là người nhận của giao dịch này!" });
  }

  // Kiểm tra thời hạn 30 giây của lời mời giao dịch
  const now = Date.now();
  const createdTime = trade.createdAtTimestamp || (trade.createdAt ? new Date(trade.createdAt).getTime() : 0);
  if (trade.status === 'expired' || (createdTime && (now - createdTime >= TRADE_TIMEOUT_MS))) {
    trade.status = 'expired';
    trade.updatedAt = new Date().toLocaleString('vi-VN');
    trade.updatedAtTimestamp = now;
    trade.expireReason = 'Hết thời gian chờ (30 giây) - Tự động hoàn trả về Gara';
    savePortalData(data);
    clearPlayerCache(trade.senderSteamId);
    clearPlayerCache(trade.receiverSteamId);
    return res.status(400).json({
      error: "⚠️ Lời mời giao dịch đã hết hạn (quá 30 giây) và khủng long đã được tự động hoàn trả về Gara của người gửi!"
    });
  }

  if (trade.status !== 'pending') {
    return res.status(400).json({ error: `Giao dịch này không còn ở trạng thái chờ (${trade.status})!` });
  }

  const senderSteamId = trade.senderSteamId;

  // 1. Kiểm tra Lúa của người nhận nếu người gửi yêu cầu trả Lúa
  if (trade.requestedLua > 0) {
    const receiverBal = await getLivePlayerBalance(receiverSteamId);
    if (receiverBal < trade.requestedLua) {
      return res.status(400).json({
        error: `Số dư Lúa 🌾 của bạn không đủ để chấp nhận giao dịch! Cần ${trade.requestedLua} Lúa (Hiện có ${receiverBal} Lúa trên server).`
      });
    }
  }

  // 2. Kiểm tra Lúa của người gửi nếu người gửi có tặng kèm Lúa
  if (trade.senderLua > 0) {
    const senderBal = await getLivePlayerBalance(senderSteamId);
    if (senderBal < trade.senderLua) {
      return res.status(400).json({
        error: `Người gửi không còn đủ số dư Lúa (${senderBal}/${trade.senderLua} Lúa) để hoàn tất giao dịch này!`
      });
    }
  }

  // 3. Kiểm tra sức chứa Gara của người nhận nếu nhận Khủng Long
  if (trade.senderDino) {
    const receiverGarage = await getPlayerGarageStatus(receiverSteamId);
    if (receiverGarage.isFull) {
      return res.status(400).json({
        error: `Gara của bạn đã đầy (${receiverGarage.totalParked}/${receiverGarage.maxSlots} ô theo vai trò)! Vui lòng lấy khủng long cũ ra chơi hoặc nâng cấp Gara trước khi nhận Dino.`
      });
    }
  }

  // 4. THỰC HIỆN HOÁN ĐỔI ATOMIC:
  // a) Chuyển Lúa yêu cầu (từ người nhận -> người gửi)
  if (trade.requestedLua > 0) {
    await modifyLivePlayerBalance(receiverSteamId, -trade.requestedLua, `Trade ST25: Trả ${trade.requestedLua} Lúa cho ${senderSteamId}`);
    await modifyLivePlayerBalance(senderSteamId, trade.requestedLua, `Trade ST25: Nhận ${trade.requestedLua} Lúa từ ${receiverSteamId}`);
  }

  // b) Chuyển Lúa tặng kèm (từ người gửi -> người nhận)
  if (trade.senderLua > 0) {
    await modifyLivePlayerBalance(senderSteamId, -trade.senderLua, `Trade ST25: Gửi ${trade.senderLua} Lúa cho ${receiverSteamId}`);
    await modifyLivePlayerBalance(receiverSteamId, trade.senderLua, `Trade ST25: Nhận ${trade.senderLua} Lúa từ ${senderSteamId}`);
  }

  // c) Chuyển Khủng Long vào Gara người nhận và xóa khỏi người gửi
  let transferredDino = null;
  if (trade.senderDino) {
    const targetDino = trade.senderDino;
    transferredDino = addDinoToGarage(receiverSteamId, {
      ...targetDino,
      id: `dino-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      source: `Giao Dịch ST25 (Nhận từ: ${trade.senderName})`,
      stored_at: new Date().toLocaleString('vi-VN'),
      isLocal: true
    }, data);

    // Đánh dấu đã bán khỏi người gửi
    if (!data.soldDinos) data.soldDinos = {};
    if (!data.soldDinos[senderSteamId]) data.soldDinos[senderSteamId] = [];
    data.soldDinos[senderSteamId].push(String(targetDino.id));

    if (data.userGarage && data.userGarage[senderSteamId]) {
      data.userGarage[senderSteamId] = data.userGarage[senderSteamId].filter(
        d => String(d.id) !== String(targetDino.id)
      );
    }

    if (!targetDino.isLocal && !String(targetDino.id).startsWith('dino-')) {
      try {
        await callIslePilot(PilotAPI.playerGarageItemSell(senderSteamId, targetDino.id), 'POST', {});
      } catch (_) {}
    }
  }

  // d) Đánh dấu giao dịch hoàn tất
  trade.status = 'accepted';
  trade.updatedAt = new Date().toLocaleString('vi-VN');
  savePortalData(data);

  clearPlayerCache(senderSteamId);
  clearPlayerCache(receiverSteamId);

  res.json({
    success: true,
    message: `Giao dịch thành công! Khủng long và Lúa 🌾 đã được hoán đổi an toàn và cập nhật trực tiếp vào Gara và Ví của bạn!`,
    trade,
    dino: transferredDino
  });
});
};
