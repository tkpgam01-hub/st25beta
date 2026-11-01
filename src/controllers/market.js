const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
// market feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {getPortalData, savePortalData, callIslePilot, clearPlayerCache, acquirePlayerLock, releasePlayerLock, getRequestSteamId, getPlayerGarageStatus, addDinoToGarage, getLivePlayerBalance, modifyLivePlayerBalance} = context;


// 9.5 Bảng Quy Định Bán Khủng Long (GET /sell-rules)
app.get(ST25API.routes.marketSellRules, async (req, res) => {
  const result = await callIslePilot(PilotAPI.paths.sellRules);
  res.json((result && result.rules) || []);
});


app.get(ST25API.routes.marketData, async (req, res) => {
  const data = getPortalData();
  const steamId = getRequestSteamId(req);
  const userBalance = steamId ? await getLivePlayerBalance(steamId) : 0;
  let personaName = "Khách (Chưa đăng nhập)";

  if (steamId) {
    const p = await callIslePilot(PilotAPI.player(steamId));
    if (p && p.name) personaName = p.name;
    else personaName = `Player_${steamId.slice(-4)}`;
  }

  // Lấy khủng long trong Gara để cho phép chọn đăng bán (bao gồm cả Cloud Gara và thú trúng từ Hòm)
  let myGarageDinos = [];
  if (steamId) {
    try {
      const garageStatus = await getPlayerGarageStatus(steamId);
      if (garageStatus && Array.isArray(garageStatus.dinos)) {
        myGarageDinos = garageStatus.dinos.map(g => {
          const rawG = g.growth !== undefined ? Number(g.growth) : 1;
          const displayGrowth = rawG > 1 ? Math.min(100, Math.round(rawG)) : Math.round(rawG * 100);
          return {
            id: g.id,
            species: g.species,
            growth: displayGrowth,
            gender: (g.gender === 'Female' || g.gender === 'Cái (Female)') ? "Cái (Female)" : "Đực (Male)",
            isPrimeElder: g.isPrimeElder || false,
            source: g.source || (g.isLocal ? "Hòm May Mắn" : "IslePilot Cloud")
          };
        });
      }
    } catch (_) {}
  }

  res.json({
    steamId: steamId || null,
    personaName: personaName,
    balance: userBalance,
    listings: data.marketListings,
    inventory: steamId ? (data.userInventory[steamId] || []) : [],
    myGarageDinos: myGarageDinos,
    myVouchers: steamId ? ((data.userInventory[steamId] || []).filter(i => i.type === 'dino_voucher' || i.type === 'dino')) : []
  });
});


