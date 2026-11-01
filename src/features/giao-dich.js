
    // Controller Hệ Thống Trade P2P ST25
    const TradeApp = {
      currentSteamId: null,
      balance: 0,
      garageStatus: null,
      myDinos: [],
      incomingTrades: [],
      outgoingTrades: [],
      tradeHistory: [],
      recentPlayers: [],

      getActiveSteamId() {
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
      },

      async switchAccount(sid) {
        if (!sid) return;
        App.showToast(`Đang chuyển sang tài khoản ${sid}...`, 'info');
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
          } else {
            App.showToast(data.error || 'Chuyển tài khoản thất bại!', 'error');
          }
        } catch (e) {
          console.error(e);
          App.showToast('Lỗi kết nối máy chủ!', 'error');
        }
      },

      switchCustomAccount() {
        const inp = document.getElementById('custom-switch-sid');
        const sid = inp ? inp.value.trim() : '';
        if (!sid || !/^\d{17}$/.test(sid)) {
          App.showToast('Vui lòng nhập đúng 17 chữ số Steam ID!', 'error');
          return;
        }
        this.switchAccount(sid);
      },

      countdownInterval: null,

      startCountdownTimer() {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        this.countdownInterval = setInterval(() => {
          let hasAnyExpired = false;
          const countdownEls = document.querySelectorAll('.trade-countdown');
          countdownEls.forEach(el => {
            const expAt = Number(el.getAttribute('data-expires-at'));
            if (expAt) {
              const diffSec = Math.max(0, Math.ceil((expAt - Date.now()) / 1000));
              const secEl = el.querySelector('.countdown-sec');
              if (secEl) {
                secEl.textContent = `${diffSec}s`;
              }
              if (diffSec <= 0) {
                hasAnyExpired = true;
              }
            }
          });
          if (!document.hidden && hasAnyExpired && Date.now() >= (this.nextExpiryRefresh || 0) && (this.incomingTrades.length > 0 || this.outgoingTrades.length > 0)) {
            this.nextExpiryRefresh = Date.now() + 10000;
            this.loadData();
          }
        }, 1000);
      },

      async init() {
        this.currentSteamId = this.getActiveSteamId();
        this.startCountdownTimer();
        await this.loadData();
      },

      async loadData() {
        if (this.loading) return;
        this.loading = true;
        try {
          const sid = this.getActiveSteamId();
          const url = sid ? `${ST25API.routes.tradeData}?steamId=${encodeURIComponent(sid)}&_t=${Date.now()}` : `${ST25API.routes.tradeData}?_t=${Date.now()}`;
          const hdrs = sid ? { 'x-steam-id': sid } : {};

          const data = await App.readJSON(url, { headers: hdrs });

          this.currentSteamId = data.steamId;
          this.balance = data.balance || 0;
          this.garageStatus = data.garageStatus || { totalParked: 0, maxSlots: 3, roleName: 'Thành viên' };
          this.myDinos = data.myDinos || [];
          this.incomingTrades = data.incomingTrades || [];
          this.outgoingTrades = data.outgoingTrades || [];
          this.tradeHistory = data.tradeHistory || [];
          this.recentPlayers = data.recentPlayers || [];

          this.renderUI(data);
        } catch (e) {
          console.error("Lỗi nạp dữ liệu trade:", e);
          App.showToast("Lỗi khi đồng bộ dữ liệu giao dịch!", "error");
        } finally {
          this.loading = false;
        }
      },

      renderUI(data) {
        // Tag & Balance
        const userTag = document.getElementById('trade-user-tag');
        if (userTag) {
          if (data.steamId) {
            userTag.textContent = `${data.personaName} [${data.steamId}] (${data.garageStatus.roleName})`;
          } else {
            userTag.textContent = 'Chưa đăng nhập Steam (Chọn tài khoản test bên trên)';
          }
        }

        const balVal = document.getElementById('trade-balance-val');
        if (balVal) balVal.textContent = (data.balance || 0).toLocaleString();

        const capVal = document.getElementById('trade-garage-capacity');
        if (capVal) {
          const s = data.garageStatus;
          capVal.textContent = `${s.totalParked || 0} / ${s.maxSlots || 3} Slots`;
        }

        // Render Dropdown Dino
        this.renderMyDinosDropdown();

        // Render Dropdown Recent Players
        this.renderRecentPlayersDropdown();

        // Render Incoming Offers
        this.renderIncomingTrades();

        // Render Outgoing Offers
        this.renderOutgoingTrades();

        // Render Trade History
        this.renderTradeHistory();
      },

      renderMyDinosDropdown() {
        const sel = document.getElementById('trade-select-dino');
        const badge = document.getElementById('trade-dino-count-badge');
        if (badge) badge.textContent = `${this.myDinos.length} Khủng Long Sẵn Sàng`;
        if (!sel) return;

        if (!this.myDinos.length) {
          sel.innerHTML = '<option value="">-- Gara của bạn hiện không có khủng long nào rảnh --</option>';
          return;
        }

        sel.innerHTML = '<option value="">-- Không gửi Dino (Chỉ chuyển Lúa) --</option>' +
          this.myDinos.map(d => `
            <option value="${d.id}" data-species="${d.species}" data-growth="${d.growth}" data-gender="${d.gender}">
              🦖 ${d.species} [${d.growth}%] • ${d.gender} • Nguồn: ${d.source}
            </option>
          `).join('');
      },

      onSelectDinoChange() {
        const sel = document.getElementById('trade-select-dino');
        const preview = document.getElementById('trade-selected-dino-preview');
        if (!sel || !preview) return;

        const val = sel.value;
        if (!val) {
          preview.style.display = 'none';
          return;
        }

        const dino = this.myDinos.find(d => String(d.id) === String(val));
        if (dino) {
          preview.style.display = 'flex';
          const icon = dino.species === 'Deinosuchus' ? '🐊' : (dino.species === 'Triceratops' ? '🦏' : '🦖');
          preview.innerHTML = `
            <div style="font-size: 2rem;">${icon}</div>
            <div>
              <div style="font-weight: 800; color: #fff;">${dino.species} (${dino.gender})</div>
              <div style="font-size: 0.8rem; color: #38bdf8;">Độ trưởng thành: ${dino.growth}% • Dinh dưỡng: ${(dino.diet || []).join('-')}</div>
              <div style="font-size: 0.75rem; color: #94a3b8;">${dino.mutations && dino.mutations.length ? 'Đột biến: ' + dino.mutations.join(', ') : 'Không có đột biến'}</div>
            </div>
          `;
        }
      },

      renderRecentPlayersDropdown() {
        const sel = document.getElementById('trade-recent-players');
        if (!sel) return;

        if (!this.recentPlayers.length) {
          sel.innerHTML = '<option value="">-- Không có người chơi online nào --</option>';
          return;
        }

        sel.innerHTML = '<option value="">-- Chọn nhanh thành viên online (' + this.recentPlayers.length + ' người) --</option>' +
          this.recentPlayers.map(p => `
            <option value="${p.steamId}">
              ${App.escapeHTML(p.name)} [${p.steamId}] ${p.species ? '• ' + p.species : ''}
            </option>
          `).join('');
      },

      onSelectRecentPlayer(sid) {
        if (!sid) return;
        const inp = document.getElementById('trade-receiver-steamid');
        if (inp) inp.value = sid;
      },

      renderIncomingTrades() {
        const container = document.getElementById('incoming-trades-list');
        const badge = document.getElementById('incoming-badge');
        if (badge) badge.textContent = `${this.incomingTrades.length} lời mời`;
        if (!container) return;

        if (!this.incomingTrades.length) {
          container.innerHTML = `
            <div style="text-align: center; padding: 35px 20px; color: #64748b; background: rgba(0,0,0,0.2); border-radius: 8px;">
              <div style="font-size: 2.2rem; margin-bottom: 8px;">📭</div>
              <div>Không có lời mời giao dịch nào đang chờ bạn xử lý.</div>
            </div>
          `;
          return;
        }

        container.innerHTML = this.incomingTrades.map(t => {
          const d = t.senderDino;
          const dinoHtml = d ? `
            <div class="dino-preview-card" style="border-color: rgba(245, 158, 11, 0.3);">
              <div style="font-size: 1.8rem;">${d.species === 'Deinosuchus' ? '🐊' : '🦖'}</div>
              <div>
                <strong style="color: #fbbf24;">${d.species} [${d.growth}%]</strong> (${d.gender})
                <div style="font-size: 0.78rem; color: #cbd5e1;">Dinh dưỡng: ${(d.diet || []).join('-')} ${d.mutations && d.mutations.length ? '• ' + d.mutations.join(', ') : ''}</div>
              </div>
            </div>
          ` : '<span style="color: #94a3b8; font-style: italic;">Không có Dino kèm theo</span>';

          const expTime = t.expiresAtTimestamp || (t.createdAtTimestamp ? t.createdAtTimestamp + 30000 : (new Date(t.createdAt).getTime() + 30000));
          const leftSec = Math.max(0, Math.ceil((expTime - Date.now()) / 1000));

          return `
            <div class="offer-box">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <div>
                  <div style="font-size: 0.8rem; color: #94a3b8;">Người gửi lời mời:</div>
                  <strong style="color: #fff; font-size: 1.05rem;">${App.escapeHTML(t.senderName)}</strong>
                  <span style="font-family: monospace; font-size: 0.82rem; color: #fbbf24; margin-left: 6px;">[${t.senderSteamId}]</span>
                </div>
                <span class="offer-badge badge-pending trade-countdown" data-trade-id="${t.id}" data-expires-at="${expTime}">⏳ Chờ duyệt: <b class="countdown-sec" style="color: #ef4444; font-size: 0.95rem;">${leftSec}s</b></span>
              </div>

              <div style="margin-bottom: 12px;">
                <div style="font-size: 0.82rem; color: #cbd5e1; margin-bottom: 4px;">🎁 <strong>Họ đưa cho bạn:</strong></div>
                ${dinoHtml}
                ${t.senderLua > 0 ? `<div style="margin-top: 6px; color: #34d399; font-weight: 700;">+ Tặng kèm: ${t.senderLua} Lúa 🌾</div>` : ''}
              </div>

              <div style="background: rgba(0,0,0,0.3); padding: 10px 12px; border-radius: 6px; margin-bottom: 14px; border-left: 3px solid #10b981;">
                <div style="font-size: 0.85rem; color: #cbd5e1;">
                  💰 <strong>Họ yêu cầu bạn trả:</strong> 
                  <span style="color: #fbbf24; font-weight: 800; font-size: 1.1rem; margin-left: 6px;">${t.requestedLua} Lúa 🌾</span>
                </div>
                ${t.note ? `<div style="font-size: 0.8rem; color: #94a3b8; margin-top: 4px; font-style: italic;">"${t.note}"</div>` : ''}
              </div>

              <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="TradeApp.declineTrade('${t.id}')" class="btn-action-decline">
                  ❌ Từ Chối
                </button>
                <button onclick="TradeApp.acceptTrade('${t.id}')" class="btn-action-accept">
                  ✅ Chấp Nhận Giao Dịch
                </button>
              </div>
            </div>
          `;
        }).join('');
      },

      renderOutgoingTrades() {
        const container = document.getElementById('outgoing-trades-list');
        const badge = document.getElementById('outgoing-badge');
        if (badge) badge.textContent = `${this.outgoingTrades.length} lời mời`;
        if (!container) return;

        if (!this.outgoingTrades.length) {
          container.innerHTML = `
            <div style="text-align: center; padding: 25px 20px; color: #64748b; background: rgba(0,0,0,0.2); border-radius: 8px;">
              <div>Chưa có lời mời gửi đi nào đang chờ.</div>
            </div>
          `;
          return;
        }

        container.innerHTML = this.outgoingTrades.map(t => {
          const d = t.senderDino;
          const expTime = t.expiresAtTimestamp || (t.createdAtTimestamp ? t.createdAtTimestamp + 30000 : (new Date(t.createdAt).getTime() + 30000));
          const leftSec = Math.max(0, Math.ceil((expTime - Date.now()) / 1000));

          return `
            <div class="offer-box">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div>
                  <span style="color: #94a3b8; font-size: 0.8rem;">Gửi tới:</span>
                  <strong style="color: #fff; margin-left: 4px;">${App.escapeHTML(t.receiverName)}</strong>
                  <span style="font-family: monospace; font-size: 0.8rem; color: #64748b;">[${t.receiverSteamId}]</span>
                </div>
                <button onclick="TradeApp.cancelTrade('${t.id}')" class="btn-action-cancel" title="Hủy lời mời và lấy lại khủng long">
                  🚫 Hủy Lời Mời
                </button>
              </div>

              <div style="font-size: 0.85rem; color: #cbd5e1; margin-bottom: 6px;">
                ${d ? `🦖 Đưa: <strong>${d.species} [${d.growth}%]</strong>` : ''}
                ${t.senderLua > 0 ? ` + ${t.senderLua} Lúa 🌾` : ''}
                • Yêu cầu nhận: <strong style="color: #fbbf24;">${t.requestedLua} Lúa 🌾</strong>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #64748b;">
                <span>Tạo lúc: ${t.createdAt}</span>
                <span class="offer-badge badge-pending trade-countdown" data-trade-id="${t.id}" data-expires-at="${expTime}">⏳ Còn <b class="countdown-sec" style="color: #ef4444; font-size: 0.95rem;">${leftSec}s</b> (Tự hoàn thú)</span>
              </div>
            </div>
          `;
        }).join('');
      },

      renderTradeHistory() {
        const tbody = document.getElementById('trade-history-tbody');
        if (!tbody) return;

        if (!this.tradeHistory.length) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6" style="text-align: center; padding: 25px; color: #64748b;">
                Chưa có lịch sử giao dịch nào.
              </td>
            </tr>
          `;
          return;
        }

        tbody.innerHTML = this.tradeHistory.map(t => {
          let badgeClass = 'badge-pending';
          let statusText = 'Chờ xử lý';
          if (t.status === 'accepted') { badgeClass = 'badge-accepted'; statusText = 'Thành công ✅'; }
          else if (t.status === 'declined') { badgeClass = 'badge-declined'; statusText = 'Từ chối ❌'; }
          else if (t.status === 'cancelled') { badgeClass = 'badge-cancelled'; statusText = 'Đã hủy 🚫'; }
          else if (t.status === 'expired') { badgeClass = 'badge-declined'; statusText = 'Hết hạn 30s (Đã hoàn thú) ⏱️'; }

          const d = t.senderDino;
          const itemText = d ? `${d.species} [${d.growth}%] (${d.gender})` : 'Chỉ trao đổi Lúa';
          const luaText = `${t.requestedLua} Lúa`;

          return `
            <tr>
              <td style="color: #94a3b8; font-size: 0.82rem; white-space: nowrap;">${t.updatedAt || t.createdAt}</td>
              <td>
                <strong style="color: #fff;">${App.escapeHTML(t.senderName)}</strong>
                <div style="font-family: monospace; font-size: 0.78rem; color: #64748b;">${t.senderSteamId}</div>
              </td>
              <td>
                <strong style="color: #fff;">${App.escapeHTML(t.receiverName)}</strong>
                <div style="font-family: monospace; font-size: 0.78rem; color: #64748b;">${t.receiverSteamId}</div>
              </td>
              <td>
                <span style="color: #cbd5e1; font-weight: 600;">${itemText}</span>
              </td>
              <td>
                <strong style="color: #fbbf24;">${luaText}</strong>
              </td>
              <td>
                <span class="offer-badge ${badgeClass}">${statusText}</span>
              </td>
            </tr>
          `;
        }).join('');
      },

      async submitCreateTrade(e) {
        e.preventDefault();
        const receiverSteamId = document.getElementById('trade-receiver-steamid').value.trim();
        const dinoId = document.getElementById('trade-select-dino').value;
        const senderLua = document.getElementById('trade-sender-lua').value;
        const requestedLua = document.getElementById('trade-requested-lua').value;
        const note = document.getElementById('trade-note').value.trim();

        if (!receiverSteamId || !/^\d{17}$/.test(receiverSteamId)) {
          App.showToast("Vui lòng nhập đúng 17 chữ số Steam ID người nhận!", "error");
          return;
        }

        if (receiverSteamId === this.currentSteamId) {
          App.showToast("Bạn không thể tự gửi lời mời giao dịch cho chính mình!", "error");
          return;
        }

        if (!dinoId && Number(senderLua) <= 0 && Number(requestedLua) <= 0) {
          App.showToast("Vui lòng chọn Dino hoặc nhập số Lúa muốn giao dịch!", "error");
          return;
        }

        const btn = document.getElementById('btn-submit-trade');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Đang gửi lời mời giao dịch...';
        }

        try {
          const res = await fetch(ST25API.routes.tradeCreate, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-steam-id': this.currentSteamId
            },
            body: JSON.stringify({
              steamId: this.currentSteamId,
              receiverSteamId,
              dinoId,
              senderLua: Number(senderLua) || 0,
              requestedLua: Number(requestedLua) || 0,
              note
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            App.showToast(data.message, "success");
            // Reset form
            document.getElementById('create-trade-form').reset();
            const preview = document.getElementById('trade-selected-dino-preview');
            if (preview) preview.style.display = 'none';
            await this.loadData();
          } else {
            App.showToast(data.error || "Gửi lời mời giao dịch thất bại!", "error");
          }
        } catch (err) {
          console.error(err);
          App.showToast("Lỗi kết nối máy chủ!", "error");
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = '🤝 Gửi Lời Mời Giao Dịch Ngay 🚀';
          }
        }
      },

      async acceptTrade(tradeId) {
        if (!confirm("Xác nhận chấp nhận giao dịch này? Lúa và Khủng Long sẽ được hoán đổi ngay vào tài khoản & Gara của bạn.")) {
          return;
        }

        App.showToast("Đang xử lý giao dịch...", "info");
        try {
          const res = await fetch(ST25API.routes.tradeAccept, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-steam-id': this.currentSteamId
            },
            body: JSON.stringify({
              steamId: this.currentSteamId,
              tradeId
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            App.showToast(data.message, "success");
            await this.loadData();
          } else {
            App.showToast(data.error || "Không thể chấp nhận giao dịch!", "error");
          }
        } catch (err) {
          console.error(err);
          App.showToast("Lỗi kết nối máy chủ!", "error");
        }
      },

      async declineTrade(tradeId) {
        if (!confirm("Bạn có chắc muốn từ chối lời mời giao dịch này?")) {
          return;
        }

        try {
          const res = await fetch(ST25API.routes.tradeDecline, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-steam-id': this.currentSteamId
            },
            body: JSON.stringify({
              steamId: this.currentSteamId,
              tradeId
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            App.showToast(data.message, "info");
            await this.loadData();
          } else {
            App.showToast(data.error || "Không thể từ chối giao dịch!", "error");
          }
        } catch (err) {
          console.error(err);
          App.showToast("Lỗi kết nối máy chủ!", "error");
        }
      },

      async cancelTrade(tradeId) {
        if (!confirm("Xác nhận hủy lời mời giao dịch này? Khủng long sẽ được trả về Gara của bạn.")) {
          return;
        }

        try {
          const res = await fetch(ST25API.routes.tradeCancel, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-steam-id': this.currentSteamId
            },
            body: JSON.stringify({
              steamId: this.currentSteamId,
              tradeId
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            App.showToast(data.message, "success");
            await this.loadData();
          } else {
            App.showToast(data.error || "Không thể hủy giao dịch!", "error");
          }
        } catch (err) {
          console.error(err);
          App.showToast("Lỗi kết nối máy chủ!", "error");
        }
      }
    };

    document.addEventListener('DOMContentLoaded', () => {
      TradeApp.init();
    });
  
