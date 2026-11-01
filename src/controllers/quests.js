const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
// quests feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {getPortalData, savePortalData, callIslePilot, clearPlayerCache, acquirePlayerLock, releasePlayerLock, getRequestSteamId, getQuestPeriodKey, isQuestCompleted, isQuestClaimedInPeriod, getLivePlayerBalance, modifyLivePlayerBalance} = context;


// 6. Quests (Nhiệm Vụ Cá Nhân) Endpoint
app.get(ST25API.routes.playerQuests, async (req, res) => {
  const steamId = getRequestSteamId(req);
  if (!steamId) {
    return res.json({
      steamId: null,
      isLoggedIn: false,
      player: null,
      coins: 0,
      balance: 0,
      serverQuests: [],
      primeQuests: [],
      primeSummary: null,
      claimableCount: 0,
      totalClaimableLua: 0
    });
  }

  // 1. Fetch IslePilot quests & player details & live balance
  const [questsData, playerDetails, liveBalance] = await Promise.all([
    callIslePilot(PilotAPI.playerQuests(steamId)),
    callIslePilot(PilotAPI.player(steamId)),
    getLivePlayerBalance(steamId)
  ]);

  const portalData = getPortalData();
  const userClaimedQuests = (portalData.claimedQuests && portalData.claimedQuests[steamId]) || {};

  let serverQuests = [];
  if (questsData && Array.isArray(questsData.quests)) {
    serverQuests = questsData.quests.map(q => {
      let rewardAmount = 0;
      if (Array.isArray(q.rewards)) {
        q.rewards.forEach(r => {
          if (r.kind === 'coins' || r.kind === 'coin' || r.kind === 'lua') {
            rewardAmount += Number(r.amount) || 0;
          }
        });
      }
      if (rewardAmount <= 0) {
        rewardAmount = q.period === 'monthly' ? 50 : (q.period === 'weekly' ? 24 : 8);
      }

      const periodKey = getQuestPeriodKey(q);
      const claimKey = `${q.id}_${periodKey}`;
      const isCompleted = isQuestCompleted(q);
      const isClaimed = isQuestClaimedInPeriod(q, userClaimedQuests);
      const canClaim = isCompleted && !isClaimed;

      return {
        id: q.id,
        periodKey,
        claimKey,
        name: q.name,
        description: q.description,
        rarity: q.rarity || 'common',
        locked: q.locked === true,
        objectiveLabel: q.objectiveLabel || null,
        period: q.period, // daily, weekly, monthly
        progress: q.progress || 0,
        rewards: (q.rewards || []).map(r => ({
          kind: (r.kind === 'coins' || r.kind === 'coin') ? 'Lúa 🌾' : r.kind,
          amount: r.amount
        })),
        rewardAmount,
        config: q.config || {},
        completed: isCompleted,
        claimed: isClaimed,
        canClaim
      };
    });
  }

  // 2. Extract Prime Quests with humorous & clear Vietnamese descriptions
  const primeNamesVi = {
    1: { name: "🍼 Ghé thăm Nhà Trẻ Mầm Non (Sanctuary)", desc: "Đến Sanctuary khi còn là khủng long con (Juvenile)" },
    2: { name: "🪺 Ấp nở từ tổ ấm gia đình (Nested In)", desc: "Được sinh ra từ tổ trứng của bố mẹ trong game" },
    3: { name: "🥗 Bữa ăn 3 sao Michelin hoàn hảo", desc: "Nạp đủ 100% cả 3 nhóm chất dinh dưỡng (S, S, D)" },
    4: { name: "🦣 Phượt qua Vùng Đại Di Cư (Mass Migration)", desc: "Di chuyển qua khu vực Đại Di Cư MMZ" },
    5: { name: "🗺️ Check-in 2 Vùng Di Cư trên đảo", desc: "Khám phá qua ít nhất 2 vùng di cư Migration" },
    6: { name: "⚔️ Tuần tra 4 Điểm Nóng đẫm máu", desc: "Đặt chân qua ít nhất 4 vùng tuần tra Patrol" },
    7: { name: "🧬 Bảo tồn nòi giống (Không bị vô sinh)", desc: "Sinh tồn lành mạnh, chưa từng bị Infertile" },
    8: { name: "🥩 Nói KHÔNG với thịt đồng loại", desc: "Không bao giờ cắn thịt cùng loài (Né chứng giật cơ)" },
    9: { name: "🐣 Nuôi con lớn bổng thành Subadult", desc: "Nuôi dạy thành công thế hệ đàn em khôn lớn" },
    10: { name: "🦖 Dòng dõi thần thú chỉ định", desc: "Là Hypsilophodon, Troodon, Beipiaosaurus, Dryosaurus hoặc Deinosuchus" }
  };

  let primeQuests = [];
  if (playerDetails && playerDetails.prime && Array.isArray(playerDetails.prime.quests)) {
    primeQuests = playerDetails.prime.quests.map(pq => ({
      index: pq.index,
      name: (primeNamesVi[pq.index] && primeNamesVi[pq.index].name) || pq.name,
      originalName: pq.name,
      desc: (primeNamesVi[pq.index] && primeNamesVi[pq.index].desc) || "",
      done: pq.done
    }));
  }

  const reqUserSteamId = getRequestSteamId(req);
  const isCurrentLoggedIn = !!(reqUserSteamId && reqUserSteamId === steamId);
  const claimableQuests = serverQuests.filter(q => q.canClaim);
  const totalClaimableLua = claimableQuests.reduce((acc, q) => acc + q.rewardAmount, 0);

  res.json({
    steamId,
    isLoggedIn: isCurrentLoggedIn || !!getRequestSteamId(req),
    player: playerDetails ? {
      name: playerDetails.name || "Thành viên ST25",
      avatar: playerDetails.avatar || "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg",
      species: playerDetails.species || "Chưa chọn loài",
      gender: playerDetails.female ? "Cái (Female)" : "Đực (Male)",
      growth: Math.round((playerDetails.growth || 0) * 100),
      health: Math.round(((playerDetails.health || 0) / (playerDetails.maxHealth || 1)) * 100) || 100,
      hunger: Math.round(((playerDetails.hunger || 0) / (playerDetails.maxHunger || 1)) * 100) || 100,
      thirst: Math.round(((playerDetails.thirst || 0) / (playerDetails.maxThirst || 1)) * 100) || 100,
      playtimeHours: Math.round((playerDetails.totalPlaySec || 0) / 3600),
      online: playerDetails.online !== false
    } : null,
    coins: liveBalance,
    balance: liveBalance,
    serverQuests,
    events: Array.isArray(questsData?.events) ? questsData.events.map(event => ({
      name: event.name || event.title,
      description: event.description,
      multiplier: event.multiplier,
      endsAt: event.endsAt
    })) : [],
    primeQuests,
    primeSummary: playerDetails ? playerDetails.prime : null,
    claimableCount: claimableQuests.length,
    totalClaimableLua
  });
});