// Đăng bán Dino từ Gara lên Chợ P2P
app.post(ST25API.routes.marketListDino, async (req, res) => {
  const { dinoId, price, customTitle } = req.body;
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.status(401).json({ error: "Vui lòng đăng nhập Steam để đăng bán!" });
  if (!dinoId || !Number.isSafeInteger(Number(price)) || Number(price) < 1) return res.status(400).json({ error: "Thông tin bán không hợp lệ!" });

  const numPrice = Math.round(Number(price));
  const data = getPortalData();
  const garageStatus = await getPlayerGarageStatus(steamId);
  const targetDino = garageStatus.dinos.find(d => String(d.id) === String(dinoId));

  if (!targetDino) {
    return res.status(404).json({ error: "Khủng long này không tồn tại trong Gara của bạn hoặc đã được đăng bán rồi!" });
  }

  // Tránh đăng bán 2 lần cùng 1 con khủng long
  if (!data.marketListings) data.marketListings = [];
  const alreadyListed = data.marketListings.some(l => l.dinoData && String(l.dinoData.id) === String(dinoId));
  if (alreadyListed) {
    return res.status(400).json({ error: "Khủng long này đang được đăng bán trên Chợ rồi!" });
  }

  const rawG = targetDino.growth !== undefined ? Number(targetDino.growth) : 1;
  const displayGrowth = rawG > 1 ? Math.min(100, Math.round(rawG)) : Math.round(rawG * 100);

  // Tạo tin rao bán
  const listingId = `mkt-${Date.now()}`;
  let sellerName = `Player_${steamId.slice(-4)}`;
  try {
    const p = await callIslePilot(PilotAPI.player(steamId));
    if (p && p.name) sellerName = p.name;
  } catch (_) {}

  const isLocalDino = Boolean(targetDino.isLocal || String(dinoId).startsWith('dino-'));
  const listing = {
    id: listingId,
    seller: sellerName,
    sellerSteamId: steamId,
    title: customTitle || `${targetDino.species} ${displayGrowth}% (${targetDino.gender || 'Đực'})`,
    species: targetDino.species,
    gender: (targetDino.gender === 'Female' || targetDino.gender === 'Cái (Female)') ? "Cái (Female)" : "Đực (Male)",
    price: numPrice,
    growth: displayGrowth,
    diet: targetDino.diet ? (Array.isArray(targetDino.diet) ? targetDino.diet.join('-') : targetDino.diet) : "S-S-D",
    icon: targetDino.species === 'Deinosuchus' ? '🐊' : (targetDino.species === 'Triceratops' ? '🦏' : '🦖'),
    dinoData: {
      ...targetDino,
      growth: displayGrowth,
      isLocal: isLocalDino
    },
    createdAt: new Date().toLocaleString('vi-VN')
  };

  // Nếu là local dino trong userGarage thì chuyển ra khỏi userGarage sang chế độ ký gửi Chợ
  if (data.userGarage && data.userGarage[steamId]) {
    data.userGarage[steamId] = data.userGarage[steamId].filter(d => String(d.id) !== String(dinoId));
  }

  data.marketListings.unshift(listing);
  savePortalData(data);
  clearPlayerCache(steamId);

  res.json({
    success: true,
    message: `Đã đăng bán [${listing.title}] với giá ${numPrice} Lúa 🌾 lên Chợ thành công! Khủng long đã được chuyển sang chế độ ký gửi.`,
    listing
  });
});


// Thu hồi bài đăng bán trên Chợ
app.post(ST25API.routes.marketCancelListing, async (req, res) => {
  const { listingId } = req.body;
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.status(401).json({ error: "Vui lòng đăng nhập Steam!" });

  const data = getPortalData();
  const idx = (data.marketListings || []).findIndex(l => l.id === listingId);
  if (idx === -1) return res.status(404).json({ error: "Bài đăng không tồn tại hoặc đã được mua!" });

  const listing = data.marketListings[idx];
  if (listing.sellerSteamId !== steamId) {
    return res.status(403).json({ error: "Bạn không có quyền thu hồi bài đăng của người khác!" });
  }

  // Khôi phục khủng long về lại Gara của người bán:
  const dino = listing.dinoData;
  if (dino) {
    const isLocalDino = Boolean(dino.isLocal || String(dino.id).startsWith('dino-'));
    if (isLocalDino) {
      if (!data.userGarage) data.userGarage = {};
      if (!data.userGarage[steamId]) data.userGarage[steamId] = [];
      const alreadyExists = data.userGarage[steamId].some(d => String(d.id) === String(dino.id));
      if (!alreadyExists) {
        data.userGarage[steamId].push({
          ...dino,
          stored_at: new Date().toLocaleString('vi-VN')
        });
      }
    } else {
      // Đối với Cloud Dino: Khi bài đăng bị xóa khỏi marketListings,
      // ID của nó không còn nằm trong activeSellingDinoIds, nên nó sẽ hiển thị trở lại trong Gara qua Cloud.
      // Bảo hiểm: Nếu trên Cloud vì lý do gì không thấy con này, tự động khôi phục vào local garage
      try {
        const pilotGarage = await callIslePilot(PilotAPI.playerGarage(steamId), 'GET', null, true);
        const cloudDinos = (pilotGarage && pilotGarage.garage && Array.isArray(pilotGarage.garage)) ? pilotGarage.garage : [];
        const inCloud = cloudDinos.some(cd => String(cd.id) === String(dino.id));
        if (!inCloud) {
          if (!data.userGarage) data.userGarage = {};
          if (!data.userGarage[steamId]) data.userGarage[steamId] = [];
          data.userGarage[steamId].push({
            ...dino,
            id: dino.id || `dino-${Date.now()}`,
            isLocal: true,
            stored_at: new Date().toLocaleString('vi-VN')
          });
        }
      } catch (_) {}
    }
  }

  data.marketListings.splice(idx, 1);
  savePortalData(data);
  clearPlayerCache(steamId);

  res.json({
    success: true,
    message: `Đã thu hồi bài đăng bán [${listing.title}] thành công! Khủng long đã quay trở về Gara của bạn.`
  });
});


