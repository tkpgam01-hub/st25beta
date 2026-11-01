const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
// garage feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {getConfig, getPortalData, savePortalData, callIslePilot, clearPlayerCache, acquirePlayerLock, releasePlayerLock, getRequestSteamId, getAdminSteamId, normalizeStatPct, SUPER_ADMINS, isUserAdmin, getPlayerGarageStatus, formatGarageError, modifyLivePlayerBalance} = context;


// 9.1 Lấy toàn bộ thông tin Gara của người chơi (Bảo mật theo tài khoản đăng nhập)
app.get(ST25API.routes.playerGarage, async (req, res) => {
  const cfg = getConfig();
  const callerSteamId = getRequestSteamId(req);
  const adminId = getAdminSteamId(req);
  const callerIsAdmin = isUserAdmin(adminId);

  // Cho phép Quản trị viên (Admin) xem Gara của người khác qua ?steamId=...
  // Người chơi bình thường xem Gara của chính mình
  let effectiveSteamId = null;
  if (req.query.steamId && /^\d{17}$/.test(String(req.query.steamId).trim())) {
    const qSid = String(req.query.steamId).trim();
    if (callerIsAdmin || callerSteamId === qSid) {
      effectiveSteamId = qSid;
    } else {
      effectiveSteamId = callerSteamId;
    }
  } else {
    effectiveSteamId = callerSteamId;
  }

  if (!effectiveSteamId) {
    const defSlots = (cfg.garage && cfg.garage.default_slots) || 3;
    return res.json({
      active: null,
      slots: [],
      tradeableDinos: [],
      steamId: null,
      personaName: "Chưa đăng nhập Steam",
      totalParked: 0,
      maxSlots: defSlots,
      roleKey: "default",
      roleName: "Chưa đăng nhập",
      isFull: false,
      unlinked: true,
      isLoggedIn: false,
      isAdmin: false,
      isSuperAdmin: false
    });
  }

  const garageStatus = await getPlayerGarageStatus(effectiveSteamId);
  const pilotPlayer = await callIslePilot(PilotAPI.player(effectiveSteamId), 'GET', null, true);

  let active = null;
  if (pilotPlayer && pilotPlayer.species) {
    active = {
      species: pilotPlayer.species,
      gender: pilotPlayer.female ? "Cái (Female)" : "Đực (Male)",
      growth: Math.round((pilotPlayer.growth || 0) * 100),
      rawGrowth: pilotPlayer.growth || 0,
      health: normalizeStatPct(pilotPlayer.health, pilotPlayer.maxHealth),
      hunger: normalizeStatPct(pilotPlayer.hunger, pilotPlayer.maxHunger),
      thirst: normalizeStatPct(pilotPlayer.thirst, pilotPlayer.maxThirst),
      stamina: 100,
      diet: ["S", "S", "D"],
      isPrimeElder: pilotPlayer.isPrimeElder || false,
      mutations: pilotPlayer.mutations || []
    };
  }

  let slots = [];
  garageStatus.dinos.forEach((g, idx) => {
    const rawG = g.growth !== undefined ? Number(g.growth) : 1;
    const displayGrowth = rawG > 1 ? Math.min(100, Math.round(rawG)) : Math.round(rawG * 100);
    const rawH = g.health !== undefined ? Number(g.health) : 100;
    const displayHealth = rawH > 1 ? Math.min(100, Math.round(rawH)) : Math.round(rawH * 100);
    const rawHunger = g.hunger !== undefined ? Number(g.hunger) : 100;
    const displayHunger = rawHunger > 1 ? Math.min(100, Math.round(rawHunger)) : Math.round(rawHunger * 100);
    const rawThirst = g.thirst !== undefined ? Number(g.thirst) : 100;
    const displayThirst = rawThirst > 1 ? Math.min(100, Math.round(rawThirst)) : Math.round(rawThirst * 100);
    const rawStam = g.stamina !== undefined ? Number(g.stamina) : 100;
    const displayStamina = rawStam > 1 ? Math.min(100, Math.round(rawStam)) : Math.round(rawStam * 100);

    slots.push({
      slot: idx + 1,
      id: g.id,
      name: g.name || "",
      species: g.species,
      gender: (g.gender === 'Female' || g.gender === 'Cái (Female)') ? "Cái (Female)" : "Đực (Male)",
      growth: displayGrowth,
      rawGrowth: rawG > 1 ? rawG / 100 : rawG,
      health: displayHealth,
      hunger: displayHunger,
      thirst: displayThirst,
      stamina: displayStamina,
      isPrimeElder: g.isPrimeElder || false,
      diet: g.diet || ["S", "S", "D"],
      mutations: g.mutations || [],
      stored_at: g.stored_at || (g.parkedAt ? new Date(g.parkedAt).toLocaleString('vi-VN') : "Cloud Gara"),
      source: g.source || (g.isLocal ? "Hòm May Mắn" : "IslePilot Cloud")
    });
  });

  const filledCount = slots.length;
  for (let i = filledCount + 1; i <= garageStatus.maxSlots; i++) {
    slots.push({ slot: i, empty: true });
  }

  const tradeableDinos = slots.filter(s => !s.empty);

  res.json({
    active,
    slots,
    tradeableDinos,
    steamId: effectiveSteamId,
    personaName: (pilotPlayer && pilotPlayer.name) || `Player_${effectiveSteamId.slice(-4)}`,
    totalParked: garageStatus.totalParked,
    maxSlots: garageStatus.maxSlots,
    roleKey: garageStatus.roleKey,
    roleName: garageStatus.roleName,
    roleLimit: garageStatus.roleLimit,
    isFull: garageStatus.isFull,
    isLoggedIn: true,
    isAdmin: callerIsAdmin,
    isSuperAdmin: SUPER_ADMINS.includes(String(callerSteamId).trim()),
    isViewingOther: effectiveSteamId !== callerSteamId,
    upgradeDiscordUrl: (cfg.garage && cfg.garage.upgrade_discord_url) || "https://discord.gg/3xCrA6VyY"
  });
});


