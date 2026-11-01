// Account comes from App; fast vitals use a lightweight endpoint without garage reads.
const HomePlayer = {
  state: null,
  icons: { Troodon: '👁️', Deinosuchus: '🐊', Pteranodon: '🦅', Stegosaurus: '🛡️', Beipiaosaurus: '🦆' },
  init() {
    if (this.unsubscribe) return;
    this.body = document.getElementById('player-active-dino-body');
    this.badge = document.getElementById('dino-status-badge');
    if (!this.body) return;
    this.unsubscribe = App.subscribeUser((user, error) => this.render(user, error));
    document.addEventListener('visibilitychange', () => {
      clearTimeout(this.timer);
      this.timer = null;
      if (!document.hidden) this.scheduleVitals(0);
    });
    window.addEventListener('pagehide', () => { this.suspended = true; clearTimeout(this.timer); this.timer = null; });
    window.addEventListener('pageshow', () => { this.suspended = false; this.scheduleVitals(0); });
  },
  scheduleVitals(delay = 2000) {
    if (this.timer || this.inFlight || this.suspended || document.hidden || !this.user?.linked || !this.user.steam_id) return;
    this.timer = setTimeout(() => { this.timer = null; this.refreshVitals(); }, delay);
  },
  async refreshVitals() {
    if (this.inFlight || document.hidden || this.suspended || !this.user?.linked) return;
    const steamId = this.user.steam_id;
    this.inFlight = true;
    let delay = 2000;
    try {
      const data = await App.readJSON(ST25API.routes.playerVitals, { cache: 'no-store' });
      if (!document.hidden && !this.suspended && this.user?.steam_id === steamId && data.steam_id === steamId) {
        this.render({ ...this.user, dino: data.dino });
      }
    } catch (_) {
      delay = 5000;
      if (!document.hidden && this.user?.steam_id === steamId) this.setBadge('CHỜ ĐỒNG BỘ', 'rule-badge badge-warn');
    } finally {
      this.inFlight = false;
      this.scheduleVitals(delay);
    }
  },
  setText(node, value) {
    const text = String(value);
    if (node && node.textContent !== text) node.textContent = text;
  },
  percent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 0;
  },
  setBadge(text, className) {
    this.setText(this.badge, text);
    if (this.badge && this.badge.className !== className) this.badge.className = className;
  },
  render(user, error) {
    if (error) {
      this.setBadge('MẤT KẾT NỐI', 'rule-badge badge-warn');
      // Preserve the last good card during temporary network failures.
      if (this.state) return;
      this.state = 'error';
      this.body.innerHTML = '<div class="home-player-empty"><p>Không thể tải dữ liệu máy chủ.</p><button type="button" class="btn btn-secondary btn-sm" id="home-player-retry">Thử lại</button></div>';
      this.body.querySelector('#home-player-retry').addEventListener('click', () => App.checkAuth().then(() => App.renderPlayerHUD()));
      return;
    }
    this.user = user;
    if (!user?.linked) { clearTimeout(this.timer); this.timer = null; }
    else this.scheduleVitals();
    const linked = !!(user?.linked && user.steam_id);
    const dino = user?.dino;
    const active = linked && dino?.species && !['Chưa xác định', 'Chưa chọn'].includes(dino.species);
    const state = !linked ? 'anonymous' : active ? 'active' : 'unspawned';
    this.setBadge(active ? '● ONLINE' : linked ? 'CHƯA SPAWN' : 'CHƯA LIÊN KẾT', 'rule-badge ' + (active ? 'badge-allow' : 'badge-warn'));
    if (this.state !== state) {
      this.state = state;
      if (!active) {
        this.body.innerHTML = linked
          ? '<div class="home-player-empty"><span aria-hidden="true">🦖</span><h4>Chưa có khủng long trong game</h4><p>Vào game tạo nhân vật hoặc lấy khủng long từ gara.</p><a href="gara.html" class="btn btn-primary btn-sm">Vào Gara Lấy Dino</a></div>'
          : '<div class="home-player-empty"><span aria-hidden="true">🎮</span><h4>Chưa liên kết Steam</h4><p>Đăng nhập để xem khủng long và các chỉ số sinh tồn.</p><a href="' + ST25API.routes.playerSteamLogin + '?redirect=/index.html" class="btn btn-primary btn-sm">Đăng Nhập Steam</a></div>';
        return;
      }
      this.body.innerHTML = `<div class="home-dino-summary"><span data-home="icon" class="home-dino-icon" aria-hidden="true"></span><div class="home-dino-description"><h4 data-home="species"></h4><div data-home="gender"></div><div data-home="stage"></div><span data-home="prime" hidden>⭐ PRIME</span></div><div class="home-dino-growth"><span>Tăng trưởng</span><strong data-home="growth"></strong></div></div>
        <div class="home-dino-vitals">${[['health','❤️ Máu (Health)'],['hunger','🍖 Đói (Hunger)'],['thirst','💧 Khát (Thirst)']].map(([key,label]) => `<div class="home-vital home-vital-${key}"><div class="home-vital-label"><span>${label}</span><strong data-home="${key}"></strong></div><div class="stat-bar-track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" data-home="${key}Track"><div class="stat-bar-fill" data-home="${key}Fill"></div></div></div>`).join('')}</div>
        <div class="home-dino-actions"><a href="bando.html" class="btn btn-secondary btn-sm">📍 Tọa độ: <strong data-home="grid"></strong></a><a href="gara.html" class="btn btn-primary btn-sm">📥 Cất Vào Gara</a></div>`;
      this.nodes = {};
      this.body.querySelectorAll('[data-home]').forEach(node => { this.nodes[node.dataset.home] = node; });
    }
    if (!active) return;
    const n = this.nodes;
    const growth = this.percent(dino.growth);
    this.setText(n.icon, this.icons[dino.species] || '🦖');
    this.setText(n.species, dino.species);
    this.setText(n.gender, dino.gender || 'Chưa rõ giới tính');
    this.setText(n.stage, growth < 35 ? 'Con non (Juv)' : growth < 75 ? 'Thiếu niên (Sub)' : 'Trưởng thành (Adult)');
    this.setText(n.growth, `${growth}%`);
    this.setText(n.grid, dino.grid || '—');
    n.prime.hidden = !dino.isPrimeElder;
    for (const key of ['health', 'hunger', 'thirst']) {
      const value = this.percent(dino[key]);
      this.setText(n[key], `${value}%`);
      const transform = `scaleX(${value / 100})`;
      if (n[key + 'Fill'].style.transform !== transform) n[key + 'Fill'].style.transform = transform;
      if (n[key + 'Track'].getAttribute('aria-valuenow') !== String(value)) n[key + 'Track'].setAttribute('aria-valuenow', value);
    }
  }
};
document.addEventListener('DOMContentLoaded', () => HomePlayer.init());
