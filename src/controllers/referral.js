const PilotAPI = require('../api/upstream-endpoints');
const ST25API = require('../api/endpoints');
// referral feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {getPortalData, savePortalData, callIslePilot, clearPlayerCache, acquirePlayerLock, releasePlayerLock, getRequestSteamId, SUPER_ADMINS, getLivePlayerBalance, modifyLivePlayerBalance, getRealServerPlayers} = context;


// 14. Mời Bạn Bè (Referral) & Nhập Mã Quà Tặng (Giftcode)
app.get(ST25API.routes.referralMe, async (req, res) => {
  const data = getPortalData();
  if (!data.lockedInviteCodes) data.lockedInviteCodes = [];
  if (!data.userCustomInviteCodes) data.userCustomInviteCodes = {};

  const steamId = getRequestSteamId(req);
  if (!steamId) {
    return res.json({
      loggedIn: false,
      referralCode: null,
      isCodeLocked: false,
      invitedCount: 0,
      earnedLua: 0,
      invitedBy: null,
      currentBalance: 0,
      rewardPerInvite: 50
    });
  }

  const cleanSteamId = String(steamId).trim();
  const currentCode = data.userCustomInviteCodes[cleanSteamId] || `ST25-${cleanSteamId.slice(-5)}`;
  data.userCustomInviteCodes[cleanSteamId] = currentCode;

  const isCodeLocked = (data.lockedInviteCodes || []).includes(currentCode.toUpperCase());
  const referralInfo = (data.referrals && data.referrals[cleanSteamId]) || { count: 0, earnedLua: 0, invitedBy: null };
  const currentBalance = await getLivePlayerBalance(cleanSteamId);

  res.json({
    loggedIn: true,
    steamId: cleanSteamId,
    referralCode: currentCode,
    isCodeLocked,
    invitedCount: referralInfo.count || 0,
    earnedLua: referralInfo.earnedLua || 0,
    invitedBy: referralInfo.invitedBy || null,
    currentBalance: currentBalance,
    rewardPerInvite: 50
  });
});


app.post(ST25API.routes.referralGenerateCode, async (req, res) => {
  const steamId = getRequestSteamId(req);
  if (!steamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam!" });
  }

  const cleanSteamId = String(steamId).trim();
  const data = getPortalData();
  if (!data.lockedInviteCodes) data.lockedInviteCodes = [];
  if (!data.userCustomInviteCodes) data.userCustomInviteCodes = {};

  const randSuffix = Math.floor(10000 + Math.random() * 90000);
  const newCode = `ST25-${cleanSteamId.slice(-3)}${randSuffix}`;

  data.userCustomInviteCodes[cleanSteamId] = newCode;
  savePortalData(data);

  res.json({
    success: true,
    message: "Đã tạo mã mời mới thành công! Mỗi mã có hiệu lực 1 lần duy nhất.",
    referralCode: newCode,
    isCodeLocked: false
  });
});