// 6.1 Nhận Lúa Thưởng Nhiệm Vụ (Claim Quest Reward)
app.post(ST25API.routes.playerQuestsClaim, async (req, res) => {
  const steamId = getRequestSteamId(req);
  if (!steamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam trước khi nhận Lúa thưởng!" });
  }

  const { questId } = req.body;
  if (!questId) {
    return res.status(400).json({ error: "Thiếu thông tin nhiệm vụ cần nhận thưởng!" });
  }

  // Khóa chống Race Condition / Spam Click Duplicate Lúa
  if (!acquirePlayerLock(steamId, 'quest')) {
    return res.status(429).json({ error: "Giao dịch đang được xử lý, vui lòng không bấm nhận liên tục!" });
  }

  try {
    const questsData = await callIslePilot(PilotAPI.playerQuests(steamId), 'GET', null, true);
    if (!questsData || !Array.isArray(questsData.quests)) {
      return res.status(400).json({ error: "Không tìm thấy dữ liệu nhiệm vụ từ máy chủ ST25!" });
    }

    const quest = questsData.quests.find(q => q.id === questId);
    if (!quest) {
      return res.status(404).json({ error: "Nhiệm vụ không tồn tại hoặc đã hết hạn kỳ này!" });
    }

    const isDone = isQuestCompleted(quest);
    if (!isDone) {
      return res.status(400).json({ error: `Nhiệm vụ [${quest.name}] chưa hoàn thành! Hãy tiếp tục sinh tồn để đạt điều kiện.` });
    }

    const data = getPortalData();
    if (!data.claimedQuests) data.claimedQuests = {};
    if (!data.claimedQuests[steamId]) data.claimedQuests[steamId] = {};

    const alreadyClaimed = isQuestClaimedInPeriod(quest, data.claimedQuests[steamId]);
    if (alreadyClaimed) {
      return res.status(400).json({ error: `Bạn đã nhận thưởng Lúa cho nhiệm vụ [${quest.name}] trong chu kỳ hôm nay rồi!` });
    }

    let rewardAmount = 0;
    if (Array.isArray(quest.rewards)) {
      quest.rewards.forEach(r => {
        if (r.kind === 'coins' || r.kind === 'coin' || r.kind === 'lua') {
          rewardAmount += Number(r.amount) || 0;
        }
      });
    }
    if (rewardAmount <= 0) {
      rewardAmount = quest.period === 'monthly' ? 50 : (quest.period === 'weekly' ? 24 : 8);
    }

    const periodKey = getQuestPeriodKey(quest);
    const claimKey = `${quest.id}_${periodKey}`;

    // ĐÁNH DẤU ĐÃ NHẬN VÀ LƯU TRƯỚC (CHỐNG CONCURRENCY SPAM)
    data.claimedQuests[steamId][claimKey] = {
      claimedAt: new Date().toISOString(),
      periodKey,
      amount: rewardAmount,
      questName: quest.name
    };
    data.claimedQuests[steamId][questId] = {
      claimedAt: new Date().toISOString(),
      periodKey,
      amount: rewardAmount,
      questName: quest.name
    };
    savePortalData(data);

    // CỘNG LÚA TRỰC TIẾP VÀO VÍ GAME & ISLEPILOT
    let balRes;
    try {
      balRes = await modifyLivePlayerBalance(steamId, rewardAmount, `quest_reward_${questId}`);
      clearPlayerCache(steamId);
    } catch (err) {
      // Revert nếu lỗi kết nối
      delete data.claimedQuests[steamId][claimKey];
      delete data.claimedQuests[steamId][questId];
      savePortalData(data);
      throw err;
    }

    const newBalance = balRes?.balance !== undefined ? balRes.balance : (data.userWallets[steamId] || 0);

    res.json({
      success: true,
      message: `Chúc mừng! Bạn đã hoàn thành nhiệm vụ [${quest.name}] và nhận ngay +${rewardAmount} Lúa 🌾 vào ví!`,
      rewardAmount,
      questId,
      claimKey,
      periodKey,
      newBalance
    });
  } catch (err) {
    console.error('Lỗi nhận thưởng nhiệm vụ:', err);
    res.status(500).json({ error: "Lỗi hệ thống khi nhận Lúa thưởng! Vui lòng thử lại sau." });
  } finally {
    releasePlayerLock(steamId, 'quest');
  }
});