app.post(ST25API.routes.marketTransfer, async (req, res) => {
  const { receiverSteamId, amount, note } = req.body;
  // BẢO MẬT: Bắt buộc lấy người gửi từ phiên đăng nhập thực tế của hệ thống! TUYỆT ĐỐI KHÔNG LẤY TỪ BODY
  const senderSteamId = getRequestSteamId(req);
  if (!senderSteamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam để chuyển Lúa!" });
  }

  const cleanReceiver = String(receiverSteamId || '').trim();
  if (!cleanReceiver || !/^\d{17}$/.test(cleanReceiver)) {
    return res.status(400).json({ error: "Steam ID người nhận không hợp lệ! Vui lòng nhập đúng 17 chữ số Steam ID 64." });
  }

  if (cleanReceiver === senderSteamId) {
    return res.status(400).json({ error: "Bạn không thể tự chuyển Lúa cho chính mình!" });
  }

  const numAmount = Math.floor(Number(amount));
  if (isNaN(numAmount) || numAmount < 1 || numAmount > 10000) {
    return res.status(400).json({ error: "Số Lúa chuyển phải là số nguyên từ 1 đến 10,000 Lúa 🌾!" });
  }

  // Khóa chống spam click / race condition
  if (!acquirePlayerLock(senderSteamId, 'transfer')) {
    return res.status(429).json({ error: "Giao dịch đang được xử lý, vui lòng không bấm liên tục!" });
  }

  try {
    const senderBal = await getLivePlayerBalance(senderSteamId);
    if (senderBal < numAmount) {
      return res.status(400).json({ error: `Số dư trong tài khoản không đủ! Bạn chỉ có ${senderBal} Lúa 🌾 trên server.` });
    }

    // Deduct from sender via API
    const deductRes = await modifyLivePlayerBalance(senderSteamId, -numAmount, `Chuyển Lúa tới ${cleanReceiver}: ${note || ''}`);
    // Add to receiver via API
    await modifyLivePlayerBalance(cleanReceiver, numAmount, `Nhận Lúa từ ${senderSteamId}: ${note || ''}`);

    res.json({
      success: true,
      message: `Đã chuyển thành công ${numAmount} Lúa 🌾 từ tài khoản của bạn tới ${cleanReceiver}!`,
      newBalance: deductRes.balance
    });
  } catch (err) {
    console.error('Lỗi chuyển Lúa:', err);
    res.status(500).json({ error: "Lỗi hệ thống khi chuyển Lúa! Vui lòng thử lại sau." });
  } finally {
    releasePlayerLock(senderSteamId, 'transfer');
  }
});


