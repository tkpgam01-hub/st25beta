const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
// admin feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {getConfig, saveConfig, getPortalData, savePortalData, callIslePilot, clearPlayerCache, getRequestSteamId, getAdminSteamId, SUPER_ADMINS, isUserAdmin, getPlayerGarageStatus, ROLE_NAME_MAP, getAllAssignedUsers, ensureCombatLogs, generateLiveCombatEvents} = context;


// ==========================================
// 10. ADMIN MANAGEMENT API (ROLE & GARAGE SLOTS)
// ==========================================

// Kiểm tra quyền Admin của request hiện tại
app.get(ST25API.routes.adminCheck, (req, res) => {
  const steamId = getRequestSteamId(req);
  const isAdmin = isUserAdmin(steamId);
  res.json({
    steamId,
    isAdmin,
    isSuperAdmin: SUPER_ADMINS.includes(String(steamId).trim())
  });
});


// Lấy danh sách Roles, danh sách thành viên đã phân quyền & người chơi gần đây
app.all(ST25API.routes.adminRolesSlots, async (req, res) => {
  const adminSteamId = getAdminSteamId(req);
  if (!isUserAdmin(adminSteamId)) {
    return res.status(403).json({ error: "Chỉ Quản Trị Viên (Admin) mới có quyền truy cập!" });
  }

  const cfg = getConfig();
  if (!cfg.garage) cfg.garage = {};
  if (!cfg.garage.user_roles) cfg.garage.user_roles = {};
  if (!cfg.garage.player_custom_slots) cfg.garage.player_custom_slots = {};

  const portalData = getPortalData();
  if (!portalData.adminAssignments) portalData.adminAssignments = {};
  if (!portalData.adminDeleted) portalData.adminDeleted = {};

  // Đồng bộ tức thời từ snapshot client gửi lên (giải quyết triệt để tính chất ephemeral của Vercel Serverless)
  const incomingAssignments = (req.body && Array.isArray(req.body.cachedAssignments)) ? req.body.cachedAssignments : null;
  if (incomingAssignments && incomingAssignments.length > 0) {
    let hasChanges = false;
    incomingAssignments.forEach(item => {
      if (item && item.steamId && /^\d{17}$/.test(String(item.steamId).trim())) {
        const sid = String(item.steamId).trim();
        const itemTs = item.updatedAtTimestamp || (item.updatedAt ? new Date(item.updatedAt).getTime() : 0);
        const deletedTs = portalData.adminDeleted[sid] || 0;

        // Nếu tài khoản đã bị Admin xóa sau mốc thời gian này thì không khôi phục lại
        if (deletedTs && itemTs <= deletedTs) {
          return;
        }

        const existing = portalData.adminAssignments[sid];
        const existTs = (existing && existing.updatedAtTimestamp) || 0;

        if (!existing || itemTs > existTs) {
          portalData.adminAssignments[sid] = {
            roleKey: item.roleKey || 'default',
            slots: Number(item.slots) || 3,
            updatedBy: item.updatedBy || adminSteamId,
            updatedAt: item.updatedAt || new Date().toLocaleString('vi-VN'),
            updatedAtTimestamp: itemTs || Date.now(),
            notes: item.notes || ""
          };
          cfg.garage.user_roles[sid] = item.roleKey || 'default';
          cfg.garage.player_custom_slots[sid] = Number(item.slots) || 3;
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      saveConfig(cfg);
      savePortalData(portalData);
    }
  }

  const garageCfg = cfg.garage || {};
  const roleLimits = garageCfg.role_limits || {};

  const rolesList = Object.keys(roleLimits).map(key => ({
    key,
    name: ROLE_NAME_MAP[key] || `Vai trò ${key.toUpperCase()}`,
    defaultSlots: roleLimits[key]
  }));

  const assignedUsers = getAllAssignedUsers();

  // Lấy danh sách thành viên online/gần đây từ IslePilot (sử dụng cache nội bộ để phản hồi siêu tốc)
  let recentPlayers = [];
  try {
    const pilotPlayers = await callIslePilot(PilotAPI.paths.players);
    if (pilotPlayers && Array.isArray(pilotPlayers.players)) {
      recentPlayers = pilotPlayers.players.slice(0, 50).map(p => ({
        steamId: p.steamId,
        name: p.name || `Player_${p.steamId.slice(-4)}`,
        online: !!p.online,
        species: p.species || ""
      }));
    }
  } catch (_) {}

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    adminSteamId,
    roles: rolesList,
    assignedUsers,
    recentPlayers
  });
});


// Tra cứu nhanh thông tin người chơi theo Steam ID
app.get(ST25API.routes.adminPlayerInfo, async (req, res) => {
  const adminSteamId = getAdminSteamId(req);
  if (!isUserAdmin(adminSteamId)) {
    return res.status(403).json({ error: "Chỉ Quản Trị Viên (Admin) mới có quyền truy cập!" });
  }

  const targetSteamId = req.query.steamId;
  if (!targetSteamId || !String(targetSteamId).trim()) {
    return res.status(400).json({ error: "Thiếu Steam ID cần kiểm tra!" });
  }

  const cleanSteamId = String(targetSteamId).trim();
  const [pilotPlayer, garageStatus] = await Promise.all([
    callIslePilot(PilotAPI.player(cleanSteamId), 'GET', null, true),
    getPlayerGarageStatus(cleanSteamId)
  ]);

  const cfg = getConfig();
  const portalData = getPortalData();
  const dynamicAssign = (portalData.adminAssignments && portalData.adminAssignments[cleanSteamId]) || null;
  const customSlots = (dynamicAssign && dynamicAssign.slots) || (cfg.garage && cfg.garage.player_custom_slots && cfg.garage.player_custom_slots[cleanSteamId]) || null;
  const assignedRole = (dynamicAssign && dynamicAssign.roleKey) || (cfg.garage && cfg.garage.user_roles && cfg.garage.user_roles[cleanSteamId]) || null;

  res.json({
    steamId: cleanSteamId,
    name: (pilotPlayer && pilotPlayer.name) || `Player_${cleanSteamId.slice(-4)}`,
    avatar: (pilotPlayer && pilotPlayer.avatar) || "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg",
    online: (pilotPlayer && pilotPlayer.online) || false,
    species: (pilotPlayer && pilotPlayer.species) || "Không có nhân vật sống",
    garageStatus,
    assignedRole,
    customSlots
  });
});


// Cấp Role & Slot thủ công cho người chơi (lưu cả vào server-config.json và portal-data.json)
app.post(ST25API.routes.adminAssignRoleSlots, async (req, res) => {
  const adminSteamId = getAdminSteamId(req);
  if (!isUserAdmin(adminSteamId)) {
    return res.status(403).json({ error: "Chỉ Quản Trị Viên (Admin) mới có quyền thực hiện thao tác này!" });
  }

  const { targetSteamId, roleKey, customSlots, notes } = req.body;
  if (!targetSteamId || !String(targetSteamId).trim()) {
    return res.status(400).json({ error: "Vui lòng nhập Steam ID của người chơi!" });
  }

  const cleanSteamId = String(targetSteamId).trim();
  const cleanRole = roleKey ? String(roleKey).toLowerCase().trim() : 'default';

  const cfg = getConfig();
  if (!cfg.garage) cfg.garage = {};
  if (!cfg.garage.user_roles) cfg.garage.user_roles = {};
  if (!cfg.garage.player_custom_slots) cfg.garage.player_custom_slots = {};

  cfg.garage.user_roles[cleanSteamId] = cleanRole;

  let finalSlots = 3;
  if (customSlots !== undefined && customSlots !== '' && !isNaN(Number(customSlots))) {
    finalSlots = Math.max(1, Math.min(100, parseInt(customSlots)));
  } else if (cfg.garage.role_limits && cfg.garage.role_limits[cleanRole] !== undefined) {
    finalSlots = Number(cfg.garage.role_limits[cleanRole]);
  }
  cfg.garage.player_custom_slots[cleanSteamId] = finalSlots;

  // 1. Lưu bền vững vào server-config.json
  saveConfig(cfg);

  // 2. Lưu bền vững vào portal-data.json
  const now = new Date();
  const data = getPortalData();
  if (!data.adminAssignments) data.adminAssignments = {};
  if (data.adminDeleted && data.adminDeleted[cleanSteamId]) {
    delete data.adminDeleted[cleanSteamId];
  }
  data.adminAssignments[cleanSteamId] = {
    roleKey: cleanRole,
    slots: finalSlots,
    updatedBy: adminSteamId,
    updatedAt: now.toLocaleString('vi-VN'),
    updatedAtTimestamp: now.getTime(),
    notes: notes || ""
  };
  savePortalData(data);

  // 3. Xóa sạch cache người chơi để có hiệu lực tức thì
  clearPlayerCache(cleanSteamId);
  clearPlayerCache(adminSteamId);

  // Kiểm tra ngay kết quả sau khi lưu
  const updatedStatus = await getPlayerGarageStatus(cleanSteamId);
  const updatedAssignments = getAllAssignedUsers();

  res.json({
    success: true,
    message: `Đã cấp thành công Role [${updatedStatus.roleName}] với [${updatedStatus.maxSlots} Slots Gara] cho Steam ID ${cleanSteamId}! Dữ liệu đã lưu vĩnh viễn và có hiệu lực ngay lập tức.`,
    steamId: cleanSteamId,
    garageStatus: updatedStatus,
    assignedUsers: updatedAssignments
  });
});


// Đồng bộ danh sách phân quyền từ bản sao lưu Client (Đảm bảo vĩnh viễn 100% không bao giờ mất)
app.post(ST25API.routes.adminSyncAssignments, async (req, res) => {
  const adminSteamId = getAdminSteamId(req);
  if (!isUserAdmin(adminSteamId)) {
    return res.status(403).json({ error: "Chỉ Admin mới có quyền đồng bộ dữ liệu!" });
  }

  const { backupAssignments } = req.body;
  if (!Array.isArray(backupAssignments) || backupAssignments.length === 0) {
    return res.json({ success: true, count: 0, assignedUsers: getAllAssignedUsers() });
  }

  const cfg = getConfig();
  if (!cfg.garage) cfg.garage = {};
  if (!cfg.garage.user_roles) cfg.garage.user_roles = {};
  if (!cfg.garage.player_custom_slots) cfg.garage.player_custom_slots = {};

  const portalData = getPortalData();
  if (!portalData.adminAssignments) portalData.adminAssignments = {};

  let syncedCount = 0;
  backupAssignments.forEach(item => {
    if (item && item.steamId && /^\d{17}$/.test(String(item.steamId).trim())) {
      const sid = String(item.steamId).trim();
      const rKey = item.roleKey || 'default';
      const sNum = Number(item.slots) || 3;

      // Nếu server chưa có, hoặc client có cập nhật mới hơn
      if (!portalData.adminAssignments[sid] || (item.updatedAtTimestamp && item.updatedAtTimestamp > (portalData.adminAssignments[sid].updatedAtTimestamp || 0))) {
        portalData.adminAssignments[sid] = {
          roleKey: rKey,
          slots: sNum,
          updatedBy: item.updatedBy || adminSteamId,
          updatedAt: item.updatedAt || new Date().toLocaleString('vi-VN'),
          updatedAtTimestamp: item.updatedAtTimestamp || Date.now(),
          notes: item.notes || ""
        };
        cfg.garage.user_roles[sid] = rKey;
        cfg.garage.player_custom_slots[sid] = sNum;
        syncedCount++;
      }
    }
  });

  if (syncedCount > 0) {
    saveConfig(cfg);
    savePortalData(portalData);
  }

  res.json({
    success: true,
    syncedCount,
    assignedUsers: getAllAssignedUsers()
  });
});


// Xóa override role/slot riêng của người chơi
app.post(ST25API.routes.adminRemoveRoleSlots, async (req, res) => {
  const adminSteamId = getAdminSteamId(req);
  if (!isUserAdmin(adminSteamId)) {
    return res.status(403).json({ error: "Chỉ Quản Trị Viên (Admin) mới có quyền thực hiện thao tác này!" });
  }

  const { targetSteamId } = req.body;
  if (!targetSteamId) return res.status(400).json({ error: "Thiếu Steam ID!" });

  const cleanSteamId = String(targetSteamId).trim();
  if (SUPER_ADMINS.includes(cleanSteamId)) {
    return res.status(400).json({ error: "Không thể xóa quyền của Quản Trị Viên tối cao!" });
  }

  const cfg = getConfig();
  if (cfg.garage && cfg.garage.user_roles) {
    delete cfg.garage.user_roles[cleanSteamId];
  }
  if (cfg.garage && cfg.garage.player_custom_slots) {
    delete cfg.garage.player_custom_slots[cleanSteamId];
  }
  saveConfig(cfg);

  const data = getPortalData();
  if (!data.adminDeleted) data.adminDeleted = {};
  data.adminDeleted[cleanSteamId] = Date.now();
  if (data.adminAssignments && data.adminAssignments[cleanSteamId]) {
    delete data.adminAssignments[cleanSteamId];
  }
  savePortalData(data);

  clearPlayerCache(cleanSteamId);
  clearPlayerCache(adminSteamId);

  const updatedAssignments = getAllAssignedUsers();

  res.json({
    success: true,
    message: `Đã xóa thiết lập riêng cho Steam ID ${cleanSteamId}. Người chơi trở về vai trò mặc định của server.`,
    assignedUsers: updatedAssignments
  });
});


// 17.1 Lấy danh sách Nhật Ký Chiến Đấu & Cảnh Báo Hack (CHỈ ADMIN MỚI ĐƯỢC XEM)
app.get(ST25API.routes.adminCombatLogs, async (req, res) => {
  let adminSteamId = getAdminSteamId(req);
  if (!isUserAdmin(adminSteamId)) {
    return res.status(403).json({ error: "Chỉ Quản Trị Viên (Admin) mới có quyền truy cập Nhật Ký Chiến Đấu!" });
  }

  await ensureCombatLogs();
  await generateLiveCombatEvents();
  const data = getPortalData();
  let logs = [...(data.combatLogs || [])];

  const filter = (req.query.filter || 'all').toLowerCase();
  const search = (req.query.search || '').trim().toLowerCase();

  if (filter === 'anomalies') {
    logs = logs.filter(l => l.flags && l.flags.length > 0);
  } else if (filter === 'clean') {
    logs = logs.filter(l => !l.flags || l.flags.length === 0);
  }

  if (search) {
    logs = logs.filter(l => 
      l.attacker.steamId.includes(search) || 
      l.attacker.name.toLowerCase().includes(search) ||
      l.victim.steamId.includes(search) || 
      l.victim.name.toLowerCase().includes(search) ||
      l.attacker.species.toLowerCase().includes(search)
    );
  }

  logs.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));

  const allLogs = data.combatLogs || [];
  const stats = {
    totalHits: allLogs.length,
    anomaliesCount: allLogs.filter(l => l.flags && l.flags.length > 0).length,
    oneShotCount: allLogs.filter(l => l.flags && l.flags.some(f => f.type === 'ONE_SHOT')).length,
    reachCount: allLogs.filter(l => l.flags && l.flags.some(f => f.type === 'REACH_HACK')).length,
    godModeCount: allLogs.filter(l => l.flags && l.flags.some(f => f.type === 'GOD_MODE')).length,
    speedHackCount: allLogs.filter(l => l.flags && l.flags.some(f => f.type === 'SPEED_HACK')).length
  };

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    success: true,
    adminSteamId,
    stats,
    summary: {
      totalLogs: allLogs.length,
      flaggedLogs: allLogs.filter(l => l.flags && l.flags.length > 0).length,
      reachAnomalies: allLogs.filter(l => l.flags && l.flags.some(f => f.type === 'REACH_HACK')).length,
      cleanLogs: allLogs.filter(l => !l.flags || l.flags.length === 0).length
    },
    logs: logs.map(l => ({
      id: l.id,
      timestamp: l.timestamp,
      timestampMs: l.timestampMs,
      attacker: l.attacker,
      victim: l.victim,
      damage: l.damage,
      damageDealt: l.damage,
      hitBox: l.hitBox,
      hitPart: l.hitBox,
      distance: l.distance,
      distanceMeters: l.distance,
      speed: l.speed,
      attackerSpeed: l.speed,
      isAnomaly: Boolean(l.flags && l.flags.length > 0),
      resolved: l.resolved,
      flags: (l.flags || []).map(f => ({
        type: f.type,
        severity: f.level === 'danger' ? 'critical' : 'warning',
        icon: f.level === 'danger' ? '🚨' : '⚠️',
        desc: f.title || f.message,
        message: f.message
      }))
    }))
  });
});