// 9.2 Cất Khủng Long Đang Chơi Vào Gara (POST /players/{steamId}/garage/park)
app.post(ST25API.routes.playerGaragePark, async (req, res) => {
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.status(401).json({ error: "Vui lòng đăng nhập Steam!" });

  const garageStatus = await getPlayerGarageStatus(steamId);
  if (garageStatus.isFull) {
    return res.status(400).json({
      error: `Gara của bạn đã đầy (${garageStatus.totalParked}/${garageStatus.maxSlots} ô theo vai trò)! Vui lòng lấy khủng long cũ ra chơi hoặc bán bớt.`
    });
  }

  const result = await callIslePilot(PilotAPI.playerGaragePark(steamId), 'POST', {});
  clearPlayerCache(steamId);

  if (result && !result.error) {
    return res.json({
      success: true,
      message: "Đã cất khủng long vào Gara IslePilot thành công!",
      data: result,
      cooldown_seconds: 30
    });
  }

  const userFriendlyMsg = formatGarageError(result?.error, 'park');
  const isCombat = userFriendlyMsg.includes('giao tranh') || userFriendlyMsg.includes('sát thương');
  res.status(result?._status || 400).json({
    error: userFriendlyMsg,
    code: isCombat ? 'COMBAT_DAMAGE' : 'PARK_FAILED',
    rawError: result?.error
  });
});


// 9.2.0 Chuẩn bị Cất Vào Gara (Người chơi bắt buộc đứng yên in-game trong 30 giây)
app.post(ST25API.routes.playerGarageParkPrepare, async (req, res) => {
  const { species } = req.body;
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.status(401).json({ error: "Vui lòng đăng nhập Steam!" });

  let playerName = `Player_${steamId.slice(-4)}`;
  try {
    const p = await callIslePilot(PilotAPI.player(steamId));
    if (p && p.name) playerName = p.name;
  } catch (_) {}

  try {
    await callIslePilot(PilotAPI.paths.commands, 'POST', {
      action: 'announce',
      message: `📦 [GARA PARK]: [${playerName}] đang niêm phong cất [${species || 'Khủng Long'}] vào Gara. Người chơi bắt buộc đứng yên trong 30 giây!`
    });
  } catch (_) {}

  res.json({
    success: true,
    countdownSeconds: 30,
    message: "Bắt đầu đếm ngược 30 giây niêm phong cất Gara."
  });
});


// 9.2.1 Chuẩn bị Đưa Ra Đảo & Phát Cảnh Báo 500m (Thời gian chuẩn bị 30 giây)
app.post(ST25API.routes.playerGarageRestorePrepare, async (req, res) => {
  const { garageDinoId, species, growth } = req.body;
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.status(401).json({ error: "Vui lòng đăng nhập Steam!" });

  const dinoSpecies = species || "Khủng Long";
  const dinoGrowth = growth !== undefined ? `${growth}%` : "100%";

  let playerName = `Player_${steamId.slice(-4)}`;
  try {
    const p = await callIslePilot(PilotAPI.player(steamId));
    if (p && p.name) playerName = p.name;
  } catch (_) {}

  // Phát thông báo cảnh báo toàn khu vực 500m qua IslePilot in-game announcement
  try {
    await callIslePilot(PilotAPI.paths.commands, 'POST', {
      action: 'announce',
      message: `⚠️ [CẢNH BÁO 500M]: Người chơi [${playerName}] đang triệu hồi [${dinoSpecies} - ${dinoGrowth}] từ Gara ra đảo! Sẽ xuất hiện sau 30 giây!`
    });
  } catch (_) {}

  res.json({
    success: true,
    countdownSeconds: 30,
    warningRadiusMeters: 500,
    species: dinoSpecies,
    growth: dinoGrowth,
    playerName,
    message: `Đã phát tín hiệu cảnh báo trong bán kính 500 mét! Quá trình triệu hồi [${dinoSpecies} ${dinoGrowth}] tốn 30 giây.`
  });
});


