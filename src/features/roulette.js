(function() {
  'use strict';

  const API = window.ST25API ? window.ST25API.routes : {
    rouletteState: '/api/roulette/state',
    roulettePrepare: '/api/roulette/prepare',
    rouletteSpin: '/api/roulette/spin',
    rouletteDevLogin: '/api/roulette/dev-login'
  };

  // Sound synthesis via Web Audio API (no external sound files required)
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playTickSound() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch (e) {}
  }

  function playWinSound() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const notes = [440, 554.37, 659.25, 880];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.25);
      });
    } catch (e) {}
  }

  // Wheel constants
  const WHEEL_ORDER = [0, 1, 8, 2, 9, 3, 10, 4, 11, 5, 12, 6, 13, 7, 14];
  const TILE_WIDTH = 98; // 90px width + 8px margin
  const REPETITIONS = 7; // Repeat wheel order 7 times to allow long smooth roll

  const state = {
    mode: 'demo', // 'wallet' or 'demo'
    demoBalance: 10000,
    authenticated: false,
    walletAvailable: false,
    balance: 0,
    minBet: 1,
    maxBet: 1000,
    currentGameId: null,
    isSpinning: false,
    recentRolls: [],
    stats100: { t: 0, ct: 0, dragon: 0 },
    currentStripOffset: 0
  };

  // DOM elements
  const el = {
    balance: document.getElementById('roulette-balance'),
    modeLabel: document.getElementById('roulette-mode-label'),
    modeToggle: document.getElementById('roulette-mode-toggle'),
    devLoginBtn: document.getElementById('roulette-dev-login'),
    loginBtn: document.getElementById('roulette-login'),
    notice: document.getElementById('roulette-notice'),
    strip: document.getElementById('roulette-strip'),
    carouselContainer: document.getElementById('roulette-carousel-container'),
    timerText: document.getElementById('roulette-timer-text'),
    progressFill: document.getElementById('roulette-progress-fill'),
    betAmount: document.getElementById('roulette-amount'),
    historyBadges: document.getElementById('roulette-history-badges'),
    statT: document.getElementById('stat-t-count'),
    statDragon: document.getElementById('stat-dragon-count'),
    statCt: document.getElementById('stat-ct-count'),
    btnBetT: document.getElementById('btn-bet-t'),
    btnBetDragon: document.getElementById('btn-bet-dragon'),
    btnBetCt: document.getElementById('btn-bet-ct'),
    betsListT: document.getElementById('bets-list-t'),
    betsListDragon: document.getElementById('bets-list-dragon'),
    betsListCt: document.getElementById('bets-list-ct'),
    totalBetT: document.getElementById('total-bet-t'),
    totalBetDragon: document.getElementById('total-bet-dragon'),
    totalBetCt: document.getElementById('total-bet-ct'),
    proofOutput: document.getElementById('roulette-proof-output'),
    clientSeedInput: document.getElementById('roulette-client-seed')
  };

  function getSlotColor(slot) {
    if (slot === 0) return 'dragon';
    if (slot >= 1 && slot <= 7) return 't';
    return 'ct';
  }

  function getSlotIcon(slot) {
    if (slot === 0) return '👑';
    if (slot >= 1 && slot <= 7) return '🦖';
    return '🦕';
  }

  // Build the continuous slider strip
  function buildStrip() {
    if (!el.strip) return;
    el.strip.innerHTML = '';
    for (let rep = 0; rep < REPETITIONS; rep++) {
      for (let i = 0; i < WHEEL_ORDER.length; i++) {
        const slot = WHEEL_ORDER[i];
        const color = getSlotColor(slot);
        const icon = getSlotIcon(slot);
        const tile = document.createElement('div');
        tile.className = `roulette-tile tile-${color}`;
        tile.dataset.slot = slot;
        tile.dataset.color = color;
        tile.dataset.index = rep * WHEEL_ORDER.length + i;
        tile.innerHTML = `
          <span class="roulette-tile-icon">${icon}</span>
          <span class="roulette-tile-num">${slot === 0 ? 'DRAGON' : slot}</span>
        `;
        el.strip.appendChild(tile);
      }
    }
  }

  function updateModeUI() {
    if (state.mode === 'demo') {
      if (el.modeLabel) el.modeLabel.textContent = '🎮 CHẾ ĐỘ CHƠI THỬ';
      if (el.modeToggle) {
        el.modeToggle.textContent = '🎮 Chế độ: Chơi Thử';
        el.modeToggle.style.background = '#0f766e';
      }
    } else {
      if (el.modeLabel) el.modeLabel.textContent = '🌾 VÍ LÚA MÁY CHỦ';
      if (el.modeToggle) {
        el.modeToggle.textContent = '🌾 Chế độ: Ví Thật';
        el.modeToggle.style.background = '#b45309';
      }
    }
    renderBalance();
    setSpinningState(state.isSpinning);
  }

  function renderBalance() {
    if (!el.balance) return;
    if (state.mode === 'demo') {
      el.balance.textContent = `${state.demoBalance.toLocaleString('vi-VN')} Lúa (Demo)`;
      return;
    }

    if (!state.authenticated) {
      el.balance.textContent = '— Lúa';
      if (el.loginBtn) el.loginBtn.style.display = 'inline-block';
    } else {
      el.balance.textContent = `${state.balance.toLocaleString('vi-VN')} 🌾`;
      if (el.loginBtn) el.loginBtn.style.display = 'none';
      if (el.devLoginBtn) el.devLoginBtn.style.display = 'none';
    }
  }

  function renderHistory() {
    if (el.historyBadges && state.recentRolls) {
      el.historyBadges.innerHTML = state.recentRolls.slice(0, 12).map(r => {
        const color = r.color || getSlotColor(r.slot);
        const label = r.slot === 0 ? '👑' : r.slot;
        return `<span class="roulette-badge badge-${color}" title="Ô số ${r.slot} (${color.toUpperCase()})">${label}</span>`;
      }).join('');
    }
    if (el.statT) el.statT.textContent = state.stats100.t || 0;
    if (el.statDragon) el.statDragon.textContent = state.stats100.dragon || 0;
    if (el.statCt) el.statCt.textContent = state.stats100.ct || 0;
  }

  function setNotice(message, isAlert = false) {
    if (!el.notice) return;
    el.notice.textContent = message;
    if (isAlert) {
      el.notice.classList.add('alert');
    } else {
      el.notice.classList.remove('alert');
    }
  }

  function setSpinningState(spinning) {
    state.isSpinning = spinning;
    const btns = [el.btnBetT, el.btnBetDragon, el.btnBetCt];
    btns.forEach(b => {
      // In demo mode or authenticated wallet mode: buttons are clickable!
      const canBet = (state.mode === 'demo') || (state.mode === 'wallet' && state.authenticated);
      if (b) b.disabled = spinning || !canBet;
    });
    if (el.betAmount) el.betAmount.disabled = spinning;
  }

  // Animate the wheel slider
  function spinWheelTo(winningSlot, offset = 0.5, onComplete) {
    if (!el.strip || !el.carouselContainer) {
      if (onComplete) onComplete();
      return;
    }

    // Select target slot in the 4th repetition
    const targetRep = 4;
    const slotIndexInOrder = WHEEL_ORDER.indexOf(winningSlot);
    const globalTileIndex = targetRep * WHEEL_ORDER.length + slotIndexInOrder;

    const containerWidth = el.carouselContainer.offsetWidth;
    const tileCenter = globalTileIndex * TILE_WIDTH + (TILE_WIDTH / 2);
    // Subtle natural jitter around needle
    const offsetJitter = (offset - 0.5) * (TILE_WIDTH * 0.7);
    const targetTranslateX = - (tileCenter - (containerWidth / 2) + offsetJitter);

    // Reset transition & prepare
    el.strip.style.transition = 'none';
    const startTranslateX = -(WHEEL_ORDER.length * TILE_WIDTH);
    el.strip.style.transform = `translate3d(${startTranslateX}px, 0, 0)`;

    // Remove previous winner highlights
    const allTiles = el.strip.querySelectorAll('.roulette-tile');
    allTiles.forEach(t => t.classList.remove('winner-highlight'));

    // Trigger audio ticks during roll
    let tickInterval = null;
    let ticksFired = 0;
    const maxTicks = 45;
    let currentDelay = 40;

    function scheduleNextTick() {
      if (ticksFired >= maxTicks) return;
      playTickSound();
      ticksFired++;
      currentDelay += (ticksFired * 3.5);
      tickInterval = setTimeout(scheduleNextTick, currentDelay);
    }

    // Force reflow
    void el.strip.offsetWidth;

    // Apply smooth deceleration cubic-bezier
    el.strip.style.transition = 'transform 4.5s cubic-bezier(0.12, 0.8, 0.33, 1)';
    el.strip.style.transform = `translate3d(${targetTranslateX}px, 0, 0)`;

    scheduleNextTick();

    setTimeout(() => {
      clearTimeout(tickInterval);
      const winningTile = el.strip.querySelector(`.roulette-tile[data-index="${globalTileIndex}"]`);
      if (winningTile) winningTile.classList.add('winner-highlight');
      if (onComplete) onComplete();
    }, 4600);
  }

  // Place Bet Handler (Supports both Real Wallet & Demo Mode)
  async function placeBet(choice) {
    if (state.isSpinning) return;

    const amount = parseInt(el.betAmount.value, 10);
    if (!Number.isSafeInteger(amount) || amount < state.minBet || amount > state.maxBet) {
      setNotice(`Mức cược phải từ ${state.minBet} đến ${state.maxBet} Lúa.`, true);
      return;
    }

    // --- 1. XỬ LÝ CHẾ ĐỘ CHƠI THỬ (DEMO) ---
    if (state.mode === 'demo') {
      if (amount > state.demoBalance) {
        setNotice(`Số dư chơi thử không đủ (${state.demoBalance} Lúa). Nhấn Reset hoặc cược số nhỏ hơn.`, true);
        return;
      }

      getAudioContext();
      setSpinningState(true);
      state.demoBalance -= amount;
      renderBalance();

      setNotice(`[CHƠI THỬ] Đã đặt ${amount.toLocaleString('vi-VN')} Lúa vào cửa ${choice.toUpperCase()}! Đang quay số...`);
      if (el.timerText) el.timerText.innerHTML = '<span class="highlight">Đang quay (Demo)...</span>';
      if (el.progressFill) el.progressFill.style.width = '0%';

      // Random demo outcome
      const slot = Math.floor(Math.random() * 15);
      const color = getSlotColor(slot);
      const multiplier = (slot === 0 ? 13.5 : 1.95);
      const isWin = (choice === color);
      const payout = isWin ? Math.floor(amount * multiplier) : 0;
      const offset = 0.2 + Math.random() * 0.6;

      spinWheelTo(slot, offset, () => {
        if (isWin) {
          playWinSound();
          state.demoBalance += payout;
          setNotice(`🎉 [CHƠI THỬ] Chúc mừng! Ô số ${slot} (${color.toUpperCase()}) dừng lại. Bạn thắng +${payout.toLocaleString('vi-VN')} Lúa demo!`);
        } else {
          setNotice(`[CHƠI THỬ] Ô số ${slot} (${color.toUpperCase()}) dừng lại. Bạn không trúng cửa ${choice.toUpperCase()}. Thử lại nhé!`);
        }
        renderBalance();

        state.recentRolls.unshift({ slot, color, createdAt: Date.now() });
        if (state.stats100[color] !== undefined) state.stats100[color]++;
        renderHistory();

        if (el.proofOutput) {
          el.proofOutput.textContent = `[CHẾ ĐỘ CHƠI THỬ - DEMO]\nÔ kết quả: ${slot} (${color.toUpperCase()})\nHệ số: x${multiplier}\nTrả thưởng: ${payout} Lúa demo`;
        }

        setSpinningState(false);
        if (el.timerText) el.timerText.innerHTML = 'Sẵn sàng <span class="highlight">Đặt cược ván mới</span>';
        if (el.progressFill) el.progressFill.style.width = '100%';
      });
      return;
    }

    // --- 2. XỬ LÝ VÍ LÚA THẬT (REAL WALLET) ---
    if (!state.authenticated) {
      setNotice('Bạn chưa liên kết Steam. Nhấn nút "🔑 Đăng Nhập Test" hoặc chuyển sang "🎮 Chơi Thử" để quay ngay!', true);
      return;
    }

    if (amount > state.balance) {
      setNotice(`Số dư không đủ (${state.balance} Lúa). Vui lòng nạp thêm hoặc giảm mức cược.`, true);
      return;
    }

    getAudioContext();
    setSpinningState(true);
    setNotice(`Đã đặt ${amount.toLocaleString('vi-VN')} Lúa vào cửa ${choice.toUpperCase()}! Đang quay số...`);
    if (el.timerText) el.timerText.innerHTML = '<span class="highlight">Đang quay...</span>';
    if (el.progressFill) el.progressFill.style.width = '0%';

    try {
      const response = await fetch(API.rouletteSpin, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          choice,
          amount,
          clientSeed: el.clientSeedInput ? el.clientSeedInput.value : 'st25-vietnam-player',
          gameId: state.currentGameId
        })
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Lỗi đặt cược từ máy chủ.');
      }

      state.balance -= amount;
      renderBalance();

      const outcome = data.outcome;
      spinWheelTo(outcome.slot, outcome.offset, () => {
        state.balance = data.balance;
        renderBalance();

        state.recentRolls.unshift({
          slot: outcome.slot,
          color: outcome.color,
          createdAt: Date.now()
        });
        if (state.stats100[outcome.color] !== undefined) state.stats100[outcome.color]++;
        renderHistory();

        if (outcome.isWin) {
          playWinSound();
          setNotice(`🎉 Chúc mừng! Ô số ${outcome.slot} (${outcome.color.toUpperCase()}) dừng lại. Bạn thắng +${outcome.payout.toLocaleString('vi-VN')} Lúa!`);
        } else {
          setNotice(`Ô số ${outcome.slot} (${outcome.color.toUpperCase()}) dừng lại. Chúc bạn may mắn lần sau!`);
        }

        if (el.proofOutput && data.game) {
          el.proofOutput.textContent = `Ván cược: ${data.game.id}\nServer Seed: ${data.game.serverSeed}\nCommitment: ${data.game.commitment}\nKết quả: Ô ${outcome.slot} (${outcome.color.toUpperCase()})`;
        }

        state.currentGameId = null;
        setSpinningState(false);
        if (el.timerText) el.timerText.innerHTML = 'Sẵn sàng <span class="highlight">Đặt cược ván mới</span>';
        if (el.progressFill) el.progressFill.style.width = '100%';
      });

    } catch (err) {
      setNotice(err.message, true);
      setSpinningState(false);
      renderBalance();
    }
  }

  // Setup quick amount buttons
  function setupQuickButtons() {
    document.querySelectorAll('.roulette-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        let val = parseInt(el.betAmount.value, 10) || 0;
        const currentBal = state.mode === 'demo' ? state.demoBalance : state.balance;
        if (action === 'plus1') val += 1;
        else if (action === 'plus10') val += 10;
        else if (action === 'plus50') val += 50;
        else if (action === 'plus100') val += 100;
        else if (action === 'half') val = Math.max(1, Math.floor(val / 2));
        else if (action === 'double') val = Math.min(state.maxBet, val * 2);
        else if (action === 'max') val = Math.min(state.maxBet, Math.max(1, currentBal));
        else if (action === 'clear') val = 10;

        el.betAmount.value = Math.max(state.minBet, Math.min(state.maxBet, val));
      });
    });
  }

  // Load state from API
  async function loadState() {
    try {
      const res = await fetch(API.rouletteState);
      const data = await res.json();
      state.authenticated = !!data.authenticated;
      state.walletAvailable = !!data.walletAvailable;
      state.balance = data.balance || 0;
      state.recentRolls = data.recentRolls || [];
      state.stats100 = data.stats100 || { t: 0, ct: 0, dragon: 0 };
      state.minBet = data.minBet || 1;
      state.maxBet = data.maxBet || 1000;

      // If user is authenticated, default to wallet mode, else demo mode
      if (state.authenticated) {
        state.mode = 'wallet';
        setNotice('Đã kết nối ví Lúa thật. Chọn cửa cược và bắt đầu quay!');
      } else {
        state.mode = 'demo';
        setNotice('Chế độ Chơi Thử đang bật (10.000 Lúa). Bạn có thể bấm đặt cược để quay thử ngay!');
      }

      updateModeUI();
      renderHistory();
    } catch (e) {
      state.mode = 'demo';
      updateModeUI();
      setNotice('Chế độ Chơi Thử sẵn sàng (10.000 Lúa). Bấm cược để quay ngay!');
    }
  }

  // Initialization
  function init() {
    buildStrip();
    setupQuickButtons();

    if (el.btnBetT) el.btnBetT.addEventListener('click', () => placeBet('t'));
    if (el.btnBetDragon) el.btnBetDragon.addEventListener('click', () => placeBet('dragon'));
    if (el.btnBetCt) el.btnBetCt.addEventListener('click', () => placeBet('ct'));

    // Mode toggle button
    if (el.modeToggle) {
      el.modeToggle.addEventListener('click', () => {
        if (state.mode === 'demo') {
          if (!state.authenticated) {
            setNotice('Bạn chưa liên kết Steam. Nhấn "🔑 Đăng Nhập Test" để kết nối ví!', true);
          }
          state.mode = 'wallet';
        } else {
          state.mode = 'demo';
          setNotice('Đã chuyển sang Chế độ Chơi Thử (10.000 Lúa).');
        }
        updateModeUI();
      });
    }

    // Dev / Test Login button
    if (el.devLoginBtn) {
      el.devLoginBtn.addEventListener('click', async () => {
        try {
          setNotice('Đang đăng nhập tài khoản Test Admin (76561198789527189)...');
          const res = await fetch(API.rouletteDevLogin, { method: 'POST' });
          const json = await res.json();
          if (json.ok) {
            setNotice('Đăng nhập Test Admin thành công! Đang tải số dư...');
            await loadState();
          } else {
            setNotice(json.error || 'Đăng nhập test thất bại.', true);
          }
        } catch (err) {
          setNotice('Lỗi kết nối khi đăng nhập test: ' + err.message, true);
        }
      });
    }

    loadState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
