// ST25 Garage System — Synchronized 100% with IslePilot Cloud API (st25.islepilot.eu/garage)

// ── Helper: Lấy ảnh PNG thực tế theo species ──────────────────────────────
const GARAGE_DINO_CATALOG = Object.freeze({
  allosaurus: ['Allosaurus', 'red'], austroraptor: ['Austroraptor', 'green'],
  beipiaosaurus: ['Beipiaosaurus', 'green'], carnotaurus: ['Carnotaurus', 'red'],
  ceratosaurus: ['Ceratosaurus', 'red'], deinosuchus: ['Deinosuchus', 'red'],
  diabloceratops: ['Diabloceratops', 'green'], dilophosaurus: ['Dilophosaurus', 'red'],
  dryosaurus: ['Dryosaurus', 'green'], gallimimus: ['Gallimimus', 'green'],
  herrerasaurus: ['Herrerasaurus', 'red'], hypsilophodon: ['Hypsilophodon', 'green'],
  kentrosaurus: ['Kentrosaurus', 'green'], maiasaura: ['Maiasaura', 'green'],
  omniraptor: ['Omniraptor', 'green'], pachycephalosaurus: ['Pachycephalosaurus', 'green'],
  pteranodon: ['Pteranodon', 'red'], stegosaurus: ['Stegosaurus', 'green'],
  tenontosaurus: ['Tenontosaurus', 'green'], triceratops: ['Triceratops', 'green'],
  troodon: ['troodon', 'red'], tyrannosaurus: ['Tyrannosaurus', 'red']
});

function getGarageDinoVisual(species) {
  const key = String(species || '').replace(/[^a-z]/gi, '').toLowerCase();
  const normalized = key === 'trex' || key === 'tyrannosaurusrex' ? 'tyrannosaurus' : key;
  const entry = Object.hasOwn(GARAGE_DINO_CATALOG, normalized)
    ? GARAGE_DINO_CATALOG[normalized] : GARAGE_DINO_CATALOG.tyrannosaurus;
  return { filename: entry[0], color: entry[1] };
}

function getDinoImage(species, size = '80px', loading = 'eager') {
  const { filename, color } = getGarageDinoVisual(species);
  const pixels = Math.max(1, Math.min(224, parseInt(size, 10) || 80));
  const imageLoading = loading === 'lazy' ? 'lazy' : 'eager';
  return `<span class="garage-dino-visual garage-dino-visual--${color}" style="width:${pixels}px;height:${pixels}px;">
    <img src="assets/imges/thumbs/${filename}.png" alt="${filename}" width="${pixels}" height="${pixels}" decoding="async" loading="${imageLoading}"
      style="width:100%;height:100%;object-fit:contain;display:block;"
      onerror="this.onerror=null;this.src='assets/imges/${filename}.png';">
  </span>`;
}

function updateGarageDinoIcon(id, species) {
  const icon = document.getElementById(id);
  if (!icon) return;
  const { filename, color } = getGarageDinoVisual(species);
  icon.onerror = () => { icon.onerror = null; icon.src = 'assets/imges/' + filename + '.png'; };
  icon.src = 'assets/imges/thumbs/' + filename + '.png';
  icon.parentElement.classList.toggle('garage-dino-visual--red', color === 'red');
  icon.parentElement.classList.toggle('garage-dino-visual--green', color === 'green');
  icon.alt = String(species || 'Khủng long');
}
// ──────────────────────────────────────────────────────────────────────────

function escapeGarageHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

