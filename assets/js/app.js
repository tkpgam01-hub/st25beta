// Core App Script — Server ST25 Vietnam The Isle Portal
const App = {
  user: null,
  config: null,
  notifications: [],
  pollingTimer: null,
  nextWeatherUpdate: 0,
  readRequests: new Map(),
  responseRequests: new Map(),
  userListeners: new Set(),

  subscribeUser(listener) {
    this.userListeners.add(listener);
    if (this.authResolved) listener(this.user, this.authError);
    return () => this.userListeners.delete(listener);
  },

  publishUser(error = null) {
    this.authError = error;
    for (const listener of this.userListeners) {
      try { listener(this.user, error); } catch (err) { console.error('Player widget update failed:', err); }
    }
  },

  // Coalesce identical reads and bound their lifetime; mutations are never retried here.
  readResponse(url, options = {}) {
    if (options.method && options.method.toUpperCase() !== 'GET') throw new Error('readResponse only accepts GET');
    const key = url + JSON.stringify(options);
    let request = this.responseRequests.get(key);
    if (!request) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ST25Core.readTimeoutMs);
      request = fetch(url, { ...options, signal: controller.signal }).then(async response => {
        // Buffer once so every caller can consume its own body, including HTTP errors.
        const body = await response.arrayBuffer();
        return new Response([204,205,304].includes(response.status) ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
      }).finally(() => { clearTimeout(timeout); this.responseRequests.delete(key); });
      this.responseRequests.set(key, request);
    }
    return request.then(response => response.clone());
  },

  readJSON(url, options = {}) {
    const key = url + JSON.stringify(options);
    if (this.readRequests.has(key)) return this.readRequests.get(key);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ST25Core.readTimeoutMs);
    const request = fetch(url, { ...options, signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }
        return response.json();
      }).finally(() => {
        clearTimeout(timeout);
        this.readRequests.delete(key);
      });
    this.readRequests.set(key, request);
    return request;
  },

  escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  },

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    this.bindEvents();
    // Navigation must not wait for three sequential network round trips.
    this.renderEnhancedNav();
    this.renderPlayerHUD();
    this.renderMobileNavigation();
    window.ST25UI?.refresh();
    this.renderWeatherWidget({ displayBadge: 'Đang cập nhật thời tiết…', weatherIcon: '🌤️' });
    // Publish account data as soon as it arrives; unrelated APIs must not hold the HUD.
    const authReady = this.checkAuth().then(() => {
      this.renderEnhancedNav();
      this.renderPlayerHUD();
      this.updateUI();
    });
    await Promise.allSettled([this.loadConfig(), this.loadEnvironment(), authReady]);
    this.renderEnhancedNav();
    this.renderPlayerHUD();
    this.updateUI();
    this.nextWeatherUpdate = Date.now() + 30000;
    this.schedulePolling();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(this.pollingTimer);
      else this.schedulePolling(0);
    });
    window.addEventListener('pagehide', () => clearTimeout(this.pollingTimer));
    window.addEventListener('pageshow', e => { if (e.persisted) this.schedulePolling(0); });
  },

  schedulePolling(delay = 15000) {
    clearTimeout(this.pollingTimer);
    if (document.hidden) return;
    this.pollingTimer = setTimeout(async () => {
      if (document.hidden) return;
      const tasks = [this.checkAuthSilently()];
      if (Date.now() >= this.nextWeatherUpdate) {
        this.nextWeatherUpdate = Date.now() + 30000;
        tasks.push(this.loadEnvironment());
        tasks.push(this.loadConfig());
      }
      await Promise.allSettled(tasks);
      this.schedulePolling();
    }, delay);
  },

  async loadEnvironment() {
    try {
      this.renderWeatherWidget(await this.readJSON(ST25API.routes.serverEnvironment));
    } catch (e) {
      // offline fallback
    }
  },

  renderWeatherWidget(env) {
    if (!env) return;
    const signature = JSON.stringify([env.phase, env.weatherIcon, env.displayBadge, env.phaseDesc, env.weatherDesc, env.temperature]);
    if (signature === this.weatherSignature) return;

    let headerPill = document.getElementById('live-weather-header-pill');
    if (!headerPill) {
      const headerContainer = document.querySelector('.site-header .nav-wrap') || document.querySelector('.site-header .header-container') || document.querySelector('.site-header .container');
      if (headerContainer) {
        headerPill = document.createElement('div');
        headerPill.id = 'live-weather-header-pill';
        headerPill.className = 'header-weather';
        headerPill.style.display = 'inline-flex';
        headerPill.style.alignItems = 'center';
        headerPill.style.gap = '6px';
        headerPill.style.fontSize = '0.8rem';
        headerPill.style.fontWeight = '700';
        headerPill.style.padding = '5px 10px';
        headerPill.style.borderRadius = '20px';
        headerPill.style.background = 'rgba(15, 23, 42, 0.85)';
        headerPill.style.border = '1px solid rgba(251, 191, 36, 0.35)';
        headerPill.style.color = '#e2e8f0';
        headerPill.style.cursor = 'default';
        headerPill.style.whiteSpace = 'nowrap';
        headerPill.title = `Chu kỳ game: ${env.phaseDesc}. Thời tiết: ${env.weatherDesc} (${env.temperature}°C)`;

        const navActions = headerContainer.querySelector('.nav-actions');
        if (navActions) {
          headerContainer.insertBefore(headerPill, navActions);
        } else {
          headerContainer.appendChild(headerPill);
        }
      }
    }

    if (headerPill) {
      this.weatherSignature = signature;
      const isNight = env.isDay === false || env.phase === 'NIGHT';
      headerPill.style.borderColor = isNight ? 'rgba(168, 85, 247, 0.4)' : 'rgba(251, 191, 36, 0.4)';
      headerPill.title = env.displayBadge || 'Đang cập nhật thời tiết';
      if (!headerPill.firstElementChild) {
        headerPill.innerHTML = '<span class="header-weather-icon" aria-hidden="true"></span><span class="header-weather-label"></span>';
      }
      const icon = headerPill.querySelector('.header-weather-icon');
      const label = headerPill.querySelector('.header-weather-label');
      const iconText = env.weatherIcon || '☀️';
      // The API badge already includes its icon.
      const labelText = String(env.displayBadge || '').replace(/^\s*\S+\s+(?=Ban )/, '');
      if (icon.textContent !== iconText) icon.textContent = iconText;
      if (label.textContent !== labelText) label.textContent = labelText;
    }
  },

  async loadConfig() {
    try {
      this.config = await this.readJSON(ST25API.routes.serverStatus);
      this.updateServerStatusBadge();
    } catch (e) {
      console.warn('API offline, running in standalone mode');
    }
  },

  async checkAuth() {
    let error = null;
    try {
      const u = await this.readJSON(ST25API.routes.playerMe);
        if (u && u.linked && u.steam_id) {
          this.user = u;
          this.notifications = Array.isArray(u.notifications) ? u.notifications : [];
          try { localStorage.setItem('st25_steam_user', JSON.stringify({
            steam_id: u.steam_id,
            persona_name: u.persona_name,
            avatar: u.avatar,
            linked: true,
            isAdmin: !!u.isAdmin
          })); } catch (_) { /* Cookie authentication remains valid without local storage. */ }
        } else {
          this.user = null;
          this.notifications = [];
          try {
            localStorage.removeItem('st25_steam_user');
            localStorage.removeItem('the_isle_demo_user');
          } catch (_) {}
        }
    } catch (e) {
      this.user = null;
      error = e;
    }
    this.authResolved = true;
    this.publishUser(error);
  },

  async checkAuthSilently() {
    try {
      const u = await this.readJSON(ST25API.routes.playerMe);
      const wasAdmin = !!this.user?.isAdmin;
      this.user = u && u.linked && u.steam_id ? u : null;
      this.authResolved = true;
      this.notifications = Array.isArray(this.user?.notifications) ? this.user.notifications : [];
      this.publishUser();
      this.renderPlayerHUD();
      if (wasAdmin !== !!this.user?.isAdmin) {
        this.renderEnhancedNav();
        this.updateUI();
      }
    } catch (_) {}
  },

  updateServerStatusBadge() {
    if (this.config) window.ST25UI?.setServerStatus(this.config);
    const el = document.getElementById('server-player-count');
    if (el && this.config) {
      const text = `${this.config.online_players ?? 0} / ${this.config.max_players ?? 100} người chơi`;
      if (el.textContent !== text) el.textContent = text;
    }
  },

  // ==========================================
  // ITEM 1: CATEGORIZED DROPDOWN NAVIGATION
  // ==========================================
  renderEnhancedNav() {
    const navUl = document.querySelector('.nav-links');
    if (!navUl) return;

    const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const isAdmin = !!(this.user && this.user.isAdmin);
    const navSignature = currentFile + ':' + isAdmin;
    if (this.navSignature === navSignature) return;
    this.navSignature = navSignature;

    const isSurvivalActive = ['bando.html', 'gara.html', 'tha-xac.html', 'skin.html'].includes(currentFile);
    const isEconomyActive = ['nhiem-vu.html', 'giao-dich.html', 'plinko.html', 'vong-quay.html'].includes(currentFile);
    const isCommunityActive = ['bxh.html', 'moi-ban.html', 'ho-tro.html', 'noi-quy.html', 'cai-dat.html'].includes(currentFile);

    navUl.innerHTML = `
      <li>
        <a href="index.html" class="nav-link ${currentFile === 'index.html' ? 'active' : ''}">
          🌾 Trang chủ
        </a>
      </li>

      <!-- NHÓM 1: SINH TỒN -->
      <li class="nav-dropdown">
        <a href="javascript:void(0)" class="nav-link nav-dropdown-toggle ${isSurvivalActive ? 'active' : ''}">
          🏕️ Sinh Tồn
        </a>
        <div class="nav-dropdown-menu">
          <a href="bando.html" class="nav-dropdown-item ${currentFile === 'bando.html' ? 'active' : ''}">
            🗺️ Bản Đồ Gateway
          </a>
          <a href="gara.html" class="nav-dropdown-item ${currentFile === 'gara.html' ? 'active' : ''}">
            🦖 Gara Khủng Long
          </a>
          <a href="tha-xac.html" class="nav-dropdown-item ${currentFile === 'tha-xac.html' ? 'active' : ''}">
            🥩 Thả Xác Cứu Đói
          </a>
          <a href="skin.html" class="nav-dropdown-item ${currentFile === 'skin.html' ? 'active' : ''}">
            🎨 Chỉnh Sửa Skin
          </a>
        </div>
      </li>

      <!-- NHÓM 2: KINH TẾ & CHỢ -->
      <li class="nav-dropdown">
        <a href="javascript:void(0)" class="nav-link nav-dropdown-toggle ${isEconomyActive ? 'active' : ''}">
          🌾 Kinh Tế & Chợ
        </a>
        <div class="nav-dropdown-menu">
          <a href="nhiem-vu.html" class="nav-dropdown-item ${currentFile === 'nhiem-vu.html' ? 'active' : ''}">
            🌾 Kho Lúa & Nhiệm Vụ
          </a>
          <a href="giao-dich.html" class="nav-dropdown-item ${currentFile === 'giao-dich.html' ? 'active' : ''}">
            ⚖️ Chợ Giao Dịch P2P
          </a>
          <a href="plinko.html" class="nav-dropdown-item ${currentFile === 'plinko.html' ? 'active' : ''}">✦ Plinko ST25</a>
          <a href="vong-quay.html" class="nav-dropdown-item ${currentFile === 'vong-quay.html' ? 'active' : ''}">🎰 Vòng Quay Roulette</a>
        </div>
      </li>

      <!-- NHÓM 3: CỘNG ĐỒNG & HỖ TRỢ -->
      <li class="nav-dropdown">
        <a href="javascript:void(0)" class="nav-link nav-dropdown-toggle ${isCommunityActive ? 'active' : ''}">
          🛡️ Cộng Đồng
        </a>
        <div class="nav-dropdown-menu">
          <a href="bxh.html" class="nav-dropdown-item ${currentFile === 'bxh.html' ? 'active' : ''}">
            🏆 Bảng Xếp Hạng
          </a>
          <a href="moi-ban.html" class="nav-dropdown-item ${currentFile === 'moi-ban.html' ? 'active' : ''}">
            👥 Mời Bạn Nhận Lúa
          </a>
          <a href="ho-tro.html" class="nav-dropdown-item ${currentFile === 'ho-tro.html' ? 'active' : ''}">
            🆘 Hỗ Trợ & Ticket
          </a>
          <a href="noi-quy.html" class="nav-dropdown-item ${currentFile === 'noi-quy.html' ? 'active' : ''}">
            📜 13 Điều Nội Quy
          </a>
          <a href="cai-dat.html" class="nav-dropdown-item admin-only ${currentFile === 'cai-dat.html' ? 'active' : ''}" style="${isAdmin ? '' : 'display: none;'}">
            👑 Cấp Role & Slot (Admin)
          </a>
        </div>
      </li>
    `;
    window.ST25UI?.refresh(navUl);
    window.ST25Motion?.refresh(navUl);
  },

  // ==========================================
  // ITEM 1: PERSISTENT PLAYER HUD BAR
  // ==========================================
  renderPlayerHUD() {
    const navActions = document.querySelector('.nav-actions');
    if (!navActions) return;

    const isLoggedIn = !!(this.user && this.user.linked && this.user.steam_id);
    if (!Array.isArray(this.notifications)) this.notifications = [];

    if (!isLoggedIn) {
      if (!this.authResolved) {
        if (this.hudIdentity === 'pending') return;
        this.hudIdentity = 'pending';
        navActions.innerHTML = '<div class="header-account-pending" role="status">Đang tải tài khoản…</div>';
        return;
      }
      if (this.hudIdentity === 'anonymous') return;
      this.hudIdentity = 'anonymous';
      navActions.innerHTML = `
        <a href="lien-ket-steam.html" class="btn btn-secondary btn-sm" id="btn-steam-auth">
          ${window.ST25UI?.icon('login') || '🎮'} Đăng Nhập Steam
        </a>
        <a href="tai-hud.html" class="btn btn-hud btn-sm" style="display: none;">Tải IsleLiveMap</a>
        <a href="https://discord.gg/3xCrA6VyY" target="_blank" class="btn btn-primary btn-sm">Discord ST25</a>
      `;
      window.ST25UI?.refresh(navActions);
      return;
    }

    const u = this.user;
    const balance = Number(u.balance ?? u.lua ?? u.coins ?? 0) || 0;
    const totalParked = u.totalParked ?? 0;
    const maxSlots = u.maxSlots ?? 3;
    const unreadCount = (this.notifications || []).length;
    const isAdmin = !!u.isAdmin;
    const avatar = u.avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';
    const roleClass = isAdmin ? 'role-admin' : (String(u.roleKey || '').includes('vip') ? 'role-vip' : '');
    const identity = JSON.stringify([u.steam_id, u.persona_name, avatar, u.role, roleClass, isAdmin]);
    const notificationsSignature = JSON.stringify(this.notifications);
    const notificationMarkup = `
      <div style="display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #ffffff19;padding-bottom:8px">
        <strong style="color:#fbbf24;font-size:.9rem">🔔 Thông Báo (${unreadCount})</strong>
        <a href="giao-dich.html" style="font-size:.78rem">Xem phòng Trade</a>
      </div>
      <div style="max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:8px">
        ${this.notifications.length ? this.notifications.map(n => `<a href="${this.escapeHTML(n.link || 'giao-dich.html')}" style="padding:10px;background:#0004;border-radius:8px"><strong>${this.escapeHTML(n.title)}</strong><div>${this.escapeHTML(n.desc)}</div><small>${this.escapeHTML(n.time)}</small></a>`).join('') : '<div style="padding:20px;color:#94a3b8;text-align:center">Không có thông báo mới nào.</div>'}
      </div>`;
    if (this.hudIdentity === identity && navActions.querySelector('.player-hud-bar')) {
      const balanceEl = navActions.querySelector('.lua-val');
      const capacityEl = navActions.querySelector('.garage-val');
      const badge = navActions.querySelector('.hud-bell-badge');
      const balanceText = balance.toLocaleString() + ' Lúa';
      const capacityText = `${totalParked}/${maxSlots}`;
      if (balanceEl && balanceEl.textContent !== balanceText) balanceEl.textContent = balanceText;
      if (capacityEl && capacityEl.textContent !== capacityText) capacityEl.textContent = capacityText;
      if (badge) {
        if (badge.textContent !== String(unreadCount)) badge.textContent = unreadCount;
        if (badge.hidden !== (unreadCount === 0)) badge.hidden = unreadCount === 0;
      }
      if (this.notificationsSignature !== notificationsSignature) {
        const popover = document.getElementById('hud-notification-popover');
        if (popover) popover.innerHTML = notificationMarkup;
      }
      this.notificationsSignature = notificationsSignature;
      return;
    }
    this.hudIdentity = identity;
    this.notificationsSignature = notificationsSignature;

    navActions.innerHTML = `
      <div class="player-hud-bar">
        <!-- Lúa Counter Pill -->
        <a href="nhiem-vu.html" class="hud-pill hud-pill-lua" title="Số Lúa của bạn (Bấm để mở Kho Lúa)">
          <span>🌾</span>
          <span class="lua-val">${balance.toLocaleString()} Lúa</span>
        </a>

        <!-- Garage Capacity Pill -->
        <a href="gara.html" class="hud-pill hud-pill-garage" title="Sức chứa Gara (Bấm để quản lý khủng long)">
          <span>🦖</span>
          <span class="garage-val">${totalParked}/${maxSlots}</span>
        </a>

        <!-- Notification Bell -->
        <div style="position: relative;">
          <button type="button" class="hud-bell-btn" onclick="App.toggleNotificationPopover(event)" title="Thông báo hệ thống">
            <span>🔔</span>
            <span class="hud-bell-badge" ${unreadCount ? '' : 'hidden'}>${unreadCount}</span>
          </button>

          <!-- Notification Popover -->
          <div id="hud-notification-popover" class="hud-popover">
            ${notificationMarkup}
          </div>
        </div>

        <!-- User Profile Pill -->
        <div style="position: relative;">
          <div class="hud-profile-pill" onclick="App.toggleProfilePopover(event)">
            <img src="${avatar}" class="hud-avatar ${roleClass}" alt="Steam Avatar">
            <span class="hud-username">${u.persona_name || 'Người chơi'}</span>
            <span style="font-size: 0.7rem; color: #94a3b8;">▾</span>
          </div>

          <!-- Profile Popover -->
          <div id="hud-profile-popover" class="hud-popover" style="width: 250px;">
            <div style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
              <img src="${avatar}" style="width: 50px; height: 50px; border-radius: 50%; border: 2px solid #fbbf24; margin-bottom: 6px;" alt="Avatar">
              <div style="font-weight: 800; color: #fff; font-size: 0.95rem;">${u.persona_name}</div>
              <div style="font-size: 0.75rem; color: #94a3b8; font-family: monospace;">${u.steam_id}</div>
              <div style="margin-top: 4px;"><span class="rule-badge badge-allow" style="font-size: 0.72rem;">${u.role || 'Thành viên'}</span></div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; padding-top: 4px;">
              <a href="lien-ket-steam.html" class="nav-dropdown-item">🔄 Đổi Tài Khoản Steam</a>
              ${isAdmin ? '<a href="cai-dat.html" class="nav-dropdown-item" style="color: #fbbf24;">👑 Bảng Quản Trị Admin</a>' : ''}
              <a href="javascript:void(0)" onclick="App.logoutUser()" class="nav-dropdown-item" style="color: #ef4444;">🚪 Đăng Xuất</a>
            </div>
          </div>
        </div>
      </div>
    `;

    window.ST25UI?.refresh(navActions);
    window.ST25Motion?.refresh(navActions);
  },

  toggleNotificationPopover(e) {
    e.stopPropagation();
    const notifPopover = document.getElementById('hud-notification-popover');
    const profilePopover = document.getElementById('hud-profile-popover');
    if (profilePopover) profilePopover.classList.remove('open');
    if (notifPopover) notifPopover.classList.toggle('open');
  },

  toggleProfilePopover(e) {
    e.stopPropagation();
    const profilePopover = document.getElementById('hud-profile-popover');
    const notifPopover = document.getElementById('hud-notification-popover');
    if (notifPopover) notifPopover.classList.remove('open');
    if (profilePopover) profilePopover.classList.toggle('open');
  },

  // ==========================================
  // ITEM 1: MOBILE BOTTOM NAVIGATION & DRAWER
  // ==========================================
  renderMobileNavigation() {
    if (document.getElementById('mobile-bottom-nav-bar')) return;

    const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

    // 1. Bottom Bar
    const bottomNav = document.createElement('nav');
    bottomNav.id = 'mobile-bottom-nav-bar';
    bottomNav.className = 'mobile-bottom-nav';
    bottomNav.innerHTML = `
      <a href="index.html" class="mobile-bottom-item ${currentFile === 'index.html' ? 'active' : ''}">
        <span class="mob-icon">🏠</span>
        <span>Trang Chủ</span>
      </a>
      <a href="bando.html" class="mobile-bottom-item ${currentFile === 'bando.html' ? 'active' : ''}">
        <span class="mob-icon">🗺️</span>
        <span>Bản Đồ</span>
      </a>
      <a href="nhiem-vu.html" class="mobile-bottom-item ${currentFile === 'nhiem-vu.html' ? 'active' : ''}">
        <span class="mob-icon">🌾</span>
        <span>Kho Lúa</span>
      </a>
      <a href="gara.html" class="mobile-bottom-item ${currentFile === 'gara.html' ? 'active' : ''}">
        <span class="mob-icon">🦖</span>
        <span>Gara</span>
      </a>
      <a href="javascript:void(0)" class="mobile-bottom-item" onclick="App.toggleMobileDrawer()">
        <span class="mob-icon">☰</span>
        <span>Thêm</span>
      </a>
    `;
    document.body.appendChild(bottomNav);

    // 2. Slide Drawer Overlay
    const overlay = document.createElement('div');
    overlay.id = 'mobile-drawer-overlay';
    overlay.className = 'mobile-drawer-overlay';
    overlay.onclick = () => App.toggleMobileDrawer();

    const drawer = document.createElement('div');
    drawer.id = 'mobile-drawer-content';
    drawer.className = 'mobile-drawer-content';
    drawer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px;">
        <span style="font-weight: 800; color: #fbbf24; font-size: 1.1rem;">🌾 MENU TỔNG HỢP ST25</span>
        <button type="button" onclick="App.toggleMobileDrawer()" style="background: none; border: none; color: #cbd5e1; font-size: 1.5rem; cursor: pointer;">&times;</button>
      </div>

      <div>
        <div style="font-size: 0.78rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">🏕️ Sinh Tồn</div>
        <a href="bando.html" class="nav-dropdown-item">🗺️ Bản Đồ Gateway</a>
        <a href="gara.html" class="nav-dropdown-item">🦖 Gara Khủng Long</a>
        <a href="tha-xac.html" class="nav-dropdown-item">🥩 Thả Xác Cứu Đói</a>
        <a href="skin.html" class="nav-dropdown-item">🎨 Chỉnh Sửa Skin</a>
      </div>

      <div>
        <div style="font-size: 0.78rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">🌾 Kinh Tế & Chợ</div>
        <a href="nhiem-vu.html" class="nav-dropdown-item">🌾 Kho Lúa & Nhiệm Vụ</a>
        <a href="giao-dich.html" class="nav-dropdown-item">⚖️ Chợ Giao Dịch P2P</a>
        <a href="plinko.html" class="nav-dropdown-item">✦ Plinko ST25</a>
        <a href="vong-quay.html" class="nav-dropdown-item">🎰 Vòng Quay CS2</a>
        
      </div>

      <div>
        <div style="font-size: 0.78rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">🛡️ Cộng Đồng</div>
        <a href="bxh.html" class="nav-dropdown-item">🏆 Bảng Xếp Hạng</a>
        <a href="moi-ban.html" class="nav-dropdown-item">👥 Mời Bạn Bè</a>
        <a href="ho-tro.html" class="nav-dropdown-item">🆘 Hỗ Trợ & Ticket</a>
        <a href="noi-quy.html" class="nav-dropdown-item">📜 13 Điều Nội Quy</a>
        <a href="cai-dat.html" class="nav-dropdown-item admin-only" style="${this.user && this.user.isAdmin ? '' : 'display: none;'}">👑 Quản Trị Admin</a>
      </div>

      <div style="margin-top: auto; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
        <a href="https://discord.gg/3xCrA6VyY" target="_blank" class="btn btn-primary" style="width: 100%; text-align: center;">Discord ST25</a>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
  },

  toggleMobileDrawer() {
    const overlay = document.getElementById('mobile-drawer-overlay');
    const drawer = document.getElementById('mobile-drawer-content');
    if (overlay && drawer) {
      overlay.classList.toggle('open');
      drawer.classList.toggle('open');
    }
  },

  // ==========================================
  // ITEM 3: 3D PERSPECTIVE TILT FOR TCG DINO CARDS
  // ==========================================
  // Card lift and dinosaur glow are handled by CSS; no pointer tracking is needed.

  updateUI() {
    const isLoggedIn = !!(this.user && this.user.linked && this.user.steam_id);
    const isAdmin = !!(isLoggedIn && this.user.isAdmin);

    // Ẩn/hiện các phần tử Admin trên toàn bộ website
    document.querySelectorAll('.admin-only, #nav-admin-link-item, #btn-header-admin, #btn-admin-panel-link, #admin-quick-bar').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });
  },

  loginDemoUser() {
    this.user = {
      steam_id: '76561198000000001',
      persona_name: 'DinoHunter_VN',
      avatar: 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
      role: 'Player'
    };
    localStorage.setItem('the_isle_demo_user', JSON.stringify(this.user));
    this.updateUI();
    this.showToast('Đăng nhập Steam thành công (Demo Mode)!', 'success');
    window.location.reload();
  },

  logoutUser() {
    this.user = null;
    localStorage.removeItem('the_isle_demo_user');
    localStorage.removeItem('st25_steam_user');
    fetch(ST25API.routes.playerLogout, { method: 'POST' }).catch(() => {});
    this.updateUI();
    this.showToast('Đã đăng xuất tài khoản.', 'info');
    setTimeout(() => window.location.reload(), 500);
  },

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <div>${this.escapeHTML(message)}</div>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  bindEvents() {
    if (this.eventsBound) return;
    this.eventsBound = true;
    document.addEventListener('click', e => {
      const target = e.target instanceof Element ? e.target : e.target.parentElement;
      if (!target) return;
      for (const [id, trigger] of [['hud-notification-popover', '.hud-bell-btn'], ['hud-profile-popover', '.hud-profile-pill']]) {
        if (!target.closest(trigger) && !target.closest('#' + id)) document.getElementById(id)?.classList.remove('open');
      }
      const toggle = target.closest('.nav-dropdown-toggle');
      const dropdown = toggle?.closest('.nav-dropdown');
      document.querySelectorAll('.nav-dropdown.open').forEach(el => { if (el !== dropdown) el.classList.remove('open'); });
      if (dropdown) {
        e.preventDefault();
        dropdown.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(dropdown.classList.contains('open')));
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.nav-dropdown.open').forEach(el => {
          el.classList.remove('open');
          el.querySelector('.nav-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
        });
        document.querySelectorAll('.hud-popover.open').forEach(el => el.classList.remove('open'));
      }
    });
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.logoutUser();
      });
    }

    const demoLoginBtn = document.getElementById('btn-demo-login');
    if (demoLoginBtn) {
      demoLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.loginDemoUser();
      });
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
