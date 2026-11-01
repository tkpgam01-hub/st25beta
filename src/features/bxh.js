
    const LeaderboardApp = {
      currentTab: 'survivors',
      data: {
        survivors: [],
        hunters: [],
        wealth: []
      },

      async init() {
        await this.loadData();
      },

      async loadData() {
        try {
          const res = await App.readResponse(ST25API.routes.leaderboard);
          if (res.ok) {
            const json = await res.json();
            const raw = json.categories || json;
            if (raw) {
              this.data = {
                survivors: Array.isArray(raw.survivors) ? raw.survivors.map(s => ({
                  name: s.name,
                  steamId: s.steamId,
                  species: s.species,
                  growth: s.growth != null ? (typeof s.growth === 'number' && s.growth > 1 ? `${s.growth}%` : s.growth) : '100%',
                  survivalHours: s.survivalHours ?? s.hours ?? 0,
                  avatar: s.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${s.steamId || s.name}`
                })) : [],
                hunters: Array.isArray(raw.hunters) ? raw.hunters.map(h => ({
                  name: h.name,
                  steamId: h.steamId,
                  species: h.species,
                  kills: h.kills ?? 0,
                  deaths: h.deaths ?? Math.max(1, Math.round((h.kills || 10) / (h.kdRatio || h.kd || 2))),
                  kd: h.kd ?? h.kdRatio ?? '0.0',
                  killStreak: h.killStreak ?? h.bestPrey ?? `${h.kills || 0} kills`,
                  avatar: h.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${h.steamId || h.name}`
                })) : [],
                wealth: Array.isArray(raw.wealth) ? raw.wealth.map(w => ({
                  name: w.name,
                  steamId: w.steamId,
                  role: w.role || 'Thành viên',
                  luaBalance: w.luaBalance ?? w.balance ?? 0,
                  cratesWon: w.cratesWon ?? Math.floor((w.balance || w.luaBalance || 0) / 1000),
                  avatar: w.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${w.steamId || w.name}`
                })) : []
              };
              this.renderCurrentView();
            }
          }
        } catch (e) {
          console.error(e);
          App.showToast('Không thể nạp dữ liệu Bảng Xếp Hạng!', 'error');
        }
      },

      switchTab(tab) {
        if (this.currentTab === tab) return;
        this.currentTab = tab;
        ['survivors', 'hunters', 'wealth'].forEach(t => {
          const btn = document.getElementById(`tab-${t}`);
          if (btn) {
            if (t === tab) btn.classList.add('active');
            else btn.classList.remove('active');
          }
        });
        this.renderCurrentView();
        window.ST25Motion?.enter('#podium-container, .table-container');
      },

      renderCurrentView() {
        const list = this.data[this.currentTab] || [];
        this.renderPodium(list);
        this.renderTable(list);
      },

      renderPodium(list) {
        const pod = document.getElementById('podium-container');
        if (!pod) return;

        if (list.length < 3) {
          pod.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #64748b; padding: 40px;">Chưa đủ dữ liệu để hiển thị Top 3.</div>`;
          return;
        }

        const top1 = list[0];
        const top2 = list[1];
        const top3 = list[2];

        const getStatText = (item) => {
          if (this.currentTab === 'survivors') return `${item.survivalHours} giờ`;
          if (this.currentTab === 'hunters') return `${item.kills} mạng (K/D ${item.kd})`;
          if (this.currentTab === 'wealth') return `${item.luaBalance?.toLocaleString('vi-VN')} Lúa 🌾`;
          return '';
        };

        const getSubText = (item) => {
          if (this.currentTab === 'survivors') return `${item.species} • Tăng trưởng ${item.growth}`;
          if (this.currentTab === 'hunters') return `Kỷ lục: ${item.killStreak} streak • ${item.species}`;
          if (this.currentTab === 'wealth') return `${item.role || 'Thành viên'} • ${item.steamId}`;
          return item.steamId;
        };

        pod.innerHTML = `
          <!-- Top 2 -->
          <div class="podium-card second">
            <div class="podium-rank-badge">🥈</div>
            <img class="podium-avatar" src="${top2.avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'}" alt="Top 2">
            <div class="podium-name">${App.escapeHTML(top2.name)}</div>
            <div class="podium-sub">${getSubText(top2)}</div>
            <div class="podium-stat" style="color: #cbd5e1;">${getStatText(top2)}</div>
          </div>

          <!-- Top 1 -->
          <div class="podium-card first">
            <div class="podium-rank-badge">👑</div>
            <img class="podium-avatar" style="width: 76px; height: 76px; border: 3px solid #fbbf24;" src="${top1.avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'}" alt="Top 1">
            <div class="podium-name" style="font-size: 1.35rem; color: #fbbf24;">${App.escapeHTML(top1.name)}</div>
            <div class="podium-sub">${getSubText(top1)}</div>
            <div class="podium-stat">${getStatText(top1)}</div>
          </div>

          <!-- Top 3 -->
          <div class="podium-card third">
            <div class="podium-rank-badge">🥉</div>
            <img class="podium-avatar" src="${top3.avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'}" alt="Top 3">
            <div class="podium-name">${App.escapeHTML(top3.name)}</div>
            <div class="podium-sub">${getSubText(top3)}</div>
            <div class="podium-stat" style="color: #d97706;">${getStatText(top3)}</div>
          </div>
        `;
      },

      renderTable(list) {
        const thead = document.getElementById('bxh-table-thead');
        const tbody = document.getElementById('bxh-table-tbody');
        if (!thead || !tbody) return;

        if (this.currentTab === 'survivors') {
          thead.innerHTML = `
            <tr>
              <th style="width: 60px;">Hạng</th>
              <th>Người Chơi</th>
              <th>Loài Khủng Long</th>
              <th>Độ Tăng Trưởng</th>
              <th>Thời Gian Sống</th>
              <th>Trạng Thái</th>
            </tr>
          `;
        } else if (this.currentTab === 'hunters') {
          thead.innerHTML = `
            <tr>
              <th style="width: 60px;">Hạng</th>
              <th>Thợ Săn</th>
              <th>Loài Ưa Thích</th>
              <th>Hạ Gục (Kills)</th>
              <th>Bị Hạ (Deaths)</th>
              <th>Chỉ Số K/D</th>
            </tr>
          `;
        } else {
          thead.innerHTML = `
            <tr>
              <th style="width: 60px;">Hạng</th>
              <th>Đại Gia ST25</th>
              <th>Vai Trò (Role)</th>
              <th>Kho Lúa Tích Lũy</th>
              <th>Số Lần Thắng Hòm</th>
              <th>Steam ID</th>
            </tr>
          `;
        }

        const tableList = list.slice(3); // Rank #4 trở đi
        if (!tableList.length) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6" style="text-align: center; padding: 30px; color: #64748b;">
                Chưa có thêm thứ hạng nào khác.
              </td>
            </tr>
          `;
          return;
        }

        tbody.innerHTML = tableList.map((item, idx) => {
          const rankNum = idx + 4;
          const rankCls = rankNum === 4 ? 'top4' : (rankNum === 5 ? 'top5' : '');

          if (this.currentTab === 'survivors') {
            return `
              <tr>
                <td><span class="rank-number ${rankCls}">#${rankNum}</span></td>
                <td>
                  <strong style="color: #fff;">${App.escapeHTML(item.name)}</strong><br>
                  <small style="color: #64748b; font-family: monospace;">${item.steamId}</small>
                </td>
                <td><span style="color: #fbbf24; font-weight: 700;">${item.species}</span></td>
                <td><span style="color: #38bdf8; font-weight: 700;">${item.growth}</span></td>
                <td><strong style="color: #10b981; font-size: 1.05rem;">${item.survivalHours} giờ</strong></td>
                <td><span style="background: rgba(16, 185, 129, 0.15); color: #6ee7b7; padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; border: 1px solid #10b981;">Còn Sống</span></td>
              </tr>
            `;
          } else if (this.currentTab === 'hunters') {
            return `
              <tr>
                <td><span class="rank-number ${rankCls}">#${rankNum}</span></td>
                <td>
                  <strong style="color: #fff;">${App.escapeHTML(item.name)}</strong><br>
                  <small style="color: #64748b; font-family: monospace;">${item.steamId}</small>
                </td>
                <td><span style="color: #fbbf24; font-weight: 700;">${item.species}</span></td>
                <td><strong style="color: #ef4444; font-size: 1.05rem;">${item.kills}</strong></td>
                <td><span style="color: #94a3b8;">${item.deaths}</span></td>
                <td><strong style="color: #fbbf24; font-size: 1.05rem;">${item.kd}</strong></td>
              </tr>
            `;
          } else {
            return `
              <tr>
                <td><span class="rank-number ${rankCls}">#${rankNum}</span></td>
                <td>
                  <strong style="color: #fff;">${App.escapeHTML(item.name)}</strong>
                </td>
                <td><span style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; border: 1px solid #fbbf24;">${item.role || 'Thành viên'}</span></td>
                <td><strong style="color: #fbbf24; font-size: 1.15rem;">${item.luaBalance?.toLocaleString('vi-VN')} 🌾</strong></td>
                <td><span style="color: #38bdf8;">${item.cratesWon || 0} lần</span></td>
                <td><code style="color: #64748b;">${item.steamId}</code></td>
              </tr>
            `;
          }
        }).join('');
      }
    };

    document.addEventListener('DOMContentLoaded', () => LeaderboardApp.init());
  
