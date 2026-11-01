const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
// team feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {callIslePilot, posToLatLng, getRequestSteamId} = context;


// 8. Team / Pack Members (Real Data from IslePilot)
app.get(ST25API.routes.playerTeam, async (req, res) => {
  const reqSteamId = getRequestSteamId(req);
  if (!reqSteamId) return res.status(401).json({ error: 'Chưa đăng nhập Steam.' });
  const onlineData = await callIslePilot(PilotAPI.paths.playersOnline);
  const allOnline = (onlineData && onlineData.players) || [];

  const thisPlayer = allOnline.find(p => p.steamId === reqSteamId);
  const playerSpecies = (thisPlayer && thisPlayer.species) || "Tyrannosaurus";

  const packLimits = {
    "Tyrannosaurus": 2, "Deinosuchus": 2, "Allosaurus": 3, "Carnotaurus": 4,
    "Dilophosaurus": 4, "Ceratosaurus": 5, "Austroraptor": 6, "Omniraptor": 8,
    "Herrerasaurus": 8, "Troodon": 10, "Pteranodon": 10, "Triceratops": 3,
    "Stegosaurus": 3, "Tenontosaurus": 4, "Diabloceratops": 5, "Kentrosaurus": 5,
    "Maiasaura": 5, "Pachycephalosaurus": 6, "Dryosaurus": 8, "Hypsilophodon": 10,
    "Gallimimus": 10, "Beipiaosaurus": 10
  };

  const limit = packLimits[playerSpecies] || 4;
  const sameSpecies = allOnline.filter(p => p.species === playerSpecies);

  const members = sameSpecies.map((p, idx) => {
    const loc = posToLatLng(p.position);
    return {
      steam_id: p.steamId,
      name: p.steamId === reqSteamId ? `${p.name} (Bạn)` : p.name,
      avatar: "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg",
      species: p.species,
      growth: Math.round((p.growth || 0) * 100),
      health: Math.round(((p.health || 0) / (p.maxHealth || 1)) * 100) || 100,
      status: p.health > 0 ? "Khoẻ mạnh" : "Đang nghỉ",
      role: idx === 0 ? "Chủ đàn (Pack Leader)" : "Thành viên",
      coordinates: `Ô ${loc.grid} (X: ${Math.round(p.position.x / 100)})`,
      last_seen: "Vừa xong",
      online: p.online
    };
  });

  res.json({
    species: playerSpecies,
    pack_limit: limit,
    current_count: members.length,
    is_full: members.length >= limit,
    members: members
  });
});
};