// 9.3 Lấy Khủng Long Từ Gara Ra Chơi (POST /players/{steamId}/garage/{garageDinoId}/restore)
app.post(ST25API.routes.playerGarageRestore, async (req, res) => {
  const { garageDinoId, mutations } = req.body;
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.status(401).json({ error: "Vui lòng đăng nhập Steam!" });
  if (!garageDinoId) return res.status(400).json({ error: "Thiếu mã khủng long trong Gara!" });

  // Nếu là khủng long trúng từ Hòm Quà (id bắt đầu bằng dino-)
  if (garageDinoId.startsWith('dino-')) {
    const data = getPortalData();
    const dIdx = (data.userGarage && data.userGarage[steamId]) ? data.userGarage[steamId].findIndex(d => d.id === garageDinoId) : -1;
    if (dIdx !== -1) {
      const dino = data.userGarage[steamId][dIdx];
      await callIslePilot(PilotAPI.paths.commands, 'POST', {
        action: 'swap',
        steamId: steamId,
        species: dino.species,
        growth: (dino.growth || 100) / 100
      });
      data.userGarage[steamId].splice(dIdx, 1);
      savePortalData(data);
      clearPlayerCache(steamId);
      return res.json({
        success: true,
        message: `Đã đưa [${dino.species} ${dino.growth}%] ra đảo thành công! Nhân vật in-game đã được kích hoạt.`,
        cooldown_seconds: 30
      });
    }
  }

  const result = await callIslePilot(PilotAPI.playerGarageItemRestore(steamId, garageDinoId), 'POST', {
    mutations: Array.isArray(mutations) ? mutations : []
  });
  clearPlayerCache(steamId);

  if (result && !result.error) {
    return res.json({
      success: true,
      message: "Đã hồi phục khủng long ra đảo thành công! Vui lòng vào game kiểm tra.",
      data: result,
      cooldown_seconds: 30
    });
  }

  const userFriendlyMsg = formatGarageError(result?.error, 'restore');
  const isNearby = userFriendlyMsg.includes('100') || userFriendlyMsg.includes('xung quanh');
  res.status(result?._status || 400).json({
    error: userFriendlyMsg,
    code: isNearby ? 'NEARBY_PLAYERS_100M' : 'RESTORE_FAILED',
    rawError: result?.error
  });
});


// 9.4 Bán Khủng Long Theo Quy Định Nhà Phát Hành (POST /players/{steamId}/garage/{garageDinoId}/sell)
app.post(ST25API.routes.playerGarageSell, async (req, res) => {
  const { garageDinoId } = req.body;
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.status(401).json({ error: "Vui lòng đăng nhập Steam!" });
  if (!garageDinoId) return res.status(400).json({ error: "Thiếu mã khủng long cần bán!" });

  if (!acquirePlayerLock(steamId, 'garage')) {
    return res.status(429).json({ error: "Giao dịch đang được xử lý, vui lòng không bấm bán liên tục!" });
  }

  try {
    // Nếu là khủng long trúng từ Hòm Quà (id bắt đầu bằng dino-)
    if (garageDinoId.startsWith('dino-')) {
      const data = getPortalData();
      const dIdx = (data.userGarage && data.userGarage[steamId]) ? data.userGarage[steamId].findIndex(d => d.id === garageDinoId) : -1;
      if (dIdx !== -1) {
        const dino = data.userGarage[steamId][dIdx];
        // Tính giá bán cơ bản theo growth: ví dụ 20-50 Lúa
        const sellPrice = Math.max(10, Math.round(((dino.growth || 100) / 100) * 35));
        
        // Xóa khỏi Gara trước để chống duplicate
        data.userGarage[steamId].splice(dIdx, 1);
        savePortalData(data);

        try {
          await modifyLivePlayerBalance(steamId, sellPrice, `Bán khủng long [${dino.species} ${dino.growth}%] từ Gara`);
        } catch (err) {
          // Revert nếu lỗi
          data.userGarage[steamId].splice(dIdx, 0, dino);
          savePortalData(data);
          throw err;
        }

        clearPlayerCache(steamId);
        return res.json({
          success: true,
          message: `Đã bán [${dino.species} ${dino.growth}%] thành công! Nhận được +${sellPrice} Lúa 🌾 vào ví!`,
          earned: sellPrice
        });
      }
    }

    const result = await callIslePilot(PilotAPI.playerGarageItemSell(steamId, garageDinoId), 'POST', {});
    clearPlayerCache(steamId);

    if (result && !result.error) {
      return res.json({
        success: true,
        message: "Đã bán khủng long thành công! Tiền Lúa 🌾 đã được cộng vào ví của bạn.",
        data: result
      });
    }

    res.status(result?._status || 400).json({
      error: result?.error || "Không thể bán khủng long này (vui lòng kiểm tra điều kiện Prime và Growth trong Quy Định Bán)!"
    });
  } catch (err) {
    console.error('Lỗi bán khủng long:', err);
    res.status(500).json({ error: "Lỗi hệ thống khi bán khủng long! Vui lòng thử lại sau." });
  } finally {
    releasePlayerLock(steamId, 'garage');
  }
});
};
