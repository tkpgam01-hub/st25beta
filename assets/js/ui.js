// Shared presentation only: no network calls, account changes or live transactions.
(() => {
  const paths = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    home: '<path d="m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7"/>',
    map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
    dino: '<path d="M5 17c-4-1-3-5 0-6l3-2V5l4-2 5 2v5l-4 2 2 5m-7-2-2 6m8-4 4 4M9 9h1m7-1h4"/>',
    wallet: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 8h18m-5 4h5v4h-5v-4M6 5V3h12"/>',
    trade: '<path d="M3 7h18m-4-4 4 4-4 4M21 17H3m4-4-4 4 4 4"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13m0-13H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/>',
    skin: '<path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 1-4c-2-1-1-3 1-3h2c5-2 1-11-6-11Z"/><circle cx="7" cy="10" r=".7"/><circle cx="10" cy="7" r=".7"/><circle cx="15" cy="7" r=".7"/>',
    community: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m4 10v-3a6 6 0 0 0-3-5"/>',
    support: '<path d="M4 13v-2a8 8 0 0 1 16 0v2M4 11H2v7h4v-7Zm16 0h2v7h-4v-7Zm0 7c0 3-3 3-6 3"/>',
    trophy: '<path d="M8 3h8v7a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v5m-4 2h8"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6"/>',
    file: '<path d="M5 3h10l4 4v14H5V3Zm10 0v5h4M8 12h8m-8 4h8"/>',
    bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3Zm5 3h4"/>',
    login: '<path d="M13 3h7v18h-7M3 12h12m-4-4 4 4-4 4"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
    meat: '<path d="M8 5c5-5 14 3 10 8l-7 6c-3 3-8-1-7-4l4-10Z"/><path d="m7 10 6 5"/>',
    server: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6h.01M7 17h.01"/>'
  };
  function icon(name) { return `<svg class="st25-line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`; }
  const links = [['Trang chủ','home'],['Trang Chủ','home'],['Sinh Tồn','dino'],['Kinh Tế','wallet'],['Cộng Đồng','community'],['Bản Đồ','map'],['Bản đồ','map'],['Gara','dino'],['Thả Xác','meat'],['Skin','skin'],['Kho Lúa','wallet'],['Nhiệm Vụ','file'],['Giao Dịch','trade'],['Giao dịch','trade'],['Mở Hòm','gift'],['May Mắn','gift'],['Xếp Hạng','trophy'],['BXH','trophy'],['Mời Bạn','community'],['Hỗ Trợ','support'],['Nội Quy','file'],['Admin','shield'],['Quản Trị','shield'],['Cấp Role','shield']];
  function refresh(root = document) {
    for (const link of root.querySelectorAll('.nav-link, .nav-dropdown-item')) {
      if (link.querySelector('.st25-line-icon')) continue;
      const text = link.textContent.trim();
      const found = links.find(([label]) => text.includes(label));
      if (!found) continue;
      const clean = text.replace(/^[^\p{L}\p{N}]+/u, '').trim();
      link.textContent = '';
      link.insertAdjacentHTML('afterbegin', icon(found[1]));
      const label = document.createElement('span'); label.textContent = clean; link.appendChild(label);
    }
    for (const [selector, name] of [['.hud-pill-lua > span:first-child','wallet'],['.hud-pill-garage > span:first-child','dino'],['.hud-bell-btn > span:first-child','bell']]) {
      const element = root.querySelector(selector);
      if (element && !element.querySelector('svg')) element.innerHTML = icon(name);
    }
    const mobileNames = ['home','map','wallet','dino','menu'];
    root.querySelectorAll('.mobile-bottom-item .mob-icon').forEach((element,index) => {
      if (!element.querySelector('svg')) element.innerHTML = icon(mobileNames[index] || 'menu');
    });
  }
  function setServerStatus(config) {
    const dock = document.getElementById('st25-live-dock'); if (!dock) return;
    const count = `${config.online_players ?? 0} / ${config.max_players ?? 100}`;
    const label = config.online === false || config.status === 'offline' ? 'NGOẠI TUYẾN' : config.status === 'online' || config.online ? 'TRỰC TUYẾN' : 'MÁY CHỦ';
    dock.querySelector('[data-live-state]').textContent = label;
    dock.querySelector('[data-live-count]').textContent = count;
    dock.dataset.online = String(label === 'TRỰC TUYẾN');
    dock.title = `${config.name || 'ST25 VIETNAM'} · ${count} người chơi · Xem bản đồ`;
  }
  function init() {
    if (!document.body.classList.contains('st25-portal')) return;
    refresh();
    if (!document.getElementById('st25-live-dock')) {
      const dock = document.createElement('a'); dock.id = 'st25-live-dock'; dock.className = 'st25-live-dock'; dock.href = 'bando.html';
      dock.innerHTML = `<span class="live-dot" aria-hidden="true"></span><span data-live-state>ĐANG KẾT NỐI</span><span class="live-dock-divider"></span>${icon('community')}<strong data-live-count>— / —</strong><span class="live-dock-caption">người chơi trên đảo</span>${icon('map')}`;
      document.body.appendChild(dock);
    }
  }
  window.ST25UI = Object.freeze({icon, refresh, setServerStatus});
  document.addEventListener('DOMContentLoaded', init, {once:true});
})();
