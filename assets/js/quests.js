const QuestBoard = {
  tab: 'daily',
  data: null,
  icons: {
    combat: '<path d="m4 3 7 7-3 3-7-7V3h3Zm9 10 6 6m-4 1 5-5M20 3l-7 7m-3 3-6 6m0-4 5 5"/>',
    time: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
    award: '<circle cx="12" cy="8" r="5"/><path d="m9 13-1 8 4-3 4 3-1-8"/>',
    event: '<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>'
  },
  icon(type) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${this.icons[type] || this.icons.award}</svg>`; },
  escape(value) { return App.escapeHTML(value); },
  init() {
    const tabs = document.getElementById('quest-tabs');
    tabs.addEventListener('click', event => {
      const button = event.target.closest('[data-quest-tab]');
      if (!button) return;
      this.tab = button.dataset.questTab;
      this.render(this.data || {});
    });
    tabs.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...tabs.querySelectorAll('[data-quest-tab]')].filter(button => !button.hidden);
      const current = buttons.indexOf(event.target);
      if (current < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].click(); buttons[next].focus();
    });
    document.getElementById('server-quests-grid').addEventListener('click', event => {
      const button = event.target.closest('[data-claim-quest]');
      if (!button || button.disabled) return;
      const quest = this.data?.serverQuests?.find(q => String(q.id) === button.dataset.claimQuest);
      if (!quest) return;
      button.disabled = true;
      Promise.resolve(claimSingleQuest(quest.id, quest.claimKey, quest.name, quest.rewardAmount)).finally(() => { if (button.isConnected) button.disabled = false; });
    });
  },
  progress(q) {
    const config = q.config || {};
    const target = Number(config.km ?? config.minutes ?? config.days ?? config.count ?? config.growthPct ?? 1);
    const raw = Number(q.progress ?? 0);
    const current = Number.isFinite(raw) ? Math.max(0, config.km ? raw / 1000 : raw) : 0;
    const done = !!(q.completed || q.claimed);
    const percent = done ? 100 : Math.max(0, Math.min(100, target > 0 ? current / target * 100 : 0));
    const unit = config.km ? ' km' : config.minutes ? ' phút' : config.days ? ' ngày' : config.growthPct ? '%' : '';
    return { current, target, percent, done, label: `${current.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}/${target.toLocaleString('vi-VN')}${unit}` };
  },
  render(data) {
    this.data = data;
    const quests = data.serverQuests || [];
    const counts = {daily:0, weekly:0, monthly:0, achievements:(data.primeQuests || []).length, events:(data.events || []).length};
    for (const q of quests) counts[q.period in counts ? q.period : 'daily']++;
    document.querySelectorAll('[data-quest-tab]').forEach(button => {
      const key = button.dataset.questTab;
      button.querySelector('span').textContent = counts[key] || 0;
      button.hidden = key === 'monthly' && !counts.monthly;
      button.setAttribute('aria-selected', String(key === this.tab));
      button.setAttribute('data-live', String(key === 'events' && counts.events > 0));
      button.tabIndex = key === this.tab ? 0 : -1;
    });
    const prime = this.tab === 'achievements';
    document.getElementById('prime-section').hidden = !prime;
    document.getElementById('quest-board-panel').hidden = prime;
    document.getElementById('quest-board-panel').setAttribute('aria-labelledby', 'quest-tab-' + this.tab);
    const eventTab = this.tab === 'events';
    document.getElementById('quest-section-title').textContent = eventTab ? 'SỰ KIỆN ĐANG DIỄN RA' : 'NHIỆM VỤ ĐANG HOẠT ĐỘNG';
    document.getElementById('quest-section-description').textContent = eventTab ? 'Các sự kiện được máy chủ cung cấp' : 'Hoàn thành mục tiêu để nhận thưởng vào ví';
    const visible = eventTab ? data.events || [] : quests.filter(q => (q.period || 'daily') === this.tab);
    document.getElementById('server-quest-count').textContent = visible.length;
    const claimable = quests.filter(q => q.canClaim && !q.claimed && !q.locked);
    const all = document.getElementById('quest-claim-all');
    all.hidden = !claimable.length || prime || eventTab;
    all.textContent = `Nhận tất cả · ${claimable.reduce((sum,q)=>sum + Number(q.rewardAmount || 0),0).toLocaleString('vi-VN')} Lúa`;
    const grid = document.getElementById('server-quests-grid');
    grid.innerHTML = visible.length ? visible.map(q => eventTab ? this.eventCard(q) : this.card(q)).join('') : `<div class="quest-empty">${eventTab ? 'Chưa có dữ liệu sự kiện từ máy chủ.' : 'Chưa có nhiệm vụ trong mục này.'}</div>`;
  },
  card(q) {
    const p = this.progress(q);
    const rarity = ['common','uncommon','rare','epic','legendary'].includes(q.rarity) ? q.rarity : 'common';
    const labels = {common:'THƯỜNG',uncommon:'KHÁC THƯỜNG',rare:'HIẾM',epic:'SỬ THI',legendary:'HUYỀN THOẠI'};
    const config = q.config || {};
    const type = config.minutes ? 'time' : config.km ? 'map' : config.count ? 'combat' : 'award';
    const locked = q.locked === true;
    const canClaim = q.canClaim && !q.claimed && !locked;
    const status = q.claimed ? '✓ ĐÃ NHẬN' : locked ? 'KHÓA' : canClaim ? 'NHẬN THƯỞNG' : 'ĐANG THỰC HIỆN';
    const rewards = (q.rewards || []).filter(r => !['coins','coin','lua','Lúa 🌾'].includes(r.kind));
    return `<article class="quest-card rarity-${rarity} ${locked ? 'quest-locked' : ''}">
      <div class="quest-card-heading"><div class="quest-icon">${this.icon(type)}</div><div class="quest-card-copy"><h3>${this.escape(q.name || 'Nhiệm vụ')}</h3><p>${this.escape(q.description || '')}</p></div><div class="quest-meta"><span class="quest-rarity">${labels[rarity]}</span><small>${q.period === 'weekly' ? 'HẰNG TUẦN' : q.period === 'monthly' ? 'HẰNG THÁNG' : 'HẰNG NGÀY'}</small></div></div>
      <div class="quest-objective-heading"><span>MỤC TIÊU</span><strong>${p.done ? 1 : 0}/1</strong></div>
      <div class="quest-objective"><span class="quest-checkbox ${p.done ? 'is-complete' : ''}" aria-hidden="true">${p.done ? '✓' : ''}</span><span>${this.escape(q.objectiveLabel || q.description || q.name)}</span></div>
      <div class="quest-progress"><strong>${this.escape(p.label)}</strong><div class="quest-progress-track" role="progressbar" aria-label="Tiến độ nhiệm vụ" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.percent}"><span style="transform:scaleX(${p.percent / 100})"></span></div></div>
      <div class="quest-card-footer"><div class="quest-rewards"><span class="quest-lua">🌾 <strong>${Number(q.rewardAmount || 0).toLocaleString('vi-VN')}</strong> <small>LÚA</small></span>${rewards.map(r=>`<span class="quest-extra-reward">${this.escape(r.amount ?? '')} <small>${this.escape(r.kind)}</small></span>`).join('')}</div><button type="button" class="quest-claim ${canClaim ? 'is-ready' : ''}" ${canClaim ? `data-claim-quest="${this.escape(q.id)}"` : 'disabled'}>${status}</button></div>
    </article>`;
  },
  eventCard(event) {
    return `<article class="quest-card quest-event rarity-uncommon"><div class="quest-card-heading"><div class="quest-icon">${this.icon('event')}</div><div class="quest-card-copy"><small>SỰ KIỆN</small><h3>${this.escape(event.name || event.title || 'Sự kiện máy chủ')}</h3></div>${event.multiplier ? `<span class="quest-rarity">×${this.escape(event.multiplier)}</span>` : ''}</div>${event.endsAt ? `<div class="quest-event-end">KẾT THÚC · ${this.escape(new Date(event.endsAt).toLocaleString('vi-VN'))}</div>` : ''}<p>${this.escape(event.description || '')}</p></article>`;
  }
};
document.addEventListener('DOMContentLoaded', () => QuestBoard.init());