app.post(ST25API.routes.referralClaim, async (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) {
    return res.status(400).json({ error: "Vui lòng nhập mã giới thiệu hoặc mã quà tặng hợp lệ!" });
  }

  const cleanCode = code.trim().toUpperCase();
  const steamId = getRequestSteamId(req);
  if (!steamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam trước khi nhập mã nhận Lúa!" });
  }

  const cleanSteamId = String(steamId).trim();

  // Khóa chống Race Condition / Spam Click Duplicate Lúa
  if (!acquirePlayerLock(cleanSteamId, 'code')) {
    return res.status(429).json({ error: "Hệ thống đang xử lý mã của bạn, vui lòng không bấm liên tục!" });
  }

  try {
    // BẢO VỆ CHỐNG BOT / ACC CLONE ẢO: Bắt buộc tài khoản đã từng vào chơi trên server ST25
    const playerInfo = await callIslePilot(PilotAPI.player(cleanSteamId));
    if (!playerInfo || !playerInfo.lastSeenAt) {
      return res.status(400).json({ error: "Tài khoản của bạn chưa từng tham gia máy chủ ST25 in-game! Vui lòng vào game trước khi kích hoạt mã quà tặng." });
    }

    const data = getPortalData();
    if (!data.referrals) data.referrals = {};
    if (!data.referrals[cleanSteamId]) {
      data.referrals[cleanSteamId] = { count: 0, earnedLua: 0, invitedBy: null };
    }
    if (!data.userWallets) data.userWallets = {};
    if (!data.claimedCodeHistory) data.claimedCodeHistory = [];
    if (!data.claimedCodesPerUser) data.claimedCodesPerUser = {};
    if (!data.claimedCodesPerUser[cleanSteamId]) data.claimedCodesPerUser[cleanSteamId] = [];
    if (!data.lockedInviteCodes) data.lockedInviteCodes = [];
    if (!data.userCustomInviteCodes) data.userCustomInviteCodes = {};

    // 1. TỪ CHỐI HOÀN TOÀN TẤT CẢ GIFTCODE SỰ KIỆN CŨ (Đã hủy bỏ theo yêu cầu BQT)
    if (['ST25-TANTHU', 'ST25-WELCOME', 'ST25-VIP'].includes(cleanCode)) {
      return res.status(400).json({ 
        error: "Mã quà tặng sự kiện (Giftcode) đã kết thúc hoặc không tồn tại! Hệ thống hiện chỉ hỗ trợ Mã Giới Thiệu bạn bè cá nhân." 
      });
    }

    // 2. MỖI TÀI KHOẢN NGƯỜI CHƠI CHỈ ĐƯỢC NHẬP MÃ MỜI ĐÚNG 1 LẦN DUY NHẤT TRONG ĐỜI
    if (data.referrals[cleanSteamId].invitedBy) {
      return res.status(400).json({ 
        error: `Tài khoản của bạn đã từng kích hoạt mã mời bạn bè [${data.referrals[cleanSteamId].invitedBy}] rồi! Mỗi tài khoản chỉ được nhập mã mời 1 lần duy nhất trong đời.` 
      });
    }

    // 3. MỖI MÃ MỜI BẠN BÈ CHỈ DÙNG ĐÚNG 1 LẦN DUY NHẤT TOÀN MÁY CHỦ, DÙNG XONG LÀ BLOCK VĨNH VIỄN
    if (data.lockedInviteCodes.includes(cleanCode)) {
      return res.status(400).json({ 
        error: `Mã giới thiệu [${cleanCode}] này đã có người sử dụng và đã bị KHÓA VĨNH VIỄN! Mỗi mã mời chỉ có hiệu lực đúng 1 lần duy nhất.` 
      });
    }

    const alreadyUsed = data.claimedCodeHistory.some(h => h.code === cleanCode);
    if (alreadyUsed) {
      if (!data.lockedInviteCodes.includes(cleanCode)) {
        data.lockedInviteCodes.push(cleanCode);
        savePortalData(data);
      }
      return res.status(400).json({ 
        error: `Mã giới thiệu [${cleanCode}] này đã có người sử dụng và đã bị KHÓA VĨNH VIỄN! Mỗi mã mời chỉ có hiệu lực đúng 1 lần duy nhất.` 
      });
    }

    const myCode = (data.userCustomInviteCodes[cleanSteamId] || `ST25-${cleanSteamId.slice(-5)}`).toUpperCase();
    if (cleanCode === myCode || cleanCode === cleanSteamId.slice(-5)) {
      return res.status(400).json({ error: "Bạn không thể tự nhập mã giới thiệu của chính mình!" });
    }

    let rewardAmount = 20;
    let successMsg = "";
    let referrerSteamId = null;
    let referrerName = null;

      // Tìm kiếm người giới thiệu:
      for (const [sId, uCode] of Object.entries(data.userCustomInviteCodes || {})) {
        if (String(uCode).trim().toUpperCase() === cleanCode) {
          referrerSteamId = sId;
          break;
        }
      }

      if (!referrerSteamId) {
        const codeSuffix = cleanCode.replace(/^ST25-/, '');
        let allPlayers = [];
        try {
          allPlayers = await getRealServerPlayers();
        } catch (_) {}

        const candidateIds = new Set([
          ...Object.keys(data.userWallets || {}),
          ...Object.keys(data.referrals || {}),
          ...allPlayers.map(p => p.steamId),
          ...SUPER_ADMINS
        ]);

        for (const candId of candidateIds) {
          if (candId.endsWith(codeSuffix)) {
            referrerSteamId = candId;
            break;
          }
        }
      }

      if (!referrerSteamId) {
        return res.status(400).json({ 
          error: `Mã giới thiệu [${cleanCode}] không tồn tại trên máy chủ ST25! Vui lòng kiểm tra lại mã từ bạn bè.` 
        });
      }

      if (referrerSteamId === cleanSteamId) {
        return res.status(400).json({ error: "Bạn không thể tự nhập mã giới thiệu của chính mình!" });
      }

      let allPlayers = [];
      try {
        allPlayers = await getRealServerPlayers();
      } catch (_) {}
      const matched = allPlayers.find(p => p.steamId === referrerSteamId);
      referrerName = matched ? matched.name : `Player_${referrerSteamId.slice(-4)}`;

      successMsg = `Chúc mừng! Bạn đã kích hoạt mã giới thiệu từ [${referrerName}] và nhận ngay +20 Lúa 🌾!`;

    // ĐÁNH DẤU VÀ LƯU DỮ LIỆU TRƯỚC ĐỂ CHỐNG CONCURRENT DUPLICATE
    data.claimedCodesPerUser[cleanSteamId].push(cleanCode);
    data.claimedCodeHistory.push({
      steamId: cleanSteamId,
      code: cleanCode,
      reward: rewardAmount,
      claimedAt: new Date().toISOString()
    });

    if (referrerSteamId) {
      if (!data.referrals[referrerSteamId]) {
        data.referrals[referrerSteamId] = { count: 0, earnedLua: 0, invitedBy: null };
      }
      data.referrals[referrerSteamId].count = (data.referrals[referrerSteamId].count || 0) + 1;
      data.referrals[referrerSteamId].earnedLua = (data.referrals[referrerSteamId].earnedLua || 0) + 20;
      data.referrals[cleanSteamId].invitedBy = cleanCode;

      if (!data.lockedInviteCodes.includes(cleanCode)) {
        data.lockedInviteCodes.push(cleanCode);
      }
    }
    savePortalData(data);

    // THỰC HIỆN CỘNG LÚA TRỰC TIẾP VÀO VÍ GAME & ISLEPILOT
    const userBalanceResult = await modifyLivePlayerBalance(cleanSteamId, rewardAmount, `claim_code_${cleanCode}`);
    clearPlayerCache(cleanSteamId);

    if (referrerSteamId) {
      await modifyLivePlayerBalance(referrerSteamId, 20, `referral_friend_${cleanSteamId}`);
      clearPlayerCache(referrerSteamId);
    }

    const finalBalance = userBalanceResult?.balance !== undefined ? userBalanceResult.balance : (data.userWallets[cleanSteamId] || 0);

    res.json({
      success: true,
      message: successMsg,
      reward: rewardAmount,
      newBalance: finalBalance,
      code: cleanCode,
      locked: !!referrerSteamId
    });
  } catch (err) {
    console.error('Lỗi nhận giftcode:', err);
    res.status(500).json({ error: "Lỗi hệ thống khi nhận mã quà tặng! Vui lòng thử lại sau." });
  } finally {
    releasePlayerLock(cleanSteamId, 'code');
  }
});
};
