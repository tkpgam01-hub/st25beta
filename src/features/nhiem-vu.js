
    let currentSteamId = null;

    document.addEventListener('DOMContentLoaded', async () => {
      // 1. Check current logged in user from localStorage or API session
      try {
        const stored = localStorage.getItem('st25_steam_user');
        if (stored) {
          const u = JSON.parse(stored);
          if (u && u.steam_id) currentSteamId = u.steam_id;
        }
      } catch (e) {}

      // Check URL param if provided
      const params = new URLSearchParams(window.location.search);
      const urlSteamId = params.get('steamId');
      if (urlSteamId) {
        currentSteamId = urlSteamId;
      }

      await loadPersonalQuests(currentSteamId);
    });

    async function loadPersonalQuests(steamId) {
      try {
        let url = ST25API.routes.playerQuests;
        if (steamId) {
          url += `?steamId=${encodeURIComponent(steamId)}`;
        }
        
        const res = await App.readResponse(url);
        if (res.ok) {
          const data = await res.json();
          if (data.steamId) currentSteamId = data.steamId;
          renderPersonalDashboard(data);
          renderQuests(data);
        } else {
          showUnlinkedState();
        }
      } catch (e) {
        console.error('Failed to load personal quests:', e);
        showUnlinkedState();
      }
    }

    function showUnlinkedState() {
      const banner = document.getElementById('personal-profile-banner');
      const unlinkedAlert = document.getElementById('unlinked-alert');
      if (unlinkedAlert) unlinkedAlert.style.display = 'block';
      if (banner) banner.style.display = 'none';
    }

    function renderPersonalDashboard(data) {
      if (!data) return;

      const player = data.player;
      document.getElementById('unlinked-alert').style.display = data.isLoggedIn ? 'none' : 'block';
      document.getElementById('personal-profile-banner').style.display = data.isLoggedIn ? '' : 'none';
      const steamId = data.steamId;

      if (player) {
        document.getElementById('player-name').textContent = player.name || 'Người chơi ST25';
        document.getElementById('player-avatar').src = player.avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';
        document.getElementById('player-steam-id').textContent = steamId || '---';

        const speciesEl = document.getElementById('player-dino-species');
        if (speciesEl) speciesEl.textContent = `Loài: ${player.species || 'Chưa chọn'} (${player.gender || 'Đực'})`;

        const growthEl = document.getElementById('player-dino-growth');
        if (growthEl) growthEl.textContent = `Độ lớn: ${player.growth}%`;

        const onlineEl = document.getElementById('player-dino-online');
        if (onlineEl) {
          onlineEl.textContent = player.online ? 'Đang trực tuyến' : 'Ngoại tuyến';
          onlineEl.className = `rule-badge ${player.online ? 'badge-allow' : 'badge-orange'}`;
        }

        const mapBtn = document.getElementById('btn-view-on-map');
        if (mapBtn && steamId) {
          mapBtn.href = `bando.html?steamId=${encodeURIComponent(steamId)}`;
        }

        const navBtn = document.getElementById('nav-btn-user');
        if (navBtn) {
          navBtn.textContent = player.name;
        }
      } else {
        document.getElementById('player-steam-id').textContent = steamId || '---';
      }

      // Lúa display (ST25 Golden Rice)
      const luaAmount = (data.coins || 0).toLocaleString();
      document.getElementById('player-coins-amount').innerHTML = `🌾 ${luaAmount} <span style="font-size: 1.1rem; color: #fef08a;">Lúa</span>`;
    }

    function renderQuests(data) {
      QuestBoard.render(data);
      // 2. Prime Elder Evolution Quests
      const pGrid = document.getElementById('prime-quests-grid');
      const primeStatus = document.getElementById('prime-quest-status');
      const primeEligible = document.getElementById('prime-eligibility-badge');

      if (data.primeQuests && data.primeQuests.length > 0) {
        const completedCount = data.primeQuests.filter(pq => pq.done).length;
        if (primeStatus) primeStatus.textContent = `${completedCount} / ${data.primeQuests.length} Đã Đạt`;

        if (primeEligible) {
          if (completedCount >= 5) {
            primeEligible.textContent = `Đủ điều kiện (${completedCount}/5)`;
            primeEligible.className = 'rule-badge badge-allow';
          } else {
            primeEligible.textContent = `Cần thêm ${5 - completedCount} điều kiện`;
            primeEligible.className = 'rule-badge badge-warn';
          }
        }

        pGrid.innerHTML = data.primeQuests.map(pq => `
          <div class="prime-card ${pq.done ? 'completed' : ''}">
            <div style="display: flex; flex-direction: column; gap: 4px; padding-right: 12px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-weight: 700; color: #fff; font-size: 0.9rem;">#${pq.index}. ${pq.name}</span>
              </div>
              <span style="font-size: 0.775rem; color: var(--text-secondary); line-height: 1.4;">${pq.desc || pq.originalName}</span>
            </div>
            <span class="rule-badge ${pq.done ? 'badge-allow' : 'badge-orange'}" style="font-size: 0.75rem; padding: 4px 8px; flex-shrink: 0;">
              ${pq.done ? '✓ ĐẠT' : 'CHƯA ĐẠT'}
            </span>
          </div>
        `).join('');
      } else {
        pGrid.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; grid-column: 1 / -1;">Chưa có thông tin Prime Quests cho loài khủng long này.</p>';
      }
    }

    function getAuthHeaders() {
      const headers = { 'Content-Type': 'application/json' };
      try {
        const stored = localStorage.getItem('st25_steam_user');
        if (stored) {
          const u = JSON.parse(stored);
          if (u && u.steam_id) headers['x-steam-id'] = u.steam_id;
        }
      } catch (_) {}
      return headers;
    }

    async function claimSingleQuest(questId, claimKey, questName, reward) {
      try {
        const res = await fetch(ST25API.routes.playerQuestsClaim, {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({ questId })
        });
        const result = await res.json();
        if (res.ok && result.success) {
          App.showToast(result.message || `Đã nhận +${reward} Lúa 🌾 thành công!`, 'success');
          // Khóa nhiệm vụ trong chu kỳ này trên trình duyệt người chơi
          try {
            const key = 'st25_claimed_quests_' + currentSteamId;
            const existing = JSON.parse(localStorage.getItem(key) || '{}');
            const targetClaimKey = result.claimKey || claimKey || questId;
            existing[targetClaimKey] = Date.now();
            existing[questId] = Date.now();
            localStorage.setItem(key, JSON.stringify(existing));
          } catch (_) {}
          if (result.newBalance !== undefined) {
            document.getElementById('player-coins-amount').innerHTML = `🌾 ${result.newBalance.toLocaleString()} <span style="font-size: 1.1rem; color: #fef08a;">Lúa</span>`;
          }
          await loadPersonalQuests(currentSteamId);
        } else {
          App.showToast(result.error || 'Nhận thưởng thất bại!', 'error');
        }
      } catch (e) {
        console.error(e);
        App.showToast('Lỗi mạng khi nhận thưởng nhiệm vụ!', 'error');
      }
    }

    async function claimAllQuests() {
      try {
        const res = await fetch(ST25API.routes.playerQuestsClaimAll, {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({})
        });
        const result = await res.json();
        if (res.ok && result.success) {
          App.showToast(result.message, 'success');
          // Khóa tất cả nhiệm vụ đã nhận trong chu kỳ này trên trình duyệt người chơi
          try {
            const key = 'st25_claimed_quests_' + currentSteamId;
            const existing = JSON.parse(localStorage.getItem(key) || '{}');
            if (Array.isArray(result.claimedKeys)) {
              result.claimedKeys.forEach(k => { existing[k] = Date.now(); });
            }
            if (Array.isArray(result.claimedIds)) {
              result.claimedIds.forEach(id => { existing[id] = Date.now(); });
            }
            localStorage.setItem(key, JSON.stringify(existing));
          } catch (_) {}
          if (result.newBalance !== undefined) {
            document.getElementById('player-coins-amount').innerHTML = `🌾 ${result.newBalance.toLocaleString()} <span style="font-size: 1.1rem; color: #fef08a;">Lúa</span>`;
          }
          await loadPersonalQuests(currentSteamId);
        } else {
          App.showToast(result.error || result.message || 'Không có nhiệm vụ để nhận thưởng!', 'info');
        }
      } catch (e) {
        console.error(e);
        App.showToast('Lỗi mạng khi nhận thưởng!', 'error');
      }
    }
  