// 6.2 Nhận Tất Cả Lúa Thưởng Nhiệm Vụ (Claim All Completed Rewards)
app.post(ST25API.routes.playerQuestsClaimAll, async (req, res) => {
  const steamId = getRequestSteamId(req);
  if (!steamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam trước khi nhận Lúa thưởng!" });
  }

  // Khóa chống Race Condition / Spam Click Duplicate Lúa
  if (!acquirePlayerLock(steamId, 'quest')) {
    return res.status(429).json({ error: "Giao dịch đang được xử lý, vui lòng không bấm nhận liên tục!" });
  }

  try {
    const questsData = await callIslePilot(PilotAPI.playerQuests(steamId), 'GET', null, true);
    if (!questsData || !Array.isArray(questsData.quests)) {
      return res.status(400).json({ error: "Không tìm thấy dữ liệu nhiệm vụ!" });
    }

    const data = getPortalData();
    if (!data.claimedQuests) data.claimedQuests = {};
    if (!data.claimedQuests[steamId]) data.claimedQuests[steamId] = {};

    let totalReward = 0;
    const claimedNames = [];
    const claimedKeys = [];

    for (const quest of questsData.quests) {
      const isDone = isQuestCompleted(quest);
      const alreadyClaimed = isQuestClaimedInPeriod(quest, data.claimedQuests[steamId]);

      if (isDone && !alreadyClaimed) {
        let rewardAmount = 0;
        if (Array.isArray(quest.rewards)) {
          quest.rewards.forEach(r => {
            if (r.kind === 'coins' || r.kind === 'coin' || r.kind === 'lua') {
              rewardAmount += Number(r.amount) || 0;
            }
          });
        }
        if (rewardAmount <= 0) {
          rewardAmount = quest.period === 'monthly' ? 50 : (quest.period === 'weekly' ? 24 : 8);
        }

        totalReward += rewardAmount;
        claimedNames.push(quest.name);
        
        const periodKey = getQuestPeriodKey(quest);
        const claimKey = `${quest.id}_${periodKey}`;
        claimedKeys.push(claimKey);

        data.claimedQuests[steamId][claimKey] = {
          claimedAt: new Date().toISOString(),
          periodKey,
          amount: rewardAmount,
          questName: quest.name
        };
        data.claimedQuests[steamId][quest.id] = {
          claimedAt: new Date().toISOString(),
          periodKey,
          amount: rewardAmount,
          questName: quest.name
        };
      }
    }

    if (totalReward <= 0) {
      return res.json({
        success: false,
        message: "Hiện tại bạn chưa có nhiệm vụ nào mới đủ điều kiện nhận thưởng."
      });
    }

    // LƯU NGAY TRƯỚC KHI GỌI MẠNG ĐỂ CHỐNG SPAM CONCURRENT
    savePortalData(data);

    let balRes;
    try {
      balRes = await modifyLivePlayerBalance(steamId, totalReward, `quest_rewards_batch`);
      clearPlayerCache(steamId);
    } catch (err) {
      // Revert nếu lỗi
      claimedKeys.forEach(k => delete data.claimedQuests[steamId][k]);
      savePortalData(data);
      throw err;
    }

    const newBalance = balRes?.balance !== undefined ? balRes.balance : (data.userWallets[steamId] || 0);

    res.json({
      success: true,
      message: `Thành công! Đã nhận tổng cộng +${totalReward} Lúa 🌾 từ ${claimedNames.length} nhiệm vụ đã hoàn thành!`,
      totalReward,
      claimedCount: claimedNames.length,
      claimedKeys,
      claimedIds: Object.keys(data.claimedQuests[steamId] || {}),
      newBalance
    });
  } catch (err) {
    console.error('Lỗi nhận tất cả nhiệm vụ:', err);
    res.status(500).json({ error: "Lỗi hệ thống khi nhận Lúa thưởng! Vui lòng thử lại sau." });
  } finally {
    releasePlayerLock(steamId, 'quest');
  }
});
};
