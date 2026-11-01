const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
const {validateSkinPayload} = require('../api/skin-payload');
// skin feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {getPortalData, savePortalData, callIslePilot, clearPlayerCache, getRequestSteamId, getAdminSteamId, getLivePlayerBalance, modifyLivePlayerBalance, hexToLinear} = context;


// Lấy thông tin Skin, Khủng long đang chơi & Số Dư Lúa từ IslePilot Cloud
app.get(ST25API.routes.skinInfo, async (req, res) => {
  const callerSteamId = getRequestSteamId(req);
  const target = String(req.query.steamId || '').trim();
  const steamId = getAdminSteamId(req) && /^\d{17}$/.test(target) ? target : callerSteamId;
  const userBal = steamId ? await getLivePlayerBalance(steamId) : 0;
  let personaName = "Chưa đăng nhập Steam";
  let species = "Tyrannosaurus";
  let growth = 100;
  let isOnline = false;
  let ownedSkins = [];

  if (steamId) {
    const [p, pilotSkins] = await Promise.all([
      callIslePilot(PilotAPI.player(steamId), 'GET', null, true),
      callIslePilot(PilotAPI.playerSkins(steamId), 'GET', null, true)
    ]);

    if (p) {
      if (p.name) personaName = p.name;
      if (p.species) species = p.species;
      if (p.growth !== undefined) growth = Math.round(p.growth * 100);
      isOnline = p.online !== false;
    }

    if (pilotSkins && Array.isArray(pilotSkins.skins)) {
      ownedSkins = pilotSkins.skins;
    }

    // Kết hợp skin nhận từ Hòm Quà trong portal-data nếu có
    const portalData = getPortalData();
    if (portalData.userInventory && portalData.userInventory[steamId]) {
      const giftSkins = portalData.userInventory[steamId].filter(i => i.type === 'skin');
      giftSkins.forEach(gs => {
        if (!ownedSkins.some(os => os.name === gs.name)) {
          ownedSkins.push({
            id: gs.id,
            name: gs.name,
            icon: gs.icon || '🎨',
            source: 'Hòm May Mắn ST25'
          });
        }
      });
    }
  }

  // Lấy skin shop trực tiếp từ IslePilot API
  const shopData = await callIslePilot(PilotAPI.paths.shopSkins);
  let shopSkins = (shopData && shopData.skins && shopData.skins.length > 0) ? shopData.skins : [
    { id: "cmuvdy3510ehdqq0190p5cmyd", name: "Tyrannosaurus Halloween", price: 20, species: "Tyrannosaurus", icon: "🎃" }
  ];

  res.json({
    steamId: steamId || null,
    personaName: personaName,
    balance: userBal,
    species: species,
    growth: growth,
    isOnline: isOnline,
    ownedSkins: ownedSkins,
    shopSkins: shopSkins
  });
});


