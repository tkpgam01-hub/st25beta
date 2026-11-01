
    let myBalance = 0;
    let currentSteamId = null;

    function getActiveSteamId() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const qId = urlParams.get('steamId');
        if (qId && /^\d{17}$/.test(qId.trim())) return qId.trim();
        const stored = localStorage.getItem('st25_steam_user');
        if (stored) {
          const u = JSON.parse(stored);
          if (u && u.steam_id && /^\d{17}$/.test(u.steam_id.trim())) return u.steam_id.trim();
        }
      } catch (_) {}
      return null;
    }

    async function switchCrateUser(sid) {
      if (!sid) return;
      App.showToast('Đang chuyển đổi tài khoản...', 'info');
      try {
        const res = await fetch(ST25API.routes.playerLoginManual, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ steamId: sid })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          localStorage.setItem('st25_steam_user', JSON.stringify({
            steam_id: data.steamId,
            persona_name: data.personaName,
            avatar: data.avatar,
            isAdmin: data.isAdmin
          }));
          window.location.search = `?steamId=${encodeURIComponent(sid)}`;
        }
      } catch (e) {
        console.error(e);
      }
    }

    async function quickLoginCrate() {
      const inp = document.getElementById('manual-crate-steamid');
      const sid = inp ? inp.value.trim() : '';
      if (!sid || !/^\d{17}$/.test(sid)) {
        App.showToast('Vui lòng nhập đúng 17 số Steam ID!', 'error');
        return;
      }
      switchCrateUser(sid);
    }

    async function loadCrates() {
      try {
        const sid = getActiveSteamId();
        currentSteamId = sid;

        const cratesUrl = sid ? `${ST25API.routes.cratesList}?steamId=${encodeURIComponent(sid)}` : ST25API.routes.cratesList;
        const marketUrl = sid ? `${ST25API.routes.marketData}?steamId=${encodeURIComponent(sid)}` : ST25API.routes.marketData;
        const hdrs = sid ? { 'x-steam-id': sid } : {};

        const [cratesRes, marketRes] = await Promise.all([
          App.readResponse(cratesUrl, { headers: hdrs }),
          App.readResponse(marketUrl, { headers: hdrs })
        ]);
        const cratesData = await cratesRes.json();
        const marketData = await marketRes.json();

        myBalance = cratesData.balance !== undefined ? cratesData.balance : (marketData.balance || 0);
        document.getElementById('my-lua-balance').textContent = `${myBalance.toLocaleString('vi-VN')} Lúa 🌾`;

        const playerDisplay = document.getElementById('crate-player-display');
        const sidDisplay = document.getElementById('crate-steamid-display');
        const accTag = document.getElementById('crate-account-tag');

        if (sid) {
          const pName = marketData.personaName || `Player_${sid.slice(-4)}`;
          if (playerDisplay) playerDisplay.textContent = `Tài khoản: ${pName}`;
          if (sidDisplay) sidDisplay.textContent = `Steam ID: ${sid}`;
          if (accTag) accTag.textContent = `Tài khoản: ${pName} (${sid})`;
        } else {
          if (playerDisplay) playerDisplay.textContent = `Tài khoản: Khách (Chưa đăng nhập)`;
          if (sidDisplay) sidDisplay.textContent = `Steam ID: Chưa liên kết`;
          if (accTag) accTag.textContent = `Chưa đăng nhập Steam`;
        }

        const cratesList = cratesData.crates || [];
        allLoadedCrates = cratesList;
        if (cratesList.length > 0) {
          activeLoadedCrate = cratesList[0];
        }
        const container = document.getElementById('crates-container');

        if (!cratesList || cratesList.length === 0) {
          container.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 40px; grid-column: 1/-1;">Đang tải dữ liệu Gacha từ IslePilot Cloud...</div>';
          return;
        }

        container.innerHTML = cratesList.map(crate => `
          <div class="crate-card halloween-theme" style="padding: 26px; border: 2px solid ${crate.color || '#a855f7'}; box-shadow: 0 10px 30px rgba(168, 85, 247, 0.25);">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span class="rule-badge badge-allow" style="background: rgba(168, 85, 247, 0.25); border-color: ${crate.color || '#a855f7'}; color: #d8b4fe; font-size: 0.85rem; font-weight: 700;">
                  ☁️ ISLEPILOT CLOUD CASE
                </span>
                <span style="color: #fbbf24; font-weight: 800; font-size: 1.1rem;">
                  Chi phí: ${crate.price || crate.cost || 8} Lúa 🌾
                </span>
              </div>

              <div class="crate-icon-box" style="font-size: 4rem; margin: 10px 0;">${crate.icon === 'crate' ? '🎁' : (crate.icon || '🎃')}</div>
              <h2 style="color: #fff; font-size: 1.6rem; margin-bottom: 6px; text-align: center;">${crate.name}</h2>
              <p style="color: var(--text-secondary); font-size: 0.92rem; margin-bottom: 18px; text-align: center; line-height: 1.5;">
                ${crate.desc || 'Hòm may mắn chính thức đồng bộ thời gian thực từ IslePilot Cloud.'}<br>
                <small style="color: #10b981; font-weight: 600;">☁️ Mở trực tiếp trên Cổng ST25 — Trúng khủng long cộng thẳng vào Garage!</small>
              </p>

              ${(crate.rewards && crate.rewards.length > 0) ? `
                <div class="crate-rewards-list" style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <strong style="color: #fbbf24; font-size: 0.9rem;">🎯 Danh mục phần thưởng & Tỷ lệ:</strong>
                    <span style="color: #38bdf8; font-size: 0.75rem; font-weight: 600;">☁️ Live Sync</span>
                  </div>
                  ${crate.rewards.map(r => `
                    <div style="display: flex; justify-content: space-between; align-items: center; color: #cbd5e1; margin-bottom: 6px; font-size: 0.85rem; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 4px;">
                      <span><strong style="color: ${r.rarityColor || '#38bdf8'}; font-size: 0.72rem; margin-right: 6px; border: 1px solid ${r.rarityColor || '#38bdf8'}; padding: 1px 4px; border-radius: 3px;">[${r.rarityLabel || 'THƯỜNG'}]</strong> ${r.name}</span>
                      <span style="color: ${r.rarityColor || 'var(--text-muted)'}; font-weight: 700;">${r.weight}%</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>

            <div style="margin-top: 22px;">
              <button disabled class="btn btn-secondary" style="width: 100%; text-align: center; font-size: 1.02rem; font-weight: 700; padding: 14px 20px; opacity: 0.65; cursor: not-allowed; border-radius: 8px;">
                🔒 HÒM ĐANG TẠM ĐÓNG
              </button>
            </div>
          </div>
        `).join('');

      } catch (e) {
        console.error('Error loading crates:', e);
      }
    }

    let allLoadedCrates = [];
    let activeLoadedCrate = null;
    let gachaTimeout = null;
    let currentGachaResult = null;
    let gachaBusy = false;
    let gachaStartTimeout = null;

    async function openHalloweenGacha(price, crateId) {
      if (gachaBusy || currentGachaResult) return;
      const sid = getActiveSteamId();
      if (!sid) {
        App.showToast('Vui lòng đăng nhập Steam trước khi quay thưởng!', 'error');
        return;
      }

      if (myBalance < price) {
        App.showToast(`Bạn không đủ Lúa! Cần ${price} Lúa 🌾 (Hiện có: ${myBalance} Lúa).`, 'error');
        return;
      }

      gachaBusy = true;
      try {
        App.showToast('Đang kết nối mở hòm may mắn... 🎃', 'info');
        const selectedCrate = (allLoadedCrates && allLoadedCrates.find(c => c.id === crateId)) || activeLoadedCrate;
        const crateIdToOpen = (selectedCrate && selectedCrate.id) || crateId || (activeLoadedCrate && activeLoadedCrate.id) || 'cmuvclx96082iml01bson72ak';
        const res = await fetch(ST25API.routes.cratesOpen, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-steam-id': sid
          },
          body: JSON.stringify({ crateId: crateIdToOpen, steamId: sid })
        });
        const result = await res.json();
        if (!res.ok) {
          App.showToast(result.error || 'Quay thưởng thất bại!', 'error');
          return;
        }

        currentGachaResult = result;
        myBalance = result.newBalance;
        document.getElementById('my-lua-balance').textContent = `${myBalance.toLocaleString('vi-VN')} Lúa 🌾`;

        // Chuẩn bị dải 42 thẻ quay thưởng lấy từ danh mục phần thưởng IslePilot Cloud
        const strip = document.getElementById('gacha-reel-strip');
        strip.style.transition = 'none';
        strip.style.transform = 'translateX(0px)';

        const targetIndex = 32; // Thẻ trúng giải đặt ở vị trí thứ 32
        const winningReward = result.reward;
        const rewardsPool = (selectedCrate && selectedCrate.rewards && selectedCrate.rewards.length > 0)
          ? selectedCrate.rewards
          : (activeLoadedCrate && activeLoadedCrate.rewards && activeLoadedCrate.rewards.length > 0)
          ? activeLoadedCrate.rewards
          : [
              { name: "Tyrannosaurus 80%", icon: "🐾", rarityColor: "#ef4444", rarityLabel: "CỔ ĐẠI" },
              { name: "Triceratops 80%", icon: "🦏", rarityColor: "#ec4899", rarityLabel: "THẦN THOẠI" },
              { name: "Tyrannosaurus 60%", icon: "🐾", rarityColor: "#a855f7", rarityLabel: "HIẾM" },
              { name: "Allosaurus 60%", icon: "🐾", rarityColor: "#a855f7", rarityLabel: "HIẾM" },
              { name: "Tyrannosaurus 40%", icon: "🐾", rarityColor: "#38bdf8", rarityLabel: "THƯỜNG" },
              { name: "100 LÚA 🌾", icon: "🪙", rarityColor: "#fbbf24", rarityLabel: "NGOẠI HẠNG" },
              { name: "2 LÚA 🌾", icon: "🪙", rarityColor: "#fbbf24", rarityLabel: "THƯỜNG" },
              { name: "🙅 Chúc May Mắn", icon: "🙅", rarityColor: "#64748b", rarityLabel: "THƯỜNG" }
            ];

        let cardsHtml = '';
        for (let i = 0; i < 42; i++) {
          let item = null;
          if (i === targetIndex) {
            item = {
              name: winningReward.name,
              icon: winningReward.icon || '🎁',
              label: winningReward.rarityLabel || 'THƯỜNG',
              color: winningReward.rarityColor || '#38bdf8'
            };
          } else {
            const rand = rewardsPool[Math.floor(Math.random() * rewardsPool.length)];
            item = {
              name: rand.name,
              icon: rand.icon || '🎁',
              label: rand.rarityLabel || 'THƯỜNG',
              color: rand.rarityColor || '#38bdf8'
            };
          }

          cardsHtml += `
            <div class="gacha-card" style="border-color: ${item.color}55;">
              <div class="gacha-card-icon">${item.icon}</div>
              <div class="gacha-card-name">${item.name}</div>
              <div class="gacha-card-rarity" style="color: ${item.color}; border-color: ${item.color};">
                ${item.label}
              </div>
            </div>
          `;
        }
        strip.innerHTML = cardsHtml;

        // Mở Gacha Modal
        const modal = document.getElementById('gacha-modal');
        modal.classList.add('active');
        document.getElementById('gacha-status-text').textContent = 'Đang quay thưởng hồi hộp... 🎰';

        const wrapper = document.getElementById('gacha-reel-wrapper');
        const wrapperWidth = wrapper.offsetWidth || 760;
        const randomJitter = Math.floor(Math.random() * 40) - 20;
        const targetOffset = (targetIndex * 120 + 55) - (wrapperWidth / 2) + randomJitter;

        gachaStartTimeout = setTimeout(() => {
          strip.style.transition = 'transform 4.5s cubic-bezier(0.12, 0.8, 0.32, 1)';
          strip.style.transform = `translateX(-${targetOffset}px)`;
        }, 60);

        if (gachaTimeout) clearTimeout(gachaTimeout);
        gachaTimeout = setTimeout(() => {
          finishGachaRoll();
        }, 4800);

      } catch (e) {
        console.error(e);
        App.showToast('Lỗi mạng khi quay hòm!', 'error');
      } finally {
        gachaBusy = false;
      }
    }

    function skipGachaAnimation() {
      if (gachaTimeout) {
        clearTimeout(gachaTimeout);
        gachaTimeout = null;
      }
      finishGachaRoll();
    }

    function finishGachaRoll() {
      clearTimeout(gachaStartTimeout);
      clearTimeout(gachaTimeout);
      gachaStartTimeout = null;
      gachaTimeout = null;
      const modal = document.getElementById('gacha-modal');
      modal.classList.remove('active');

      if (!currentGachaResult) return;
      const result = currentGachaResult;
      currentGachaResult = null;

      // Show winning reward modal
      document.getElementById('modal-reward-icon').textContent = result.reward.icon || '🎁';
      document.getElementById('modal-reward-name').textContent = result.reward.name;

      const garageBtn = document.getElementById('modal-garage-btn');
      if (result.transferredToGarage || result.reward.type === 'dino') {
        document.getElementById('modal-reward-desc').innerHTML = `
          🦖 <strong style="color: #fbbf24;">Khủng long [${result.reward.name}]</strong> đã được tự động cất thẳng vào <strong>Gara</strong> của bạn!<br>
          <span style="color: #94a3b8; font-size: 0.85rem; display: block; margin-top: 6px;">Bạn có thể mở Gara để đưa ra đảo chơi bất cứ lúc nào!</span>
        `;
        if (garageBtn) {
          garageBtn.style.display = 'block';
          const activeSid = getActiveSteamId();
          garageBtn.href = activeSid ? `gara.html?steamId=${encodeURIComponent(activeSid)}` : 'gara.html';
        }
      } else if (result.reward.type === 'lua') {
        document.getElementById('modal-reward-desc').textContent = `Chúc mừng bạn đã nhận được ${result.reward.amount} Lúa 🌾 cộng trực tiếp vào ví!`;
        if (garageBtn) garageBtn.style.display = 'none';
      } else if (result.reward.type === 'nothing') {
        document.getElementById('modal-reward-desc').textContent = `Rất tiếc lần này chưa may mắn! Chúc bạn may mắn ở vòng quay tiếp theo nhé!`;
        if (garageBtn) garageBtn.style.display = 'none';
      } else {
        document.getElementById('modal-reward-desc').textContent = `Vật phẩm [${result.reward.name}] đã được lưu vào Túi đồ của bạn.`;
        if (garageBtn) garageBtn.style.display = 'none';
      }
      document.getElementById('reward-modal').classList.add('active');

      // Prepend to recent wins
      const winsList = document.getElementById('recent-wins');
      const newWinDiv = document.createElement('div');
      newWinDiv.style = "display: flex; justify-content: space-between; padding: 10px 14px; background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 6px; font-size: 0.85rem;";
      newWinDiv.innerHTML = `
        <span style="color: #fff;">🎃 Bạn vừa quay <strong>${result.crateName}</strong> trúng <strong style="color: #c084fc;">${result.reward.name}</strong></span>
        <span style="color: #fbbf24;">Vừa xong</span>
      `;
      winsList.prepend(newWinDiv);
    }

    function closeRewardModal() {
      document.getElementById('reward-modal').classList.remove('active');
    }

    document.addEventListener('DOMContentLoaded', loadCrates);
  
