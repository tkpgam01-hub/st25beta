const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
// server feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {getConfig, callIslePilot} = context;


/* ==================== API ROUTES ==================== */

// 1. Server Status
app.get(ST25API.routes.serverStatus, async (req, res) => {
  const cfg = getConfig();
  const pilotServer = await callIslePilot(PilotAPI.paths.server);

  if (pilotServer && !pilotServer.error && !pilotServer._status) {
    return res.json({
      name: pilotServer.name || "ST25 VIETNAM",
      status: "online",
      online: true,
      islepilot_sync: true,
      map: "Gateway v0.21.7",
      players: pilotServer.playersOnline ?? pilotServer.lastPlayerCount ?? 0,
      online_players: pilotServer.playersOnline ?? pilotServer.lastPlayerCount ?? 0,
      max_players: cfg.server.max_players || 100,
      cpu_pct: pilotServer.cpuPct || 0,
      memory_used: pilotServer.memoryUsedMb || 0,
      memory_total: pilotServer.memoryTotalMb || 8192,
      hud_download_url: cfg.server.hud_download_url,
      hud_direct_download_url: cfg.server.hud_direct_download_url
    });
  }

  res.json({
    name: "ST25 VIETNAM",
    status: "offline",
    online: false,
    islepilot_sync: false,
    map: "Gateway v0.21.7",
    online_players: 0,
    max_players: 100,
    hud_download_url: cfg.server.hud_download_url
  });
});


// 2. Online Dinosaurs Population (from IslePilot - Player names & SteamIDs hidden for privacy)
app.get(ST25API.routes.serverPlayers, async (req, res) => {
  const data = await callIslePilot(PilotAPI.paths.playersOnline);
  if (data && data.players) {
    const formatted = data.players.map(p => {
      return {
        species: p.species || "Chưa xác định",
        female: p.female,
        growth: p.growth || 0,
        growthPct: Math.round((p.growth || 0) * 100),
        online: true
      };
    });
    return res.json(formatted);
  }
  res.json([]);
});


// 15.6 Diets & Leaderboard
app.get(ST25API.routes.serverDiets, async (req, res) => {
  const data = await callIslePilot(PilotAPI.paths.diets);
  res.json(data || {});
});


app.get(ST25API.routes.serverLeaderboard, async (req, res) => {
  const species = req.query.species || '';
  const ep = species ? `/leaderboard?species=${encodeURIComponent(species)}` : '/leaderboard';
  const data = await callIslePilot(ep);
  res.json(data || []);
});


// ==========================================
// 16. LIVE ENVIRONMENT & WEATHER API (CHU KỲ NGÀY / ĐÊM & THỜI TIẾT)
// ==========================================
app.get(ST25API.routes.serverEnvironment, async (req, res) => {
  const nowMs = Date.now();
  const cycleMinutes = 60;
  const dayMinutes = 40;

  const currentMinute = Math.floor(nowMs / 60000) % cycleMinutes;
  const currentSecond = Math.floor(nowMs / 1000) % 60;

  const isDay = currentMinute < dayMinutes;
  const remainingMinutes = isDay ? (dayMinutes - currentMinute) : (cycleMinutes - currentMinute);

  let phase = "Ban Ngày";
  let weather = "clear";
  let weatherName = "Trời quang nắng ấm";
  let weatherIcon = "☀️";
  let temp = 29;

  if (isDay) {
    if (currentMinute < 8) {
      phase = "Bình minh ấm áp";
      weatherIcon = "🌅";
      temp = 24;
    } else if (currentMinute < 32) {
      phase = "Ban ngày nắng gắt";
      weatherIcon = "☀️";
      temp = 32;
    } else {
      phase = "Hoàng hôn buông xuống";
      weatherIcon = "🌇";
      temp = 26;
    }
  } else {
    if (currentMinute < 48) {
      phase = "Chập tối trăng sáng";
      weatherIcon = "🌙";
      temp = 22;
    } else {
      phase = "Nửa đêm u tối";
      weatherIcon = "🌑";
      temp = 19;
    }
  }

  // Luân chuyển thời tiết (mỗi 15 phút đổi 1 kiểu thời tiết)
  const weatherSeed = Math.floor(nowMs / (15 * 60 * 1000)) % 4;
  if (weatherSeed === 1) {
    weather = "rain";
    weatherName = "Mưa rào rừng nhiệt đới";
    weatherIcon = isDay ? "🌦️" : "🌧️";
    temp -= 3;
  } else if (weatherSeed === 2) {
    weather = "fog";
    weatherName = "Sương mù dày đặc";
    weatherIcon = "🌫️";
    temp -= 2;
  } else if (weatherSeed === 3) {
    weather = "storm";
    weatherName = "Giông bão sấm sét & lũ triều";
    weatherIcon = "⛈️";
    temp -= 5;
  }

  const inGameHour = Math.floor((currentMinute / cycleMinutes) * 24);
  const inGameMin = Math.floor((currentSecond / 60) * 60);
  const timeString = `${String(inGameHour).padStart(2, '0')}:${String(inGameMin).padStart(2, '0')}`;

  const displayBadge = isDay 
    ? `${weatherIcon} Ban Ngày (còn ${remainingMinutes}p) • ${weatherName} ${temp}°C`
    : `${weatherIcon} Ban Đêm (còn ${remainingMinutes}p) • ${weatherName} ${temp}°C`;

  res.json({
    isDay,
    timeOfDay: timeString,
    phase,
    remainingMinutes,
    weather,
    weatherName,
    weatherIcon,
    temperature: temp,
    displayBadge,
    forecast: isDay 
      ? `Sau ${remainingMinutes} phút nữa trời sẽ chuyển sang Ban Đêm. Hãy tìm nơi ẩn nấp an toàn!`
      : `Sau ${remainingMinutes} phút nữa trời sẽ Rạng Sáng. Tầm nhìn săn mồi sẽ rõ hơn!`
  });
});
};
