
    document.addEventListener('DOMContentLoaded', async () => {
      // Chạy song song để không bị nghẽn nếu một endpoint API phản hồi chậm
      Promise.allSettled([
        loadOnlineDinos(),
        loadCurrentSession(),
        loadTeamData()
      ]);

      const btnUnlink = document.getElementById('btn-unlink');
      if (btnUnlink) {
        btnUnlink.addEventListener('click', async () => {
          try {
            await fetch(ST25API.routes.playerLogout, { method: 'POST' });
          } catch (_) {}
          localStorage.removeItem('st25_steam_user');
          if (typeof App !== 'undefined' && App.showToast) {
            App.showToast('Đã huỷ liên kết tài khoản Steam.', 'info');
          }
          resetProfileCard();
          setTimeout(() => window.location.reload(), 400);
        });
      }
    });

    // 1. Load Online Dinosaurs Population (Only show Dino species & Growth, strictly NO player character names)
    async function loadOnlineDinos() {
      try {
        const res = await App.readResponse(ST25API.routes.serverPlayers);
        if (res.ok) {
          const dinos = await res.json();
          const badge = document.getElementById('online-count-badge');
          const container = document.getElementById('online-players-chips');

          if (badge) badge.textContent = `${dinos.length} cá thể đang sống`;

          if (dinos.length === 0) {
            container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Hiện chưa có khủng long nào online trong game.</span>';
            return;
          }

          const herbivores = ["Triceratops", "Stegosaurus", "Diabloceratops", "Kentrosaurus", "Tenontosaurus", "Maiasaura", "Pachycephalosaurus", "Dryosaurus", "Hypsilophodon"];
          
          container.innerHTML = dinos.map(d => {
            const isHerbi = herbivores.includes(d.species);
            const icon = isHerbi ? "🌿" : "🦖";
            const growthPct = d.growthPct !== undefined ? d.growthPct : Math.round((d.growth || 0) * 100);
            return `
              <div class="dino-status-pill">
                <span>${icon}</span>
                <strong style="color: #fff;">${d.species}</strong>
                <span style="color: var(--accent-emerald-light); font-size: 0.775rem;">(${growthPct}% lớn)</span>
              </div>
            `;
          }).join('');
        }
      } catch (e) {
        console.error('Failed to load online dinos:', e);
      }
    }

    // 2. Load Current Authenticated Session from Steam OpenID
    async function loadCurrentSession() {
      // 2.1. Đọc dữ liệu đã lưu từ localStorage trước để hiển thị ngay, tránh màn hình trắng/chưa liên kết
      let cachedUser = null;
      try {
        const stored = localStorage.getItem('st25_steam_user');
        if (stored) {
          cachedUser = JSON.parse(stored);
          if (cachedUser && (cachedUser.steam_id || cachedUser.linked)) {
            cachedUser.linked = true;
            updateProfileCard(cachedUser);
          }
        }
      } catch (err) {
        console.warn('Lỗi đọc cache Steam user:', err);
      }

      // 2.2. Kiểm tra thông báo URL query params (sau khi Steam callback chuyển hướng về)
      const urlParams = new URLSearchParams(window.location.search);
      const isLoginSuccess = urlParams.get('login') === 'success';
      const urlError = urlParams.get('error');

      if (urlError && typeof App !== 'undefined' && App.showToast) {
        App.showToast(decodeURIComponent(urlError), 'error');
      }

      // 2.3. Lấy dữ liệu phiên tài khoản từ API /api/player/me
      try {
        let user = null;
        if (typeof App !== 'undefined' && typeof App.readJSON === 'function') {
          try {
            user = await App.readJSON(ST25API.routes.playerMe);
          } catch (appErr) {
            // App.readJSON ném lỗi nếu status không 2xx (ví dụ 503 IslePilot offline)
            console.warn('App.readJSON /api/player/me thất bại:', appErr);
          }
        }

        if (!user) {
          const res = await App.readResponse(ST25API.routes.playerMe, { credentials: 'same-origin' });
          if (res.ok) {
            user = await res.json();
          } else {
            const errData = await res.json().catch(() => ({}));
            if (res.status === 503) {
              console.warn('IslePilot API đang bảo trì hoặc offline:', errData.error || res.statusText);
              if (cachedUser && typeof App !== 'undefined' && App.showToast) {
                App.showToast('Máy chủ IslePilot đang bận, hiển thị phiên đăng nhập đã lưu.', 'warning');
              }
            }
          }
        }

        if (user && (user.linked || user.isLoggedIn || user.steam_id)) {
          user.linked = true;
          try {
            localStorage.setItem('st25_steam_user', JSON.stringify(user));
          } catch (_) {}
          updateProfileCard(user);

          if (isLoginSuccess) {
            if (typeof App !== 'undefined' && App.showToast) {
              App.showToast(`Chào mừng ${user.persona_name || 'người chơi'}! Đã liên kết Steam thành công.`, 'success');
            }
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } else if (user && user.linked === false && !user.steam_id) {
          // Server xác nhận rõ ràng chưa liên kết
          localStorage.removeItem('st25_steam_user');
          resetProfileCard();
        }
      } catch (e) {
        console.warn('Lỗi gọi API /api/player/me:', e);
        if (cachedUser) {
          updateProfileCard(cachedUser);
        }
      }

      // 2.4. Đăng ký lắng nghe sự kiện tài khoản từ App (nếu app.js hoàn tất xác thực sau)
      if (typeof App !== 'undefined' && typeof App.subscribeUser === 'function') {
        App.subscribeUser((liveUser, authError) => {
          if (liveUser && (liveUser.linked || liveUser.steam_id)) {
            liveUser.linked = true;
            updateProfileCard(liveUser);
          }
        });
      }
    }

    function resetProfileCard() {
      const nameEl = document.getElementById('steam-profile-name');
      if (nameEl) nameEl.textContent = 'Chưa liên kết';
      const idEl = document.getElementById('steam-profile-id');
      if (idEl) idEl.textContent = 'SteamID: Chưa có';
      const avatarEl = document.getElementById('steam-profile-avatar');
      if (avatarEl) avatarEl.src = 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';
      const badge = document.getElementById('steam-link-badge');
      if (badge) {
        badge.textContent = 'Chờ liên kết';
        badge.className = 'rule-badge badge-warn';
      }
      const btnUnlink = document.getElementById('btn-unlink');
      if (btnUnlink) btnUnlink.style.display = 'none';
      const loginBtn = document.getElementById('btn-steam-login');
      if (loginBtn) {
        loginBtn.innerHTML = `
          <svg viewBox="0 0 24 24" style="width: 24px; height: 24px; fill: currentColor;">
            <path d="M12 2a10 10 0 0 0-10 10c0 4.7 3.25 8.64 7.64 9.69l3.12-4.52a3.02 3.02 0 0 1-.76-.17l-3.3 2.27A7.99 7.99 0 0 1 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8c0 3.96-2.88 7.24-6.67 7.89l-2.22-3.21c.2-.29.35-.61.44-.96l3.66.72a4 4 0 0 0 .16-.89 4 4 0 0 0-4-4c-1.66 0-3.08 1.01-3.67 2.45l-4.14-.82A7.96 7.96 0 0 1 12 4c4.41 0 8 3.59 8 8 0 4.41-3.59 8-8 8-1.07 0-2.09-.21-3.03-.6l3.32-4.81c.22.04.45.06.68.06a3 3 0 0 0 3-3 3 3 0 0 0-3-3 3 3 0 0 0-2.94 2.37l-3.5-.69A5.002 5.002 0 0 1 12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5z"/>
          </svg>
          <span>🌾 ĐĂNG NHẬP BẰNG STEAM 🦖</span>
        `;
      }
      const dinoEl = document.getElementById('card-dino-species');
      if (dinoEl) dinoEl.textContent = 'Chưa xác định';
      const growthEl = document.getElementById('card-dino-growth');
      if (growthEl) growthEl.textContent = '0%';
      const coordsEl = document.getElementById('card-coords');
      if (coordsEl) coordsEl.textContent = 'Chưa có GPS';
      const playEl = document.getElementById('card-playtime');
      if (playEl) playEl.textContent = '0 giờ';
    }

    function updateProfileCard(user) {
      if (!user || (!user.linked && !user.steam_id)) return;
      user.linked = true;

      const nameEl = document.getElementById('steam-profile-name');
      if (nameEl) nameEl.textContent = user.persona_name || 'Người chơi';

      const idEl = document.getElementById('steam-profile-id');
      if (idEl) idEl.textContent = `SteamID: ${user.steam_id}`;

      const avatarEl = document.getElementById('steam-profile-avatar');
      if (avatarEl) avatarEl.src = user.avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';

      const badge = document.getElementById('steam-link-badge');
      if (badge) {
        badge.textContent = 'ĐÃ XÁC THỰC STEAM';
        badge.className = 'rule-badge badge-allow';
      }

      // Show unlink button
      const btnUnlink = document.getElementById('btn-unlink');
      if (btnUnlink) {
        btnUnlink.style.display = 'inline-flex';
      }

      const loginBtn = document.getElementById('btn-steam-login');
      if (loginBtn) {
        loginBtn.innerHTML = `
          <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor;">
            <path d="M12 2a10 10 0 0 0-10 10c0 4.7 3.25 8.64 7.64 9.69l3.12-4.52a3.02 3.02 0 0 1-.76-.17l-3.3 2.27A7.99 7.99 0 0 1 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8c0 3.96-2.88 7.24-6.67 7.89l-2.22-3.21c.2-.29.35-.61.44-.96l3.66.72a4 4 0 0 0 .16-.89 4 4 0 0 0-4-4c-1.66 0-3.08 1.01-3.67 2.45l-4.14-.82A7.96 7.96 0 0 1 12 4c4.41 0 8 3.59 8 8 0 4.41-3.59 8-8 8-1.07 0-2.09-.21-3.03-.6l3.32-4.81c.22.04.45.06.68.06a3 3 0 0 0 3-3 3 3 0 0 0-2.94 2.37l-3.5-.69A5.002 5.002 0 0 1 12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5z"/>
          </svg>
          <span>ĐỔI TÀI KHOẢN STEAM KHÁC</span>
        `;
      }

      const dinoEl = document.getElementById('card-dino-species');
      const growthEl = document.getElementById('card-dino-growth');
      const coordsEl = document.getElementById('card-coords');

      if (user.dino && user.dino.species) {
        if (dinoEl) dinoEl.textContent = `${user.dino.species} (${user.dino.gender || 'Không rõ'})`;
        if (growthEl) growthEl.textContent = `${user.dino.growth || 0}% lớn`;
        if (user.dino.position) {
          const x = Math.round(user.dino.position.x / 100);
          const y = Math.round(user.dino.position.y / 100);
          if (coordsEl) coordsEl.textContent = `X: ${x} | Y: ${y}`;
        } else if (coordsEl) {
          coordsEl.textContent = 'Chưa có GPS';
        }
      } else {
        if (dinoEl) dinoEl.textContent = 'Chưa chọn / Đang chết';
        if (growthEl) growthEl.textContent = '0%';
        if (coordsEl) coordsEl.textContent = 'Chưa có GPS';
      }

      const playEl = document.getElementById('card-playtime');
      if (playEl) playEl.textContent = `${user.playtime_hours || 0} giờ`;

      const mapBtn = document.getElementById('btn-goto-map');
      if (mapBtn) mapBtn.href = `bando.html?steamId=${encodeURIComponent(user.steam_id)}`;

      const questsBtn = document.getElementById('btn-goto-quests');
      if (questsBtn) questsBtn.href = `nhiem-vu.html?steamId=${encodeURIComponent(user.steam_id)}`;
    }

    // 3. Load Team Pack Data
    async function loadTeamData() {
      try {
        const res = await App.readResponse(ST25API.routes.playerTeam);
        if (res.ok) {
          const team = await res.json();
          renderTeamRoster(team);
        }
      } catch (e) {
        console.error('Failed to load team data:', e);
      }
    }

    function renderTeamRoster(team) {
      const container = document.getElementById('team-members-container');
      const badge = document.getElementById('pack-limit-badge');
      const title = document.getElementById('pack-species-title');
      if (!container) return;

      if (title) title.textContent = `Loài ${team.species}:`;

      if (badge) {
        badge.textContent = `${team.current_count} / ${team.pack_limit} Thành viên (${team.is_full ? 'Đủ Đàn' : 'Còn Chỗ'})`;
        badge.className = `rule-badge ${team.is_full ? 'badge-warn' : 'badge-allow'}`;
      }

      if (!team.members || team.members.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Chưa có thành viên nào khác trong đàn.</p>';
        return;
      }

      container.innerHTML = team.members.map(m => `
        <div class="team-member-card">
          <img class="member-avatar" src="${m.avatar}" alt="${m.name}">
          <div class="member-info">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="member-name">${m.name}</span>
              <span class="rule-badge ${m.role.includes('Chủ đàn') ? 'badge-allow' : 'badge-warn'}" style="font-size: 0.7rem; padding: 2px 6px;">${m.role}</span>
            </div>
            <div class="member-dino">${m.species} • Lớn: <strong>${m.growth}%</strong></div>
            <div class="member-coords">Toạ độ: ${m.coordinates} • Máu: ${m.health}%</div>
          </div>
        </div>
      `).join('');
    }
  