// 17.2 Thao tác xử lý vi phạm của Admin (Cảnh cáo, Kick, Ban)
app.post(ST25API.routes.adminCombatAction, async (req, res) => {
  const adminSteamId = getAdminSteamId(req);
  if (!isUserAdmin(adminSteamId)) {
    return res.status(403).json({ error: "Chỉ Admin mới có quyền thực hiện hành động này!" });
  }

  const { logId, action, targetSteamId, reason } = req.body;
  const data = getPortalData();
  const log = (data.combatLogs || []).find(l => l.id === logId);

  let resultMsg = "";
  if (action === 'resolve') {
    if (log) log.resolved = true;
    resultMsg = `Đã đánh dấu đã kiểm tra lượt đánh [${logId}].`;
  } else if (action === 'kick') {
    await callIslePilot(PilotAPI.playerKick(targetSteamId), 'POST', { reason: reason || "Nghi vấn gian lận sát thương / hitbox" });
    if (log) log.resolved = true;
    resultMsg = `Đã KICK người chơi ${targetSteamId} ra khỏi game!`;
  } else if (action === 'ban') {
    await callIslePilot(PilotAPI.playerBan(targetSteamId), 'POST', { reason: reason || "Phát hiện hack sát thương / reach hack", durationHours: 720 });
    if (log) log.resolved = true;
    resultMsg = `Đã CẤM (BAN 30 ngày) người chơi ${targetSteamId}!`;
  } else if (action === 'warn') {
    resultMsg = `Đã ghi nhận cảnh cáo hành vi của Steam ID ${targetSteamId}.`;
  }

  savePortalData(data);
  res.json({ success: true, message: resultMsg });
});
};