// 10.1 Mua Dino từ Chợ (Tự Động Chuyển Thẳng Vào Gara Của Người Mua)
app.post(ST25API.routes.marketBuy, async (req, res) => {
  const { itemId } = req.body;
  const data = getPortalData();
  const steamId = getRequestSteamId(req);
  if (!steamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam để mua vật phẩm!" });
  }

  const itemIndex = (data.marketListings || []).findIndex(i => i.id === itemId);
  if (itemIndex === -1) {
    return res.status(404).json({ error: "Vật phẩm hoặc Dino này đã được người khác mua hoặc đã được thu hồi!" });
  }

  const item = data.marketListings[itemIndex];
  if (item.sellerSteamId === steamId) {
    return res.status(400).json({ error: "Bạn không thể tự mua khủng long của chính mình!" });
  }

  const userBal = await getLivePlayerBalance(steamId);
  if (userBal < item.price) {
    return res.status(400).json({ error: `Tài khoản của bạn không đủ Lúa! Cần ${item.price} Lúa 🌾 (Hiện có ${userBal} Lúa trên server).` });
  }

  // Kiểm tra sức chứa Gara của người mua
  const buyerGarageStatus = await getPlayerGarageStatus(steamId);
  if (buyerGarageStatus.isFull) {
    return res.status(400).json({
      error: `Gara của bạn đã đầy (${buyerGarageStatus.totalParked}/${buyerGarageStatus.maxSlots} ô theo vai trò)! Vui lòng lấy khủng long cũ ra chơi hoặc nâng cấp Gara trước khi mua.`,
      isFull: true,
      upgradeRequired: true
    });
  }

  // 1. Trừ tiền người mua
  const deductRes = await modifyLivePlayerBalance(steamId, -item.price, `Mua ${item.title} từ Chợ ST25`);

  // 2. Cộng tiền người bán
  if (item.sellerSteamId) {
    await modifyLivePlayerBalance(item.sellerSteamId, item.price, `Bán ${item.title} trên Chợ ST25 cho ${steamId}`);
  }

  // 3. Chuyển Khủng Long TRỰC TIẾP VÀO GARA của người mua
  const targetDinoData = item.dinoData || {};
  const newDino = addDinoToGarage(steamId, {
    ...targetDinoData,
    id: `dino-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    species: item.species || targetDinoData.species || "Tyrannosaurus",
    gender: item.gender || targetDinoData.gender || "Đực (Male)",
    growth: item.growth !== undefined ? item.growth : (targetDinoData.growth || 100),
    diet: targetDinoData.diet || ["S", "S", "D"],
    mutations: targetDinoData.mutations || [],
    isPrimeElder: targetDinoData.isPrimeElder || false,
    source: `Mua từ Chợ ST25 (Người bán: ${item.seller})`,
    isLocal: true
  }, data);

  // 4. Xử lý người bán: Đánh dấu dino này vĩnh viễn không còn thuộc về người bán
  if (item.sellerSteamId && targetDinoData.id) {
    if (!data.soldDinos) data.soldDinos = {};
    if (!data.soldDinos[item.sellerSteamId]) data.soldDinos[item.sellerSteamId] = [];
    data.soldDinos[item.sellerSteamId].push(String(targetDinoData.id));

    // Nếu người bán còn lưu trong local userGarage thì dọn sạch
    if (data.userGarage && data.userGarage[item.sellerSteamId]) {
      data.userGarage[item.sellerSteamId] = data.userGarage[item.sellerSteamId].filter(
        d => String(d.id) !== String(targetDinoData.id)
      );
    }

    // Nếu là Cloud Dino trên IslePilot, thử gọi lệnh sell trên cloud
    if (!targetDinoData.isLocal && !String(targetDinoData.id).startsWith('dino-')) {
      try {
        await callIslePilot(PilotAPI.playerGarageItemSell(item.sellerSteamId, targetDinoData.id), 'POST', {});
      } catch (_) {}
    }
  }

  // 5. Xóa bài khỏi Chợ
  data.marketListings = data.marketListings.filter(listing => listing.id !== itemId);
  savePortalData(data);

  // Dọn dẹp cache cho cả hai người
  clearPlayerCache(steamId);
  if (item.sellerSteamId) clearPlayerCache(item.sellerSteamId);

  res.json({
    success: true,
    message: `Đã mua thành công [${item.title}]! Khủng long đã được chuyển trực tiếp vào Gara của bạn.`,
    newBalance: deductRes.balance,
    dino: newDino
  });
});
};