const Garage = {
  activeDino: null,
  slots: [],
  playerInfo: null,
  cooldownSeconds: 0,
  cooldownTimer: null,
  actionBusy: false,
  actionToken: 0,

  async prepareAction(url, body, sid) {
    const controller = new AbortController();
    this.prepareController = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(sid ? { 'x-steam-id': sid } : {}) },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
      if (this.prepareController === controller) this.prepareController = null;
    }
  },

  async init() {
    this.checkCooldown();
    await this.fetchGarageData();
    this.render();
  },

  async refresh() {
    App.showToast('Đang đồng bộ dữ liệu với IslePilot Cloud...', 'info');
    await this.fetchGarageData();
    this.render();
    App.showToast('Đã đồng bộ dữ liệu Gara thành công!', 'success');
  },

  checkCooldown() {
    const expireTime = localStorage.getItem('the_isle_garage_cooldown');
    if (expireTime) {
      const remaining = Math.ceil((parseInt(expireTime) - Date.now()) / 1000);
      if (remaining > 0) {
        this.cooldownSeconds = remaining;
        this.startCooldownTimer();
      } else {
        localStorage.removeItem('the_isle_garage_cooldown');
      }
    }
  },

  startCooldownTimer() {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.updateCooldownUI();

    const deadline = Number(localStorage.getItem('the_isle_garage_cooldown')) || Date.now() + this.cooldownSeconds * 1000;
    this.cooldownTimer = setInterval(async () => {
      this.cooldownSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (this.cooldownSeconds <= 0) {
        clearInterval(this.cooldownTimer);
        this.cooldownTimer = null;
        localStorage.removeItem('the_isle_garage_cooldown');
        App.showToast('Thời gian chuẩn bị hoàn tất! Dữ liệu đã sẵn sàng.', 'success');
        await this.fetchGarageData();
        this.render();
      }
      this.updateCooldownUI();
    }, 1000);
  },

  updateCooldownUI() {
    const alertBox = document.getElementById('cooldown-alert');
    const timerText = document.getElementById('cooldown-timer-text');
    if (!alertBox || !timerText) return;

    if (this.cooldownSeconds > 0) {
      alertBox.style.display = 'flex';
      const m = Math.floor(this.cooldownSeconds / 60);
      const s = this.cooldownSeconds % 60;
      timerText.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    } else {
      alertBox.style.display = 'none';
    }
  },

  getActiveSteamId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const qId = urlParams.get('steamId');
      if (qId && /^\d{17}$/.test(qId.trim())) return qId.trim();

      const stored = localStorage.getItem('st25_steam_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u && u.steam_id && /^\d{17}$/.test(u.steam_id.trim())) {
          return u.steam_id.trim();
        }
      }
    } catch (_) {}
    return null;
  },

  async quickLoginManual() {
    window.location.href = ST25API.routes.playerSteamLogin + "?redirect=/gara.html";
  },

  switchPlayer(targetSteamId) {
    if (!targetSteamId || !targetSteamId.trim()) {
      App.showToast('Vui lòng nhập Steam ID của người chơi cần xem!', 'error');
      return;
    }
    const cleanId = targetSteamId.trim();
    window.location.search = `?steamId=${encodeURIComponent(cleanId)}`;
  },

  resetToAdminSelf() {
    window.location.search = '';
  },

  openAssignForCurrent() {
    const curId = (this.playerInfo && this.playerInfo.steamId) || this.getActiveSteamId();
    if (curId) {
      window.location.href = `cai-dat.html?targetSteamId=${encodeURIComponent(curId)}`;
    }
  },

  async fetchGarageData() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const qId = urlParams.get('steamId');
      const sid = (qId && /^\d{17}$/.test(qId.trim())) ? qId.trim() : null;

      const storedUser = (() => {
        try {
          const s = localStorage.getItem('st25_steam_user');
          return s ? JSON.parse(s) : null;
        } catch (_) { return null; }
      })();

      const effectiveSid = sid || (storedUser && storedUser.steam_id && /^\d{17}$/.test(String(storedUser.steam_id).trim()) ? String(storedUser.steam_id).trim() : null);

      const hdrs = {};
      if (effectiveSid) {
        hdrs['x-steam-id'] = effectiveSid;
      }
      if (storedUser && storedUser.isAdmin && storedUser.steam_id) {
        hdrs['x-admin-steam-id'] = storedUser.steam_id;
      }

      const url = effectiveSid ? `${ST25API.routes.playerGarage}?steamId=${encodeURIComponent(effectiveSid)}` : ST25API.routes.playerGarage;
      const data = await App.readJSON(url, { headers: hdrs });
        
        // NẾU CHƯA ĐĂNG NHẬP (Chưa liên kết tài khoản Steam)
        if (!data.isLoggedIn || !data.steamId) {
          this.playerInfo = {
            steamId: null,
            personaName: 'Chưa đăng nhập Steam',
            totalParked: 0,
            maxSlots: data.maxSlots || 3,
            roleKey: 'default',
            roleName: 'Chưa liên kết',
            roleLimit: data.maxSlots || 3,
            isAdmin: false,
            isSuperAdmin: false,
            isViewingOther: false
          };
          this.activeDino = null;
          this.slots = [
            { slot: 1, empty: true },
            { slot: 2, empty: true },
            { slot: 3, empty: true }
          ];

          // Hiển thị khung mời đăng nhập và LUÔN GIỮ HIỂN THỊ GARA
          const loginPanel = document.getElementById('login-required-panel');
          const garagePanel = document.getElementById('garage-authenticated-content');
          if (loginPanel) loginPanel.style.display = 'block';
          if (garagePanel) garagePanel.style.display = 'block';

          // Để trắng ô nhập Steam ID nếu chưa có
          const manualInp = document.getElementById('manual-login-steamid');
          if (manualInp && !manualInp.value) manualInp.value = '';

          // Ẩn tất cả công cụ và liên kết Admin
          this.setAdminVisibility(false);
          this.updateHeaderUI();
          return;
        }

        // NẾU ĐÃ ĐĂNG NHẬP HỢP LỆ
        const loginPanel = document.getElementById('login-required-panel');
        const garagePanel = document.getElementById('garage-authenticated-content');
        if (loginPanel) loginPanel.style.display = 'none';
        if (garagePanel) garagePanel.style.display = 'block';

        this.activeDino = data.active;
        this.slots = data.slots || [];
        this.playerInfo = {
          steamId: data.steamId,
          personaName: data.personaName,
          totalParked: data.totalParked || 0,
          maxSlots: data.maxSlots || 3,
          roleKey: data.roleKey || 'default',
          roleName: data.roleName || '🦖 Thành Viên ST25',
          roleLimit: data.roleLimit || data.maxSlots || 3,
          isAdmin: !!data.isAdmin,
          isSuperAdmin: !!data.isSuperAdmin,
          isViewingOther: !!data.isViewingOther
        };

        // Lưu thông tin người dùng hiện tại vào localStorage
        if (!data.isViewingOther) {
          localStorage.setItem('st25_steam_user', JSON.stringify({
            steam_id: data.steamId,
            persona_name: data.personaName,
            isAdmin: !!data.isAdmin
          }));
        }

        // Điền Steam ID vào ô soi nhanh nếu là Admin
        const quickInp = document.getElementById('admin-quick-steamid');
        if (quickInp && data.steamId) {
          quickInp.value = data.steamId;
        }

        // Cập nhật ẩn/hiện công cụ Admin theo đúng thẩm quyền
        this.setAdminVisibility(!!data.isAdmin);

        this.updateHeaderUI();
        return;
    } catch (e) {
      console.error('Lỗi nạp dữ liệu garage:', e);
      App.showToast('Không thể kết nối máy chủ để lấy dữ liệu Gara!', 'error');
    }
  },

  setAdminVisibility(isAdmin) {
    const adminLinkBtn = document.getElementById('btn-admin-panel-link');
    const adminBar = document.getElementById('admin-quick-bar');
    const navAdminItem = document.getElementById('nav-admin-link-item');
    const headerAdminBtn = document.getElementById('btn-header-admin');

    if (adminLinkBtn) adminLinkBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    if (adminBar) adminBar.style.display = isAdmin ? 'flex' : 'none';
    if (navAdminItem) navAdminItem.style.display = isAdmin ? 'inline-block' : 'none';
    if (headerAdminBtn) headerAdminBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  },

  updateHeaderUI() {
    const nameEl = document.getElementById('garage-player-name');
    const steamEl = document.getElementById('garage-player-steamid');
    const countEl = document.getElementById('garage-count-badge');
    const roleBadge = document.getElementById('garage-role-badge');
    const noticeEl = document.getElementById('garage-capacity-notice');
    const summaryBadge = document.getElementById('slots-capacity-summary');

    if (!this.playerInfo || !this.playerInfo.steamId) {
      if (nameEl) nameEl.textContent = 'Chưa đăng nhập Steam';
      if (steamEl) steamEl.textContent = 'Steam ID: (Để trống)';
      if (countEl) countEl.textContent = 'Đang lưu: 0 / 3 Khủng Long';
      if (roleBadge) roleBadge.textContent = 'Chưa liên kết';
      if (noticeEl) {
        noticeEl.innerHTML = `Vui lòng đăng nhập qua Steam để đồng bộ khủng long của bạn trên ST25 Gara Cloud.`;
      }
      if (summaryBadge) {
        summaryBadge.textContent = '0 / 3 Slots';
      }
      return;
    }

    if (nameEl) nameEl.textContent = `Tài khoản: ${this.playerInfo.personaName}`;
    if (steamEl) steamEl.textContent = `Steam ID: ${this.playerInfo.steamId || 'Chưa đăng nhập'}`;
    if (countEl) countEl.textContent = `Đang lưu: ${this.playerInfo.totalParked} / ${this.playerInfo.maxSlots} Khủng Long`;
    if (roleBadge) roleBadge.textContent = `${escapeGarageHtml(this.playerInfo.roleName)} (${this.playerInfo.maxSlots} Slots)`;
    if (noticeEl) {
      noticeEl.innerHTML = `Bạn đang có vai trò: <strong style="color: #fbbf24;">${escapeGarageHtml(this.playerInfo.roleName)}</strong> — Giới hạn lưu trữ tối đa: <strong style="color: #38bdf8;">${this.playerInfo.maxSlots} slots</strong>. Dữ liệu được đồng bộ trực tiếp với IslePilot Cloud.`;
    }
    if (summaryBadge) {
      summaryBadge.textContent = `${this.playerInfo.totalParked} / ${this.playerInfo.maxSlots} Slots Đã Dùng`;
    }
  },

  render() {
    const activeSignature = JSON.stringify([this.activeDino, this.playerInfo]);
    const slotsSignature = JSON.stringify([this.slots, this.playerInfo]);
    if (activeSignature !== this.activeSignature) {
      this.activeSignature = activeSignature;
      this.renderActiveDino();
    }
    if (slotsSignature !== this.slotsSignature) {
      this.slotsSignature = slotsSignature;
      this.renderSlots();
    }
    this.updateCooldownUI();
  },

  renderActiveDino() {
    const panel = document.getElementById('active-dino-content');
    if (!panel) return;

    if (!this.playerInfo || !this.playerInfo.steamId) {
      panel.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
          <div style="display:flex;justify-content:center;margin-bottom:12px;">${getDinoImage("Tyrannosaurus", "80px")}</div>
          <h3 style="color: #fff; margin-bottom: 6px;">Chưa Đăng Nhập Tài Khoản Steam</h3>
          <p style="color: #94a3b8; max-width: 520px; margin: 0 auto 16px; line-height: 1.6;">
            Hãy đăng nhập bằng Steam chính chủ để hiển thị khủng long đang sống in-game của bạn!
          </p>
          <a href="${ST25API.routes.playerSteamLogin}?redirect=/gara.html" class="btn btn-primary btn-sm" style="font-weight: 700; background: linear-gradient(135deg, #10b981, #059669); border: none;">
            🎮 Đăng Nhập Steam Ngay
          </a>
        </div>
      `;
      return;
    }

    if (!this.activeDino) {
      panel.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
          <div style="display:flex;justify-content:center;margin-bottom:12px;">${getDinoImage("Tyrannosaurus", "80px")}</div>
          <h3 style="color: #fff; margin-bottom: 6px;">Bạn hiện không có khủng long nào đang chơi trong game</h3>
          <p style="color: #94a3b8; max-width: 500px; margin: 0 auto;">
            Hãy vào game spawn khủng long mới hoặc chọn một con từ Gara bên dưới bấm <strong>"Đưa Ra Đảo (Restore 30s)"</strong> để hồi phục vào server!
          </p>
        </div>
      `;
      return;
    }

    const d = this.activeDino;
    const isPrime = Boolean(d.isPrimeElder);
    panel.className = `active-dino-panel glass-panel ${isPrime ? 'holo-prime' : ''}`;
    panel.innerHTML = `
      <div class="garage-active-summary">
        <div class="garage-active-art">
        ${getDinoImage(d.species, '90px')}
        </div>
        <div class="garage-active-identity">
        <h3 style="color: #fff; margin-bottom: 6px; font-size: 1.45rem; font-weight: 800;">${escapeGarageHtml(d.species)}</h3>
        <div style="display: flex; gap: 6px; align-items: center; justify-content: center; flex-wrap: wrap;">
          <span class="rule-badge badge-allow">${escapeGarageHtml(d.gender)}</span>
          ${d.isPrimeElder ? '<span class="rule-badge badge-gold">👑 PRIME ELDER</span>' : ''}
        </div>
        </div>
        <p class="garage-active-growth">
          Trưởng thành: <b style="color: #34d399; font-size: 1.3rem;">${d.growth}%</b>
        </p>
        <button onclick="Garage.parkActiveDino()" class="btn btn-secondary btn-sm garage-active-park">
          📥 Cất Vào Gara (Park 30s)
        </button>
      </div>

      <div class="garage-active-stats">
        <div class="garage-active-stats-heading">
          <h4 style="color: #fff; margin: 0; font-size: 1.1rem; display: flex; align-items: center; gap: 6px;">
            <span>⚡ Chỉ Số Sinh Tồn In-Game</span>
          </h4>
          <span style="font-size: 0.85rem; color: #fbbf24; font-weight: 700; background: rgba(245, 158, 11, 0.1); padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(245, 158, 11, 0.3);">
            🥗 Dinh Dưỡng: ${d.diet ? d.diet.join(' • ') : '100% S-S-D'}
          </span>
        </div>

        <div class="garage-active-vitals">
          <div class="vital-meter">
            <div class="vital-label"><span>❤️ Máu (Health)</span><b style="color: #34d399;">${d.health}%</b></div>
            <div class="vital-track"><div class="vital-bar bar-hp" style="width: ${d.health}%"></div></div>
          </div>
          <div class="vital-meter">
            <div class="vital-label"><span>🍗 Đói (Hunger)</span><b style="color: #fbbf24;">${d.hunger}%</b></div>
            <div class="vital-track"><div class="vital-bar bar-hunger" style="width: ${d.hunger}%"></div></div>
          </div>
          <div class="vital-meter">
            <div class="vital-label"><span>💧 Khát (Thirst)</span><b style="color: #38bdf8;">${d.thirst}%</b></div>
            <div class="vital-track"><div class="vital-bar bar-thirst" style="width: ${d.thirst}%"></div></div>
          </div>
          <div class="vital-meter">
            <div class="vital-label"><span>⚡ Thể Lực (Stamina)</span><b style="color: #c084fc;">${d.stamina}%</b></div>
            <div class="vital-track"><div class="vital-bar bar-growth" style="width: ${d.stamina}%"></div></div>
          </div>
        </div>

        <div class="garage-active-rule">
          ⚠️ <strong>Luật bảo vệ Gara ST25:</strong> Không combat log (phải đứng yên 30s an toàn không nhận sát thương để niêm phong lên Cloud).
        </div>
      </div>
    `;
  },

  renderSlots() {
    const grid = document.getElementById('garage-slots-grid');
    if (!grid) return;

    if (!this.playerInfo || !this.playerInfo.steamId) {
      grid.innerHTML = [1, 2, 3].map(slotNum => `
        <div class="slot-card empty-slot glass-panel">
          <span class="slot-badge-num">Ô #${slotNum}</span>
          <div style="font-size: 2.2rem; margin-bottom: 8px; opacity: 0.4;">📦</div>
          <h4 style="color: #94a3b8; margin-bottom: 4px; font-size: 1.05rem;">Ô Trống #${slotNum}</h4>
          <p style="font-size: 0.8rem; margin: 0; color: #64748b;">Đăng nhập Steam để nạp khủng long trong Gara Cloud</p>
        </div>
      `).join('');
      return;
    }

    if (this.slots.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);" class="glass-panel">
          Gara của bạn hiện chưa có ô lưu trữ nào.
        </div>
      `;
      return;
    }

    grid.innerHTML = this.slots.map(s => {
      if (s.empty) {
        return `
          <div class="slot-card empty-slot glass-panel">
            <span class="slot-badge-num">Ô #${s.slot}</span>
            <div style="font-size: 2.2rem; margin-bottom: 8px; opacity: 0.4;">📦</div>
            <h4 style="color: #94a3b8; margin-bottom: 4px; font-size: 1.05rem;">Ô Trống #${s.slot}</h4>
            <p style="font-size: 0.8rem; margin: 0; color: #64748b;">Sẵn sàng cất khủng long mới</p>
          </div>
        `;
      }

      const isPrime = Boolean(s.isPrimeElder);
      const species = escapeGarageHtml(s.species || 'Khủng long');
      const growth = Math.max(0, Math.min(100, Number(s.growth) || 0));
      const mutations = Array.isArray(s.mutations) ? s.mutations : [];
      const mutHtml = mutations.length
        ? mutations.map(m => '<span class="mutation-gem">' + escapeGarageHtml(m) + '</span>').join('')
        : '<span class="garage-mutation-empty">Thuần chủng · Không đột biến</span>';

      return `
        <article class="slot-card dino-card-tcg garage-storage-card">
          <div class="garage-card-hero">
            <span class="slot-badge-num">Ô #${escapeGarageHtml(s.slot)}</span>
            ${isPrime ? '<span class="garage-prime-badge">👑 PRIME</span>' : ''}
            ${getDinoImage(s.species, '224px', 'lazy')}
          </div>
          <div class="garage-card-info">
            <span class="garage-card-eyebrow">ISLEPILOT CLOUD</span>
            <div class="garage-card-name-row">
              <h4 class="garage-card-name">${species}</h4>
              <span class="garage-card-gender">${escapeGarageHtml(s.gender || '—')}</span>
            </div>
            <div class="garage-growth">
              <div class="garage-growth-label"><span>Tiến trình trưởng thành</span><strong>${growth}%</strong></div>
              <div class="garage-growth-track"><span style="width:${growth}%"></span></div>
            </div>
            <details class="garage-mutations">
              <summary>Đột biến gen <span>${mutations.length ? mutations.length + ' gen' : 'Thuần chủng'}</span></summary>
              <div class="garage-mutation-list">${mutHtml}</div>
            </details>
            <small class="garage-card-stored" title="${escapeGarageHtml(s.stored_at || 'Mới lưu')}">Lưu: ${escapeGarageHtml(s.stored_at || 'Mới lưu')}</small>
            <button class="btn btn-primary garage-restore-btn" data-id="${escapeGarageHtml(s.id)}" data-species="${species}" data-growth="${growth}"
              onclick="Garage.startRestoreChanneling(this.dataset.id, this.dataset.species, Number(this.dataset.growth))">
              Đưa Ra Đảo <span>RESTORE · 30S</span>
            </button>
          </div>
        </article>
      `;
    }).join('');
  },

  parkChannelingTimer: null,
  parkRemainingSeconds: 30,

  async parkActiveDino() {
    if (this.actionBusy) return;
    this.checkCooldown();
    if (this.cooldownSeconds > 0) {
      this.showActionAlert('⏳ Đang Trong Thời Gian Giãn Cách 30 Giây', `Vui lòng chờ thêm ${this.cooldownSeconds}s trước khi cất hoặc đổi khủng long!`, 'warning');
      App.showToast(`Vui lòng chờ hết thời gian đệm (${this.cooldownSeconds}s)!`, 'warn');
      return;
    }

    if (!this.activeDino) {
      App.showToast('Bạn hiện không có khủng long nào đang sống để cất!', 'error');
      return;
    }

    if (!confirm(`Xác nhận niêm phong cất [${this.activeDino.species}] vào Gara IslePilot?\n\n⚠️ QUY ĐỊNH BẮT BUỘC TỪ MÁY CHỦ:\n• Bạn PHẢI đứng yên hoàn toàn trong game trong suốt 30 giây tới!\n• Không di chuyển, không tấn công và không nhận sát thương.\n• Lệnh cất sẽ được gửi đi sau đúng 30 giây đếm ngược!`)) {
      return;
    }

    const sid = this.getActiveSteamId();
    this.actionBusy = true;
    const token = ++this.actionToken;
    this.hideActionAlert();

    // 1. Gửi tín hiệu chuẩn bị cất lên server
    try {
      const response = await this.prepareAction(ST25API.routes.playerGarageParkPrepare, { species: this.activeDino.species, steamId: sid }, sid);
      if (!response.ok) throw new Error('Không thể chuẩn bị cất khủng long. Vui lòng thử lại.');
    } catch (error) {
      if (token === this.actionToken) { this.actionBusy = false; App.showToast(error.message, 'error'); }
      return;
    }
    if (token !== this.actionToken) return;

    // 2. Mở Modal Đếm Ngược 30 Giây
    const modal = document.getElementById('park-channeling-modal');
    const nameEl = document.getElementById('park-modal-dino-name');
    const countEl = document.getElementById('park-countdown-big');
    const progressEl = document.getElementById('park-countdown-progress');

    updateGarageDinoIcon('park-modal-dino-icon', this.activeDino.species);
    if (nameEl) nameEl.textContent = `${this.activeDino.species} (${this.activeDino.growth}% Growth)`;
    if (countEl) countEl.textContent = '30s';
    if (progressEl) progressEl.style.width = '100%';
    if (modal) modal.style.display = 'flex';

    this.parkRemainingSeconds = 30;
    if (this.parkChannelingTimer) clearInterval(this.parkChannelingTimer);

    const deadline = Date.now() + 30000;
    this.parkChannelingTimer = setInterval(async () => {
      this.parkRemainingSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (countEl) countEl.textContent = `${this.parkRemainingSeconds}s`;
      if (progressEl) {
        const pct = Math.max(0, (this.parkRemainingSeconds / 30) * 100);
        progressEl.style.width = `${pct}%`;
      }

      if (this.parkRemainingSeconds <= 0) {
        clearInterval(this.parkChannelingTimer);
        this.parkChannelingTimer = null;
        if (countEl) countEl.textContent = '0s';
        await this.executeFinalPark();
      }
    }, 1000);
  },

  cancelParkChanneling() {
    if (this.parkSubmitting) return;
    this.actionToken++;
    this.prepareController?.abort();
    this.actionBusy = false;
    if (this.parkChannelingTimer) {
      clearInterval(this.parkChannelingTimer);
      this.parkChannelingTimer = null;
    }
    const modal = document.getElementById('park-channeling-modal');
    if (modal) modal.style.display = 'none';
    App.showToast('Đã hủy bỏ lệnh cất khủng long vào Gara.', 'info');
  },

  async executeFinalPark() {
    if (this.parkSubmitting) return;
    this.parkSubmitting = true;
    const modal = document.getElementById('park-channeling-modal');
    const sid = this.getActiveSteamId();

    try {
      App.showToast('Hết 30 giây! Đang gửi lệnh niêm phong vào Gara...', 'info');
      const res = await fetch(ST25API.routes.playerGaragePark, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(sid ? { 'x-steam-id': sid } : {}) },
        body: JSON.stringify({ steamId: sid })
      });
      const data = await res.json();
      if (modal) modal.style.display = 'none';

      if (res.ok && data.success) {
        App.showToast(data.message || 'Đã cất khủng long vào Gara thành công!', 'success');
        this.hideActionAlert();
        localStorage.setItem('the_isle_garage_cooldown', Date.now() + 30000);
        this.cooldownSeconds = 30;
        this.startCooldownTimer();
        await this.fetchGarageData();
        this.render();
      } else {
        const errMsg = data.error || 'Cất khủng long thất bại!';
        App.showToast(errMsg, 'error');
        this.showActionAlert('⚠️ Chưa Thể Cất Vào Gara Lúc Này', errMsg, 'error');
      }
    } catch (e) {
      if (modal) modal.style.display = 'none';
      App.showToast('Lỗi mạng khi cất khủng long!', 'error');
      this.showActionAlert('Lỗi Kết Nối', 'Không thể kết nối máy chủ ST25. Vui lòng kiểm tra lại đường truyền!', 'error');
    } finally {
      this.parkSubmitting = false;
      this.actionBusy = false;
    }
  },

  restoreChannelingTimer: null,
  restoreRemainingSeconds: 30,
  pendingRestoreDino: null,

  async startRestoreChanneling(garageDinoId, species, growth) {
    if (this.actionBusy) return;
    this.checkCooldown();
    if (this.cooldownSeconds > 0) {
      this.showActionAlert('⏳ Đang Trong Thời Gian Giãn Cách 30 Giây', `Vui lòng chờ thêm ${this.cooldownSeconds}s để bảo vệ an toàn dữ liệu nhân vật!`, 'warning');
      App.showToast(`Vui lòng chờ hết thời gian đệm (${this.cooldownSeconds}s) để bảo vệ dữ liệu!`, 'warn');
      return;
    }

    if (!confirm(`Xác nhận đưa [${species} ${growth}%] ra đảo?\n\n⚠️ LƯU Ý QUAN TRỌNG TỪ MÁY CHỦ:\n• Hệ thống sẽ phát cảnh báo đến toàn bộ người chơi trong phạm vi 500 mét!\n• Quá trình chuẩn bị xuất hiện tốn đúng 30 giây.\n• Bạn phải giữ an toàn trong 30 giây này để khủng long xuất hiện an toàn!`)) {
      return;
    }

    const sid = this.getActiveSteamId();
    this.actionBusy = true;
    const token = ++this.actionToken;
    this.pendingRestoreDino = { garageDinoId, species, growth, steamId: sid };
    this.hideActionAlert();

    // 1. Gửi tín hiệu chuẩn bị lên Server để phát cảnh báo 500m
    try {
      App.showToast(`Đang phát tín hiệu cảnh báo 500m cho [${species}]...`, 'info');
      const response = await this.prepareAction(ST25API.routes.playerGarageRestorePrepare, { garageDinoId, species, growth, steamId: sid }, sid);
      if (!response.ok) throw new Error('Không thể chuẩn bị đưa khủng long ra đảo. Vui lòng thử lại.');
    } catch (error) {
      if (token === this.actionToken) { this.actionBusy = false; this.pendingRestoreDino = null; App.showToast(error.message, 'error'); }
      return;
    }
    if (token !== this.actionToken) return;

    // 2. Mở Modal Đếm Ngược 30 Giây
    const modal = document.getElementById('restore-channeling-modal');
    const nameEl = document.getElementById('restore-modal-dino-name');
    const countEl = document.getElementById('restore-countdown-big');
    const progressEl = document.getElementById('restore-countdown-progress');

    updateGarageDinoIcon('restore-modal-dino-icon', species);
    if (nameEl) nameEl.textContent = `${species} (${growth}% Growth)`;
    if (countEl) countEl.textContent = '30s';
    if (progressEl) progressEl.style.width = '100%';
    if (modal) modal.style.display = 'flex';

    this.restoreRemainingSeconds = 30;
    if (this.restoreChannelingTimer) clearInterval(this.restoreChannelingTimer);

    const deadline = Date.now() + 30000;
    this.restoreChannelingTimer = setInterval(async () => {
      this.restoreRemainingSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (countEl) countEl.textContent = `${this.restoreRemainingSeconds}s`;
      if (progressEl) {
        const pct = Math.max(0, (this.restoreRemainingSeconds / 30) * 100);
        progressEl.style.width = `${pct}%`;
      }

      if (this.restoreRemainingSeconds <= 0) {
        clearInterval(this.restoreChannelingTimer);
        this.restoreChannelingTimer = null;
        if (countEl) countEl.textContent = '0s';
        await this.executeFinalRestore();
      }
    }, 1000);
  },

  cancelRestoreChanneling() {
    if (this.restoreSubmitting) return;
    this.actionToken++;
    this.prepareController?.abort();
    this.actionBusy = false;
    if (this.restoreChannelingTimer) {
      clearInterval(this.restoreChannelingTimer);
      this.restoreChannelingTimer = null;
    }
    this.pendingRestoreDino = null;
    const modal = document.getElementById('restore-channeling-modal');
    if (modal) modal.style.display = 'none';
    App.showToast('Đã hủy bỏ lệnh triệu hồi khủng long ra đảo.', 'info');
  },

  async executeFinalRestore() {
    if (this.restoreSubmitting) return;
    const d = this.pendingRestoreDino;
    const modal = document.getElementById('restore-channeling-modal');
    if (modal) modal.style.display = 'none';

    if (!d) return;
    this.restoreSubmitting = true;

    const sid = d.steamId || this.getActiveSteamId();
    App.showToast(`⏳ Hết 30 giây! Đang chính thức hồi phục [${escapeGarageHtml(d.species)}] vào game server...`, 'info');

    try {
      const res = await fetch(ST25API.routes.playerGarageRestore, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(sid ? { 'x-steam-id': sid } : {}) },
        body: JSON.stringify({ garageDinoId: d.garageDinoId, steamId: sid })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        App.showToast(`🎉 XUẤT HIỆN THÀNH CÔNG: [${escapeGarageHtml(d.species)} ${d.growth}%] đã ra đảo!`, 'success');
        this.hideActionAlert();
        localStorage.setItem('the_isle_garage_cooldown', Date.now() + 30000);
        this.cooldownSeconds = 30;
        this.startCooldownTimer();
        await this.fetchGarageData();
        this.render();
      } else {
        const errMsg = data.error || 'Hồi phục khủng long thất bại!';
        App.showToast(errMsg, 'error');
        this.showActionAlert('⚠️ Không Thể Đưa Khủng Long Ra Đảo', errMsg, 'error');
      }
    } catch (e) {
      App.showToast('Lỗi mạng khi hồi phục khủng long!', 'error');
      this.showActionAlert('Lỗi Kết Nối', 'Không thể kết nối máy chủ game sau 30s. Vui lòng kiểm tra lại!', 'error');
    } finally {
      this.pendingRestoreDino = null;
      this.restoreSubmitting = false;
      this.actionBusy = false;
    }
  },

  showActionAlert(title, message, type = 'error') {
    const el = document.getElementById('garage-action-alert');
    const titleEl = document.getElementById('garage-action-alert-title');
    const msgEl = document.getElementById('garage-action-alert-msg');
    const iconEl = document.getElementById('garage-action-alert-icon');
    if (!el || !titleEl || !msgEl) return;

    titleEl.textContent = title;
    msgEl.textContent = message;

    if (type === 'warning') {
      el.style.borderColor = '#f59e0b';
      el.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
      titleEl.style.color = '#fbbf24';
      msgEl.style.color = '#fef08a';
      if (iconEl) iconEl.textContent = '⏳';
    } else {
      el.style.borderColor = '#ef4444';
      el.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
      titleEl.style.color = '#f87171';
      msgEl.style.color = '#fca5a5';
      if (iconEl) iconEl.textContent = '⚠️';
    }

    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  hideActionAlert() {
    const el = document.getElementById('garage-action-alert');
    if (el) el.style.display = 'none';
  },

  async sellDino(garageDinoId, species, growth) {
    if (!confirm(`Xác nhận bán [${species} ${growth}%] vào hệ thống nhà phát hành IslePilot? Tiền Lúa 🌾 sẽ được cộng tự động vào ví của bạn.`)) {
      return;
    }

    const sid = this.getActiveSteamId();
    try {
      App.showToast(`Đang bán [${species}] vào hệ thống...`, 'info');
      const res = await fetch(ST25API.routes.playerGarageSell, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(sid ? { 'x-steam-id': sid } : {}) },
        body: JSON.stringify({ garageDinoId, steamId: sid })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        App.showToast(data.message, 'success');
        await this.fetchGarageData();
        this.render();
      } else {
        App.showToast(data.error || 'Bán khủng long thất bại!', 'error');
      }
    } catch (e) {
      App.showToast('Lỗi mạng khi bán khủng long!', 'error');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('garage-slots-grid')) {
    Garage.init();
  }
});