// Đổi Màu Skin Khủng Long Trực Tiếp Khi Đang Chơi In-game (IslePilot Live Skin Apply)
app.post(ST25API.routes.skinApply, async (req, res) => {
  const { species, colors, skinCode, female, gender, variation, pattern, theme } = req.body;
  const steamId = getRequestSteamId(req);

  if (!steamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam để đổi màu skin!" });
  }

  let importedPayload=null;
  if(req.body.payload!==undefined){
    try{importedPayload=validateSkinPayload(req.body.payload);}catch(error){return res.status(400).json({error:error.message});}
  }

  // 1. Kiểm tra số dư Lúa (Phí 10 Lúa để đổi màu da trực tiếp)
  const SKIN_APPLY_COST = 10;
  const curBal = await getLivePlayerBalance(steamId);
  if (curBal < SKIN_APPLY_COST) {
    return res.status(400).json({
      error: `Tài khoản của bạn không đủ Lúa! Phí đổi màu da trực tiếp là ${SKIN_APPLY_COST} Lúa 🌾 (Số dư hiện tại: ${curBal} Lúa). Hãy hoàn thành Quests hoặc mở hòm để nạp thêm!`
    });
  }

  // 2. Kiểm tra trạng thái nhân vật khủng long in-game
  const pInfo = await callIslePilot(PilotAPI.player(steamId), 'GET', null, true);
  if (!pInfo || !pInfo.species) {
    return res.status(400).json({
      error: "Bạn hiện không có khủng long nào đang sống trên server ST25! Vui lòng vào game spawn nhân vật trước khi đổi màu skin."
    });
  }

  const activeSpecies = importedPayload ? importedPayload.class.slice(3,-2) : species || pInfo.species;
  const isFemale = female !== undefined 
    ? Boolean(female) 
    : (gender ? (gender === 'female' || gender === 'cai') : (pInfo.female === true));

  // Lập payload chuẩn IslePilot Unreal Engine Blueprint đầy đủ 10 kênh màu và cấu hình
  const cleanSpecies = activeSpecies.replace(/[^a-zA-Z0-9]+/g, "");
  const payload = importedPayload || {
    class: `BP_${cleanSpecies}_C`,
    female: isFemale,
    variation: parseInt(variation) || 0,
    pattern: parseInt(pattern) || 0,
    theme: parseInt(theme) || 0,
    body: hexToLinear(colors?.body || colors?.base || "#897559"),
    markings: hexToLinear(colors?.markings || colors?.pattern || "#352f2a"),
    flank: hexToLinear(colors?.flank || colors?.base || "#594a35"),
    underbelly: hexToLinear(colors?.underbelly || colors?.belly || "#d3b48b"),
    detail1: hexToLinear(colors?.detail1 || colors?.detail || "#000000"),
    eyes: hexToLinear(colors?.eyes || colors?.eye || "#ffdfcb"),
    male_display: hexToLinear(colors?.male_display || colors?.display || "#6c3729"),
    teeth: hexToLinear(colors?.teeth || "#e8e2d0"),
    mouth: hexToLinear(colors?.mouth || "#7a3b3b"),
    claws: hexToLinear(colors?.claws || "#3a3a3a")
  };

  // 3. Gọi trực tiếp IslePilot API: POST /players/{steamId}/skin/apply
  const applyRes = await callIslePilot(PilotAPI.playerSkinApply(steamId), 'POST', { payload });

  if (applyRes && (applyRes.ok || applyRes.jobId || !applyRes.error)) {
    // Trừ 10 Lúa qua hệ thống Currency của IslePilot
    const deduct = await modifyLivePlayerBalance(steamId, -SKIN_APPLY_COST, `Đổi màu skin in-game cho ${activeSpecies}`);
    
    // Xóa cache để cập nhật ngay
    clearPlayerCache(steamId);

    return res.json({
      success: true,
      message: `Đã đổi màu skin cho [${activeSpecies}] trực tiếp in-game thành công! Màu sắc đã áp dụng ngay vào nhân vật của bạn trên server ST25. Đã trừ ${SKIN_APPLY_COST} Lúa 🌾.`,
      newBalance: deduct.balance,
      jobId: applyRes.jobId
    });
  }

  res.status(400).json({
    error: applyRes?.error || "Không thể áp dụng skin lên nhân vật lúc này! Đảm bảo nhân vật của bạn đang trong game và không combat log."
  });
});


// Mua Skin từ Shop bằng Lúa (POST /api/skin/buy)
app.post(ST25API.routes.skinBuy, async (req, res) => {
  const { skinId, skinName, price } = req.body;
  const steamId = getRequestSteamId(req);

  if (!steamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam để mua skin!" });
  }

  const skinPrice = Number(price) || 20;
  const curBal = await getLivePlayerBalance(steamId);
  if (curBal < skinPrice) {
    return res.status(400).json({
      error: `Số dư Lúa không đủ! Cần ${skinPrice} Lúa 🌾 (Bạn hiện có: ${curBal} Lúa).`
    });
  }

  // Gọi IslePilot API mua skin
  const pilotRes = await callIslePilot(PilotAPI.playerSkins(steamId), 'POST', { shopSkinId: skinId });

  // Trừ Lúa
  const deduct = await modifyLivePlayerBalance(steamId, -skinPrice, `Mua skin shop: ${skinName || skinId}`);

  // Lưu vào kho portal-data
  const portalData = getPortalData();
  if (!portalData.userInventory) portalData.userInventory = {};
  if (!portalData.userInventory[steamId]) portalData.userInventory[steamId] = [];
  portalData.userInventory[steamId].push({
    id: `skin-${skinId}-${Date.now()}`,
    name: skinName || "Skin Mua Từ Cửa Hàng",
    icon: "🎨",
    desc: `Skin độc quyền mua với giá ${skinPrice} Lúa 🌾`,
    type: "skin"
  });
  savePortalData(portalData);

  res.json({
    success: true,
    message: `Đã mua thành công skin [${skinName}] với giá ${skinPrice} Lúa 🌾! Skin đã được thêm vào kho của bạn.`,
    newBalance: deduct.balance
  });
});


// Áp Dụng Skin Preset Đã Sở Hữu Vào Game (POST /api/skin/preset/apply)
app.post(ST25API.routes.skinPresetApply, async (req, res) => {
  const { presetId, variation } = req.body;
  const steamId = getRequestSteamId(req);

  if (!steamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam!" });
  }

  // Gọi IslePilot API: POST /players/{steamId}/skins/{presetId}/apply
  const applyRes = await callIslePilot(PilotAPI.playerSkinsItemApply(steamId, presetId), 'POST', {
    variation: Number(variation) || 0
  });

  if (applyRes && (applyRes.ok || !applyRes.error)) {
    return res.json({
      success: true,
      message: "Đã áp dụng mẫu skin sở hữu lên khủng long đang chơi in-game thành công!"
    });
  }

  res.status(400).json({
    error: applyRes?.error || "Không thể áp dụng preset skin lúc này! Đảm bảo nhân vật đang online trong game."
  });
});
};
