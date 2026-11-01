const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
// leaderboard feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {getConfig, getPortalData, callIslePilot, SUPER_ADMINS, getRealServerPlayers} = context;


// ==========================================
// 18. LEADERBOARDS & HALL OF FAME API (BẢNG XẾP HẠNG ĐỈNH CAO)
// ==========================================
app.get(ST25API.routes.leaderboard, async (req, res) => {
  // Lọc hoàn toàn Admin ra khỏi tất cả bảng xếp hạng để đảm bảo tính công bằng
  const isExcludedAdmin = (steamId) => SUPER_ADMINS.includes(String(steamId).trim());

  let realPlayers = [];
  try {
    realPlayers = await getRealServerPlayers();
  } catch (err) {
    console.warn("Lỗi lấy danh sách người chơi leaderboard:", err.message);
  }

  // 1. VUA SINH TỒN (Survivors - Top thời gian sống sót / totalPlaySec)
  const survivors = realPlayers
    .filter(p => !isExcludedAdmin(p.steamId) && (p.totalPlaySec > 0 || p.hours > 0))
    .sort((a, b) => (b.totalPlaySec || 0) - (a.totalPlaySec || 0))
    .slice(0, 15)
    .map((p, index) => {
      const hours = Number(((p.totalPlaySec || 0) / 3600).toFixed(1));
      let badge = `Top ${index + 1}`;
      if (index === 0) badge = "🥇 VUA SINH TỒN";
      else if (index === 1) badge = "🥈 CHIẾN THẦN BỀN BỈ";
      else if (index === 2) badge = "🥉 ĐẠI THỌ EVRIMA";
      return {
        rank: index + 1,
        name: p.name,
        steamId: p.steamId,
        species: p.species || "Khủng long ST25",
        hours: hours,
        survivalHours: hours,
        growth: typeof p.growth === 'number' ? (p.growth > 1 ? `${p.growth}%` : `${Math.round(p.growth * 100)}%`) : (p.growth || "100%"),
        status: p.online ? "Đang Online" : "Ngoại tuyến",
        badge,
        avatar: p.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.steamId}`
      };
    });

  // 2. THỢ SĂN ĐỈNH CAO (Hunters - Top Kills từ IslePilot leaderboard)
  let huntersData = [];
  try {
    const lb = await callIslePilot(PilotAPI.paths.leaderboard);
    if (lb && Array.isArray(lb.entries)) {
      huntersData = lb.entries.filter(e => !isExcludedAdmin(e.steamId));
    }
  } catch (e) {}

  const speciesMap = new Map(realPlayers.map(p => [p.steamId, p.species]));

  const hunters = huntersData
    .sort((a, b) => (b.kills || 0) - (a.kills || 0))
    .slice(0, 15)
    .map((h, index) => {
      const kills = h.kills || 0;
      const deaths = h.deaths || 0;
      const kdRatio = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
      let badge = `Top ${index + 1}`;
      if (index === 0) badge = "🥇 VUA THỢ SĂN";
      else if (index === 1) badge = "🥈 SÁT THỦ ĐỈNH CAO";
      else if (index === 2) badge = "🥉 THẦN CHẾT RỪNG RẬM";

      return {
        rank: index + 1,
        name: h.name,
        steamId: h.steamId,
        species: speciesMap.get(h.steamId) || "Sát Thủ Đỉnh Cao",
        kills,
        deaths,
        kd: kdRatio,
        kdRatio,
        bestPrey: `${kills} Mạng hạ gục`,
        badge,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${h.steamId}`
      };
    });

  // 3. ĐẠI GIA ST25 (Wealth - Top Lúa người chơi trong máy chủ)
  const portalData = getPortalData();
  const userWallets = portalData.userWallets || {};
  const cfg = getConfig();
  const userRoles = (cfg.garage && cfg.garage.user_roles) || {};
  const roleNames = {
    "default": "Thành viên ST25",
    "admin": "Quản Trị Viên",
    "mod": "Điều Hành Viên",
    "long_chu": "🐲 LONG CHỦ",
    "dai_dia_chu": "🏰 LONG ĐẠI ĐỊA CHỦ",
    "phu_nong": "🌾 LONG PHÚ NÔNG",
    "ta_dien": "🌾 LONG TÁ ĐIỀN"
  };

  const wealthList = realPlayers
    .filter(p => !isExcludedAdmin(p.steamId))
    .map(p => {
      const sId = p.steamId;
      let balance = userWallets[sId];
      if (balance === undefined || balance === null) {
        const earned = Math.round(((p.kills || 0) * 150) + ((p.totalPlaySec || 0) / 36));
        balance = Math.max(50, earned);
      }
      const roleKey = userRoles[sId] || "default";
      const role = roleNames[roleKey] || (p.kills > 20 ? "🐲 LONG CHỦ" : "🦖 Thành Viên ST25");
      return {
        steamId: sId,
        name: p.name,
        balance,
        luaBalance: balance,
        role,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${sId}`
      };
    })
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 15)
    .map((w, index) => {
      let badge = `Top ${index + 1}`;
      if (index === 0) badge = "🥇 ĐẠI PHÚ HÀO";
      else if (index === 1) badge = "🥈 ĐẠI PHÚ NÔNG";
      else if (index === 2) badge = "🥉 LONG CHỦ";
      return {
        rank: index + 1,
        ...w,
        badge
      };
    });

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    survivors,
    hunters,
    wealth: wealthList,
    updatedAt: new Date().toLocaleString('vi-VN')
  });
});
};
