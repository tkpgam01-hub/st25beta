
    // Admin Panel Client Controller
    const AdminPanel = {
      roles: [],
      assignedUsers: [],
      recentPlayers: [],
      currentAdminSteamId: null,

      getActiveSteamId() {
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const qId = urlParams.get('adminSteamId') || urlParams.get('steamId');
          if (qId && /^\d{17}$/.test(qId.trim())) return qId.trim();

          const stored = localStorage.getItem('st25_steam_user');
          if (stored) {
            const u = JSON.parse(stored);
            if (u && u.steam_id && /^\d{17}$/.test(u.steam_id.trim())) return u.steam_id.trim();
          }
        } catch (_) {}
        return null;
      },

      async init() {
        const isAuthorizedAdmin = await this.checkAdminStatus();
        if (!isAuthorizedAdmin) {
          // Bị từ chối quyền truy cập
          return;
        }

        // Lấy steamId từ URL nếu có
        const urlParams = new URLSearchParams(window.location.search);
        const qSteamId = urlParams.get('targetSteamId');
        if (qSteamId) {
          const inp = document.getElementById('target-steamid');
          if (inp) {
            inp.value = qSteamId;
            setTimeout(() => this.inspectPlayer(), 300);
          }
        }

        await this.fetchRolesAndSlots();
        this.renderRolesDropdown();
        this.renderRecentPlayersDropdown();
        this.renderAssignedTable();
      },

      async checkAdminStatus() {
        const deniedBox = document.getElementById('access-denied-panel');
        const adminBox = document.getElementById('admin-authorized-content');
        const headerName = document.getElementById('admin-auth-header-name');
        const headerSid = document.getElementById('admin-auth-header-sid');

        try {
          const sid = this.getActiveSteamId();
          const url = sid ? `${ST25API.routes.playerMe}?steamId=${encodeURIComponent(sid)}` : ST25API.routes.playerMe;
          const hdrs = sid ? { 'x-steam-id': sid, 'x-admin-steam-id': sid } : {};

          // 1. Kiểm tra phiên đăng nhập người dùng từ server
          const meRes = await App.readResponse(url, { headers: hdrs });
          const meData = await meRes.json();

          if (!meData || !meData.isLoggedIn || !meData.steam_id || !meData.isAdmin) {
            if (deniedBox) deniedBox.style.display = 'block';
            if (adminBox) adminBox.style.display = 'none';
            if (headerName) headerName.textContent = 'Chưa Đăng Nhập Admin';
            if (headerSid) headerSid.textContent = 'Vui lòng chọn hoặc nhập Steam ID Admin bên phải';
            return false;
          }

          // Đã đăng nhập và đúng quyền Admin
          this.currentAdminSteamId = meData.steam_id;

          if (deniedBox) deniedBox.style.display = 'none';
          if (adminBox) adminBox.style.display = 'block';

          if (headerName) headerName.textContent = `Admin: ${meData.persona_name}`;
          if (headerSid) headerSid.textContent = `Steam ID: ${this.currentAdminSteamId} (Đã xác thực ✅)`;

          const nameEl = document.getElementById('admin-name');
          const sidEl = document.getElementById('admin-steamid');
          const avatarEl = document.getElementById('admin-avatar');

          if (nameEl) nameEl.textContent = meData.persona_name || "Quản Trị Viên ST25";
          if (sidEl) sidEl.textContent = `Steam ID Quản Trị: ${this.currentAdminSteamId}`;
          if (avatarEl && meData.avatar) avatarEl.src = meData.avatar;

          return true;
        } catch (e) {
          console.error("Lỗi kiểm tra quyền admin:", e);
          if (deniedBox) deniedBox.style.display = 'block';
          if (adminBox) adminBox.style.display = 'none';
          return false;
        }
      },

      manualSlotChanged: false,

      async fetchRolesAndSlots() {
        try {
          let cachedList = [];
          try {
            const stored = localStorage.getItem('st25_master_assignments');
            if (stored) {
              const parsed = JSON.parse(stored);
              if (Array.isArray(parsed) && parsed.length > 0) cachedList = parsed;
            }
          } catch (_) {}

          const res = await fetch(`${ST25API.routes.adminRolesSlots}?steamId=${encodeURIComponent(this.currentAdminSteamId)}&_t=${Date.now()}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-steam-id': this.currentAdminSteamId,
              'x-admin-steam-id': this.currentAdminSteamId,
              'Cache-Control': 'no-cache'
            },
            body: JSON.stringify({
              cachedAssignments: cachedList
            })
          });

          if (res.ok) {
            const data = await res.json();
            this.roles = data.roles || [];
            this.assignedUsers = data.assignedUsers || [];
            this.recentPlayers = data.recentPlayers || [];

            // Lưu master snapshot để đồng bộ xuyên suốt mọi container Vercel
            try {
              if (Array.isArray(this.assignedUsers) && this.assignedUsers.length > 0) {
                localStorage.setItem('st25_master_assignments', JSON.stringify(this.assignedUsers));
              }
            } catch (_) {}
          } else {
            App.showToast("Không thể tải danh sách cấu hình từ máy chủ!", "error");
          }
        } catch (e) {
          console.error("Lỗi fetch roles:", e);
        }
      },

      renderRolesDropdown() {
        const sel = document.getElementById('select-role');
        if (!sel || !this.roles.length) return;

        const roleOrder = [
          'admin', '.', 'mod', 'long_dai_dia_chu', 'long_phu_nong', 
          'long_ta_dien', 'long_chu', 'vien_gach_dau_tien', 'dev', 
          'booster', 'streamer', 'default'
        ];

        // Sắp xếp các role theo độ quan trọng
        const sortedRoles = [...this.roles].sort((a, b) => {
          const idxA = roleOrder.indexOf(a.key);
          const idxB = roleOrder.indexOf(b.key);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.key.localeCompare(b.key);
        });

        sel.innerHTML = sortedRoles.map(r => `
          <option value="${r.key}" data-default-slots="${r.defaultSlots}">
            ${r.name} (${r.defaultSlots} slots mặc định)
          </option>
        `).join('');
      },

      renderRecentPlayersDropdown() {
        const sel = document.getElementById('recent-players-select');
        if (!sel) return;
        if (!this.recentPlayers.length) {
          sel.innerHTML = '<option value="">-- Không có người chơi online nào --</option>';
          return;
        }

        sel.innerHTML = '<option value="">-- Chọn thành viên từ máy chủ (' + this.recentPlayers.length + ' người) --</option>' +
          this.recentPlayers.map(p => `
            <option value="${p.steamId}">
              ${p.name} [${p.steamId}] ${p.species ? '• ' + p.species : ''}
            </option>
          `).join('');
      },

      onSelectRecentPlayer(sid) {
        if (!sid) return;
        document.getElementById('target-steamid').value = sid;
        this.inspectPlayer(false);
      },

      onSteamIdInput() {
        const val = document.getElementById('target-steamid').value.trim();
        if (val.length === 17) {
          // Tra cứu hiển thị thông tin mà không ghi đè form nhập của Admin
          this.inspectPlayer(false);
        }
      },

      onRoleChange(roleKey) {
        // Chỉ tự đổi slots nếu Admin CHƯA chủ động chọn số slot thủ công
        if (!this.manualSlotChanged) {
          const sel = document.getElementById('select-role');
          const selectedOpt = sel.options[sel.selectedIndex];
          if (selectedOpt) {
            const defSlots = selectedOpt.getAttribute('data-default-slots');
            if (defSlots) {
              document.getElementById('custom-slots').value = defSlots;
              this.updateQuickSlotButtons(defSlots);
            }
          }
        }
      },

      setSlots(n) {
        this.manualSlotChanged = true;
        document.getElementById('custom-slots').value = n;
        this.updateQuickSlotButtons(n);
      },

      updateQuickSlotButtons(n) {
        const num = Number(n);
        const btns = document.querySelectorAll('.quick-slot-btns .btn-quick-slot');
        btns.forEach(b => {
          const val = Number(b.getAttribute('data-slot-val'));
          if (val === num) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      },

      setModalSlots(n) {
        document.getElementById('modal-edit-slots').value = n;
        this.updateModalSlotButtons(n);
      },

      updateModalSlotButtons(n) {
        const num = Number(n);
        const btns = document.querySelectorAll('.modal-slot-btns .btn-preset');
        btns.forEach(b => {
          const val = Number(b.getAttribute('data-modal-slot'));
          if (val === num) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      },

      async inspectPlayer(autoFill = true) {
        const sid = document.getElementById('target-steamid').value.trim();
        if (!sid) return;

        const previewCard = document.getElementById('player-preview');
        try {
          const res = await App.readResponse(`${ST25API.routes.adminPlayerInfo}?steamId=${encodeURIComponent(sid)}&adminSteamId=${encodeURIComponent(this.currentAdminSteamId)}`);
          if (res.ok) {
            const data = await res.json();
            previewCard.style.display = 'flex';
            document.getElementById('preview-name').textContent = data.name;
            document.getElementById('preview-avatar').src = data.avatar;
            document.getElementById('preview-current-slots').textContent = `${data.garageStatus.maxSlots} Slots`;
            document.getElementById('preview-current-role').textContent = data.garageStatus.roleName;
            document.getElementById('preview-status-extra').textContent = `Đang cất trong Gara: ${data.garageStatus.totalParked} con • Nhân vật in-game: ${data.species}`;

            // Nếu người này đã có slot riêng trong danh sách phân quyền:
            const existing = this.assignedUsers.find(u => u.steamId === sid);
            if (existing) {
              document.getElementById('preview-current-slots').textContent = `${existing.slots} Slots`;
              document.getElementById('preview-current-role').textContent = existing.roleName;
            }

            // Chỉ tự động điền form nếu autoFill = true VÀ admin chưa tự chọn slot
            if (autoFill && !this.manualSlotChanged) {
              const selRole = document.getElementById('select-role');
              if (selRole && data.garageStatus.roleKey) {
                selRole.value = data.garageStatus.roleKey;
              }
              const currentSlots = existing ? existing.slots : (data.garageStatus.maxSlots || 3);
              document.getElementById('custom-slots').value = currentSlots;
              this.updateQuickSlotButtons(currentSlots);
            }
          } else {
            previewCard.style.display = 'none';
          }
        } catch (e) {
          console.error("Lỗi tra cứu:", e);
        }
      },

      async submitAssign(e) {
        e.preventDefault();
        const targetSteamId = document.getElementById('target-steamid').value.trim();
        const roleKey = document.getElementById('select-role').value;
        const customSlotsVal = document.getElementById('custom-slots').value;
        const notes = document.getElementById('assign-notes').value.trim();

        if (!targetSteamId) {
          App.showToast("Vui lòng nhập Steam ID của người chơi!", "error");
          return;
        }

        const numSlots = parseInt(customSlotsVal, 10);
        if (isNaN(numSlots) || numSlots < 1 || numSlots > 100) {
          App.showToast("Số lượng slot phải là số nguyên từ 1 đến 100!", "error");
          return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "⏳ Đang Lưu & Cấp Quyền...";
        }

        App.showToast(`Đang lưu vĩnh viễn ${numSlots} Slots Gara cho ${targetSteamId}...`, "info");

        try {
          const hdrs = {
            'Content-Type': 'application/json',
            'x-steam-id': this.currentAdminSteamId,
            'x-admin-steam-id': this.currentAdminSteamId
          };
          const res = await fetch(ST25API.routes.adminAssignRoleSlots, {
            method: 'POST',
            headers: hdrs,
            body: JSON.stringify({
              adminSteamId: this.currentAdminSteamId,
              targetSteamId,
              roleKey,
              customSlots: numSlots,
              notes
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            App.showToast(`✅ ĐÃ LƯU VĨNH VIỄN: Cấp ${numSlots} Slots Gara cho ${targetSteamId} thành công!`, "success");

            // Cập nhật ngay danh sách bảng tức thì
            if (Array.isArray(data.assignedUsers)) {
              this.assignedUsers = data.assignedUsers;
            } else {
              const updatedUser = {
                steamId: targetSteamId,
                roleKey: roleKey,
                roleName: (data.garageStatus && data.garageStatus.roleName) || roleKey,
                slots: numSlots,
                isSuperAdmin: false,
                updatedAt: new Date().toLocaleString('vi-VN'),
                updatedAtTimestamp: Date.now(),
                notes: notes
              };
              this.assignedUsers = [
                updatedUser,
                ...this.assignedUsers.filter(u => u.steamId !== targetSteamId)
              ];
            }

            try {
              localStorage.setItem('st25_master_assignments', JSON.stringify(this.assignedUsers));
            } catch (_) {}

            // Xóa ô tìm kiếm để dòng vừa cấp hiển thị ngay trên cùng
            const searchInp = document.getElementById('filter-keyword');
            if (searchInp) searchInp.value = '';
            this.filterKeyword = '';
            this.filterDate = '';
            this.filterStatus = 'all';
            this.highlightActiveStatChip('all');

            this.renderAssignedTable();
            this.highlightUserRow(targetSteamId);

            // Cập nhật trực tiếp số slot hiển thị trên preview card
            const prevSlot = document.getElementById('preview-current-slots');
            if (prevSlot) prevSlot.textContent = `${numSlots} Slots`;
            const prevRole = document.getElementById('preview-current-role');
            if (prevRole && data.garageStatus) prevRole.textContent = data.garageStatus.roleName;

            this.manualSlotChanged = false;
          } else {
            App.showToast(data.error || "Không thể cấp quyền lúc này!", "error");
          }
        } catch (err) {
          console.error(err);
          App.showToast("Lỗi kết nối máy chủ khi lưu quyền!", "error");
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "💾 LƯU & CẤP QUYỀN NGAY LẬP TỨC";
          }
        }
      },

      async removeAssign(targetSteamId) {
        if (!confirm(`Xác nhận xóa thiết lập riêng của Steam ID [${targetSteamId}] và đưa về vai trò mặc định của server?`)) {
          return;
        }

        App.showToast(`Đang xóa thiết lập của ${targetSteamId}...`, "info");
        try {
          const hdrs = {
            'Content-Type': 'application/json',
            'x-steam-id': this.currentAdminSteamId,
            'x-admin-steam-id': this.currentAdminSteamId
          };
          const res = await fetch(ST25API.routes.adminRemoveRoleSlots, {
            method: 'POST',
            headers: hdrs,
            body: JSON.stringify({
              adminSteamId: this.currentAdminSteamId,
              targetSteamId
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            App.showToast(data.message, "success");
            if (Array.isArray(data.assignedUsers)) {
              this.assignedUsers = data.assignedUsers;
            } else {
              this.assignedUsers = this.assignedUsers.filter(u => u.steamId !== targetSteamId);
            }
            try {
              localStorage.setItem('st25_master_assignments', JSON.stringify(this.assignedUsers));
            } catch (_) {}
            this.renderAssignedTable();

            const curInp = document.getElementById('target-steamid').value.trim();
            if (curInp === targetSteamId) {
              this.inspectPlayer(true);
            }
          } else {
            App.showToast(data.error || "Lỗi khi xóa cấu hình!", "error");
          }
        } catch (e) {
          console.error(e);
          App.showToast("Không thể kết nối máy chủ!", "error");
        }
      },

      editUser(steamId, roleKey, slots, notes = '') {
        const modal = document.getElementById('admin-edit-modal');
        if (!modal) return;

        document.getElementById('modal-edit-steamid').value = steamId;
        document.getElementById('modal-edit-steamid-display').textContent = steamId;

        // Populate roles dropdown inside modal
        const selRole = document.getElementById('modal-edit-role');
        if (selRole && this.roles && this.roles.length) {
          selRole.innerHTML = this.roles.map(r => `
            <option value="${r.key}" data-default-slots="${r.defaultSlots}" ${r.key === roleKey ? 'selected' : ''}>
              ${r.name} (${r.defaultSlots} slots mặc định)
            </option>
          `).join('');
          selRole.value = roleKey;
        }

        document.getElementById('modal-edit-slots').value = slots;
        this.updateModalSlotButtons(slots);
        document.getElementById('modal-edit-notes').value = notes || '';

        modal.style.display = 'flex';
      },

      closeEditModal() {
        const modal = document.getElementById('admin-edit-modal');
        if (modal) modal.style.display = 'none';
      },

      onModalRoleChange() {
        const sel = document.getElementById('modal-edit-role');
        const opt = sel.options[sel.selectedIndex];
        if (opt) {
          const defSlots = opt.getAttribute('data-default-slots');
          if (defSlots) {
            document.getElementById('modal-edit-slots').value = defSlots;
            this.updateModalSlotButtons(defSlots);
          }
        }
      },

      async saveEditModal(e) {
        e.preventDefault();
        const steamId = document.getElementById('modal-edit-steamid').value.trim();
        const roleKey = document.getElementById('modal-edit-role').value;
        const slots = document.getElementById('modal-edit-slots').value;
        const notes = document.getElementById('modal-edit-notes').value.trim();

        const btn = document.getElementById('btn-save-edit-modal');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Đang lưu...';
        }

        try {
          const hdrs = {
            'Content-Type': 'application/json',
            'x-steam-id': this.currentAdminSteamId,
            'x-admin-steam-id': this.currentAdminSteamId
          };
          const res = await fetch(ST25API.routes.adminAssignRoleSlots, {
            method: 'POST',
            headers: hdrs,
            body: JSON.stringify({
              adminSteamId: this.currentAdminSteamId,
              targetSteamId: steamId,
              roleKey,
              customSlots: Number(slots),
              notes
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            App.showToast(data.message, "success");
            this.closeEditModal();

            if (Array.isArray(data.assignedUsers)) {
              this.assignedUsers = data.assignedUsers;
            }
            try {
              localStorage.setItem('st25_master_assignments', JSON.stringify(this.assignedUsers));
            } catch (_) {}
            this.renderAssignedTable();
            this.highlightUserRow(steamId);

            const curInp = document.getElementById('target-steamid').value.trim();
            if (curInp === steamId) {
              this.inspectPlayer(false);
            }
          } else {
            App.showToast(data.error || "Lỗi khi cập nhật quyền!", "error");
          }
        } catch (err) {
          console.error(err);
          App.showToast("Lỗi kết nối máy chủ!", "error");
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = '💾 Lưu Cập Nhật Ngay';
          }
        }
      },

      highlightUserRow(steamId) {
        setTimeout(() => {
          const row = document.getElementById(`user-row-${steamId}`);
          if (row) {
            row.style.transition = 'background-color 0.4s ease';
            row.style.backgroundColor = 'rgba(245, 158, 11, 0.25)';
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            setTimeout(() => {
              row.style.backgroundColor = '';
            }, 3000);
          }
        }, 60);
      },

      switchTab(tabName) {
        const btnRoles = document.getElementById('tab-btn-roles');
        const btnCombat = document.getElementById('tab-btn-combat');
        const contentRoles = document.getElementById('tab-content-roles');
        const contentCombat = document.getElementById('tab-content-combat');

        const targetContent = tabName === 'combat' ? contentCombat : contentRoles;
        const changed = targetContent && targetContent.style.display === 'none';
        if (tabName === 'combat') {
          if (btnRoles) btnRoles.classList.remove('active');
          if (btnCombat) btnCombat.classList.add('active');
          if (contentRoles) contentRoles.style.display = 'none';
          if (contentCombat) contentCombat.style.display = 'block';
          CombatInspector.init(this.currentAdminSteamId);
        } else {
          if (btnCombat) btnCombat.classList.remove('active');
          if (btnRoles) btnRoles.classList.add('active');
          if (contentCombat) contentCombat.style.display = 'none';
          if (contentRoles) contentRoles.style.display = 'block';
          if (typeof CombatInspector !== 'undefined' && CombatInspector.stopLive) {
            CombatInspector.stopLive();
          }
        }
        if (changed) window.ST25Motion?.enter(targetContent);
      },

      filterKeyword: '',
      filterDate: '',
      filterStatus: 'all',
      filterSort: 'newest',

      calculateExpiry(u) {
        if (u.isSuperAdmin || (u.notes && /vĩnh viễn|vinh vien|permanent|unlimited/i.test(u.notes))) {
          return {
            status: 'permanent',
            daysLeft: 9999,
            badgeClass: 'badge-status-perm',
            badgeText: '♾️ Vĩnh Viễn',
            expireDateStr: 'Không thời hạn'
          };
        }

        const updateMs = u.updatedAtTimestamp || (u.updatedAt ? new Date(u.updatedAt).getTime() : 0);
        if (!updateMs) {
          return {
            status: 'permanent',
            daysLeft: 9999,
            badgeClass: 'badge-status-perm',
            badgeText: '♾️ Mặc định',
            expireDateStr: 'Chưa cập nhật'
          };
        }

        const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
        const expireMs = updateMs + ONE_MONTH_MS;
        const diffMs = expireMs - Date.now();
        const daysLeft = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
        const expDate = new Date(expireMs);
        const expDay = String(expDate.getDate()).padStart(2, '0');
        const expMonth = String(expDate.getMonth() + 1).padStart(2, '0');
        const expYear = expDate.getFullYear();
        const expireDateStr = `${expDay}/${expMonth}/${expYear}`;

        if (daysLeft > 7) {
          return {
            status: 'active',
            daysLeft,
            badgeClass: 'badge-status-active',
            badgeText: `🟢 Còn ${daysLeft} ngày`,
            expireDateStr: `HSD: ${expireDateStr}`
          };
        }

        if (daysLeft >= 0 && daysLeft <= 7) {
          return {
            status: 'expiring',
            daysLeft,
            badgeClass: 'badge-status-expiring',
            badgeText: `🟡 Sắp hết: ${daysLeft} ngày`,
            expireDateStr: `HSD: ${expireDateStr}`
          };
        }

        return {
          status: 'expired',
          daysLeft,
          badgeClass: 'badge-status-expired',
          badgeText: `🔴 Quá hạn ${Math.abs(daysLeft)} ngày`,
          expireDateStr: `Hết hạn: ${expireDateStr}`
        };
      },

      updateExpiryStats() {
        let active = 0, expiring = 0, expired = 0, perm = 0;
        (this.assignedUsers || []).forEach(u => {
          const exp = this.calculateExpiry(u);
          if (exp.status === 'active') active++;
          else if (exp.status === 'expiring') expiring++;
          else if (exp.status === 'expired') expired++;
          else if (exp.status === 'permanent') perm++;
        });
        const total = (this.assignedUsers || []).length;

        const elAll = document.getElementById('count-all');
        if (elAll) elAll.textContent = total;
        const elAct = document.getElementById('count-active');
        if (elAct) elAct.textContent = active;
        const elExp = document.getElementById('count-expiring');
        if (elExp) elExp.textContent = expiring;
        const elEnd = document.getElementById('count-expired');
        if (elEnd) elEnd.textContent = expired;
        const elPer = document.getElementById('count-perm');
        if (elPer) elPer.textContent = perm;
      },

      onFilterInput() {
        const inp = document.getElementById('filter-keyword');
        this.filterKeyword = inp ? inp.value.trim().toLowerCase() : '';
        this.renderAssignedTable();
      },

      onDateChange() {
        const dateInp = document.getElementById('filter-date');
        this.filterDate = dateInp ? dateInp.value : '';
        const btnClear = document.getElementById('btn-clear-date');
        if (btnClear) btnClear.style.display = this.filterDate ? 'inline-block' : 'none';
        this.renderAssignedTable();
      },

      clearDateFilter() {
        const dateInp = document.getElementById('filter-date');
        if (dateInp) dateInp.value = '';
        this.filterDate = '';
        const btnClear = document.getElementById('btn-clear-date');
        if (btnClear) btnClear.style.display = 'none';
        this.renderAssignedTable();
      },

      onStatusChange(val) {
        this.filterStatus = val;
        this.highlightActiveStatChip(val);
        this.renderAssignedTable();
      },

      setFilterStatus(status) {
        this.filterStatus = status;
        const sel = document.getElementById('filter-status');
        if (sel) sel.value = status;
        this.highlightActiveStatChip(status);
        this.renderAssignedTable();
      },

      highlightActiveStatChip(status) {
        const chips = ['all', 'active', 'expiring', 'expired', 'perm'];
        chips.forEach(c => {
          const el = document.getElementById(`stat-chip-${c}`);
          if (el) {
            const isMatch = (c === 'perm' && status === 'permanent') || (c === status);
            if (isMatch) el.classList.add('active');
            else el.classList.remove('active');
          }
        });
      },

      onSortChange(val) {
        this.filterSort = val;
        this.renderAssignedTable();
      },

      resetFilters() {
        this.filterKeyword = '';
        this.filterDate = '';
        this.filterStatus = 'all';
        this.filterSort = 'newest';

        const kInp = document.getElementById('filter-keyword');
        if (kInp) kInp.value = '';
        const dInp = document.getElementById('filter-date');
        if (dInp) dInp.value = '';
        const btnClear = document.getElementById('btn-clear-date');
        if (btnClear) btnClear.style.display = 'none';
        const sSel = document.getElementById('filter-status');
        if (sSel) sSel.value = 'all';
        const sortSel = document.getElementById('filter-sort');
        if (sortSel) sortSel.value = 'newest';

        this.highlightActiveStatChip('all');
        this.renderAssignedTable();
        App.showToast('Đã đặt lại toàn bộ bộ lọc!', 'info');
      },

      async quickRenewUser(steamId, roleKey, slots, currentNotes) {
        const confirmMsg = `🔄 XÁC NHẬN GIA HẠN THÊM 30 NGÀY:\n\n` +
          `• Tài khoản: ${steamId}\n` +
          `• Sức chứa: ${slots} Slots Gara\n` +
          `• Vai trò: ${roleKey}\n\n` +
          `Bạn có chắc chắn muốn làm mới thời hạn 1 tháng (30 ngày) cho người chơi này tính từ hôm nay?`;

        if (!confirm(confirmMsg)) return;

        App.showToast(`Đang gia hạn 30 ngày cho ${steamId}...`, 'info');
        try {
          const hdrs = {
            'Content-Type': 'application/json',
            'x-steam-id': this.currentAdminSteamId,
            'x-admin-steam-id': this.currentAdminSteamId
          };
          const res = await fetch(ST25API.routes.adminAssignRoleSlots, {
            method: 'POST',
            headers: hdrs,
            body: JSON.stringify({
              adminSteamId: this.currentAdminSteamId,
              targetSteamId: steamId,
              roleKey: roleKey || 'default',
              customSlots: Number(slots),
              notes: currentNotes || ''
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            App.showToast(`✅ Đã gia hạn thành công thêm 30 ngày cho [${steamId}]!`, 'success');
            if (Array.isArray(data.assignedUsers)) {
              this.assignedUsers = data.assignedUsers;
            }
            try {
              localStorage.setItem('st25_master_assignments', JSON.stringify(this.assignedUsers));
            } catch (_) {}
            this.renderAssignedTable();
            this.highlightUserRow(steamId);
          } else {
            App.showToast(data.error || 'Lỗi khi gia hạn!', 'error');
          }
        } catch (err) {
          console.error(err);
          App.showToast('Lỗi kết nối khi gia hạn!', 'error');
        }
      },

      filterTable(keyword) {
        this.filterKeyword = (keyword || '').toLowerCase().trim();
        this.renderAssignedTable();
      },

      renderAssignedTable() {
        const tbody = document.getElementById('assigned-users-tbody');
        if (!tbody) return;

        this.updateExpiryStats();

        if (!this.assignedUsers || !this.assignedUsers.length) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6" style="text-align: center; padding: 30px; color: #64748b;">
                Chưa có tài khoản nào được phân quyền riêng.
              </td>
            </tr>
          `;
          return;
        }

        // Lọc danh sách
        let filtered = this.assignedUsers.filter(u => {
          const exp = this.calculateExpiry(u);

          // 1. Lọc theo trạng thái
          if (this.filterStatus !== 'all' && exp.status !== this.filterStatus) {
            return false;
          }

          // 2. Lọc theo ngày cấp (dạng YYYY-MM-DD từ input date)
          if (this.filterDate) {
            const timeMs = u.updatedAtTimestamp || (u.updatedAt ? new Date(u.updatedAt).getTime() : 0);
            if (!timeMs) return false;
            const uDate = new Date(timeMs);
            const uY = uDate.getFullYear();
            const uM = String(uDate.getMonth() + 1).padStart(2, '0');
            const uD = String(uDate.getDate()).padStart(2, '0');
            const userDateStr = `${uY}-${uM}-${uD}`;
            if (userDateStr !== this.filterDate) return false;
          }

          // 3. Lọc theo từ khóa tìm kiếm (Steam ID, ghi chú, role, text ngày)
          if (this.filterKeyword) {
            const combinedText = [
              u.steamId || '',
              u.roleName || '',
              u.roleKey || '',
              u.notes || '',
              u.updatedAt || '',
              exp.expireDateStr || '',
              exp.badgeText || ''
            ].join(' ').toLowerCase();

            if (!combinedText.includes(this.filterKeyword)) {
              return false;
            }
          }

          return true;
        });

        // Sắp xếp danh sách
        filtered.sort((a, b) => {
          const timeA = a.updatedAtTimestamp || (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
          const timeB = b.updatedAtTimestamp || (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);

          if (this.filterSort === 'newest') {
            if (timeA !== timeB) return timeB - timeA;
            if (a.isSuperAdmin && !b.isSuperAdmin) return -1;
            if (!a.isSuperAdmin && b.isSuperAdmin) return 1;
            return (a.steamId || '').localeCompare(b.steamId || '');
          } else if (this.filterSort === 'oldest') {
            return timeA - timeB;
          } else if (this.filterSort === 'expiring') {
            const expA = this.calculateExpiry(a);
            const expB = this.calculateExpiry(b);
            return expA.daysLeft - expB.daysLeft;
          } else if (this.filterSort === 'slots') {
            return (b.slots || 0) - (a.slots || 0);
          }
          return 0;
        });

        if (!filtered.length) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6" style="text-align: center; padding: 30px; color: #94a3b8;">
                🔍 Không tìm thấy thành viên nào phù hợp với bộ lọc hiện tại.
                <div style="margin-top: 8px;">
                  <button type="button" onclick="AdminPanel.resetFilters()" class="btn-action-sm" style="background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; color: #38bdf8;">
                    Đặt lại bộ lọc
                  </button>
                </div>
              </td>
            </tr>
          `;
          return;
        }

        tbody.innerHTML = filtered.map((u, idx) => {
          const safeNote = (u.notes || '').replace(/'/g, "\\'");
          const exp = this.calculateExpiry(u);

          return `
          <tr id="user-row-${u.steamId}">
            <td style="color: #64748b; font-weight: 700;">#${idx + 1}</td>
            <td>
              <strong style="color: #fff; font-family: monospace; font-size: 0.95rem;">${u.steamId}</strong>
              ${u.isSuperAdmin ? '<span class="badge-admin" style="margin-left: 6px; font-size: 0.75rem;">SUPER ADMIN</span>' : ''}
            </td>
            <td>
              <span class="badge-admin">${u.roleName}</span>
            </td>
            <td>
              <span class="badge-slot" style="font-size: 0.85rem; padding: 4px 10px;">${u.slots} Slots</span>
            </td>
            <td>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span class="badge-status ${exp.badgeClass}">${exp.badgeText}</span>
                <small style="color: #94a3b8; font-size: 0.75rem;">(${exp.expireDateStr})</small>
              </div>
              <div style="margin-top: 4px; font-size: 0.75rem; color: #64748b;">
                📅 Cấp: ${u.updatedAt || '—'}
              </div>
              ${u.notes ? `<div style="margin-top: 4px; font-size: 0.82rem; color: #cbd5e1;">📝 ${u.notes}</div>` : ''}
            </td>
            <td style="text-align: right; white-space: nowrap;">
              <button onclick="AdminPanel.quickRenewUser('${u.steamId}', '${u.roleKey}', ${u.slots}, '${safeNote}')" class="btn-action-sm" style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #6ee7b7; margin-right: 4px;" title="Gia hạn thêm 30 ngày từ hôm nay">
                🔄 +30 Ngày
              </button>
              <button onclick="AdminPanel.editUser('${u.steamId}', '${u.roleKey}', ${u.slots}, '${safeNote}')" class="btn-action-sm btn-action-edit" title="Chỉnh sửa vai trò & slots">
                ✏️ Sửa
              </button>
              ${!u.isSuperAdmin ? `
                <button onclick="AdminPanel.removeAssign('${u.steamId}')" class="btn-action-sm btn-action-del" title="Xóa đưa về mặc định (hết hạn / thu hồi)">
                  🗑️ Xóa
                </button>
              ` : ''}
              <a href="gara.html?steamId=${u.steamId}" class="btn-action-sm" style="background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; color: #7dd3fc; text-decoration: none;" title="Xem Gara Khủng Long">
                🦖 Gara
              </a>
            </td>
          </tr>
        `;
        }).join('');
      }
    };

    // Combat Inspector Controller (Real-time Live Radar & Anti-Cheat)
    const CombatInspector = {
      adminSteamId: null,
      rawLogs: [],
      filteredLogs: [],
      currentFilter: 'all',
      searchKeyword: '',
      isLive: true,
      liveTimer: null,
      lastKnownTopLogId: null,

      init(adminSid) {
        this.adminSteamId = adminSid || AdminPanel.currentAdminSteamId || AdminPanel.getActiveSteamId();
        this.loadLogs(false);
        this.startLive();
      },

      startLive() {
        this.stopLive();
        this.isLive = true;
        this.updateLiveUI();
        this.liveTimer = setInterval(() => {
          if (!document.hidden) this.loadLogs(true);
        }, 3000);
      },

      stopLive() {
        if (this.liveTimer) {
          clearInterval(this.liveTimer);
          this.liveTimer = null;
        }
        this.isLive = false;
        this.updateLiveUI();
      },

      toggleLive() {
        if (this.isLive) {
          this.stopLive();
          App.showToast('Đã tạm dừng cập nhật trực tiếp.', 'info');
        } else {
          this.startLive();
          App.showToast('Đã bật theo dõi thời gian thực (Live 3s)!', 'success');
          this.loadLogs(false);
        }
      },

      updateLiveUI() {
        const btn = document.getElementById('btn-toggle-live-combat');
        const textEl = document.getElementById('live-combat-status-text');
        const dotEl = document.getElementById('live-combat-dot');
        if (!btn || !textEl) return;

        if (this.isLive) {
          btn.style.background = 'rgba(16, 185, 129, 0.2)';
          btn.style.borderColor = '#10b981';
          btn.style.color = '#6ee7b7';
          textEl.textContent = '🟢 REAL-TIME LIVE (3s)';
          if (dotEl) {
            dotEl.style.background = '#10b981';
            dotEl.style.boxShadow = '0 0 10px #10b981';
          }
        } else {
          btn.style.background = 'rgba(239, 68, 68, 0.15)';
          btn.style.borderColor = '#ef4444';
          btn.style.color = '#fca5a5';
          textEl.textContent = '⏸️ ĐÃ TẠM DỪNG LIVE';
          if (dotEl) {
            dotEl.style.background = '#ef4444';
            dotEl.style.boxShadow = 'none';
          }
        }
      },

      async loadLogs(isSilent = false) {
        if (this.loading) return;
        const tbody = document.getElementById('combat-logs-tbody');
        if (!isSilent && tbody) {
          tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 30px; color: #94a3b8;">Đang nạp dữ liệu đòn đánh...</td></tr>`;
        }

        const effectiveAdmin = this.adminSteamId || AdminPanel.currentAdminSteamId || AdminPanel.getActiveSteamId();
        if (!effectiveAdmin) return;
        this.loading = true;

        try {
          const hdrs = {
            'Content-Type': 'application/json',
            'x-steam-id': effectiveAdmin,
            'x-admin-steam-id': effectiveAdmin
          };
          const data = await App.readJSON(`${ST25API.routes.adminCombatLogs}?adminSteamId=${encodeURIComponent(effectiveAdmin)}`, { headers: hdrs });
          const logsList = Array.isArray(data.logs) ? data.logs : (Array.isArray(data) ? data : []);
          const signature = JSON.stringify(logsList);
          if (isSilent && signature === this.logsSignature) return;
          this.logsSignature = signature;

          // Cập nhật nhãn thời gian thực
          const timeClockEl = document.getElementById('live-combat-time-text');
          if (timeClockEl) {
            timeClockEl.textContent = `Cập nhật: ${new Date().toLocaleTimeString('vi-VN')}`;
          }

          // Kiểm tra xem có đòn đánh mới xuất hiện không
          if (logsList.length > 0) {
            const topLog = logsList[0];
            if (this.lastKnownTopLogId && this.lastKnownTopLogId !== topLog.id) {
              if (topLog.isAnomaly && topLog.flags && topLog.flags.length > 0) {
                App.showToast(`🚨 PHÁT HIỆN BẤT THƯỜNG MỚI: [${topLog.attacker?.name}] gây dame bất thường cho [${topLog.victim?.name}]!`, 'error');
              }
            }
            this.lastKnownTopLogId = topLog.id;
          }
          
          this.rawLogs = logsList.map(l => ({
            id: l.id,
            timestamp: l.timestamp,
            attacker: l.attacker || {},
            victim: l.victim || {},
            damageDealt: l.damageDealt ?? l.damage ?? 0,
            hitPart: l.hitPart || l.hitBox || 'Thân',
            distanceMeters: l.distanceMeters ?? l.distance ?? 0,
            speed: l.speed ?? l.attackerSpeed ?? (l.attacker ? l.attacker.speedKmh : 0) ?? 0,
            isAnomaly: l.isAnomaly !== undefined ? l.isAnomaly : (Array.isArray(l.flags) && l.flags.length > 0),
            flags: (l.flags || []).map(f => ({
              type: f.type,
              desc: f.desc || f.title || f.message || '',
              severity: f.severity || (f.level === 'danger' ? 'critical' : 'warning'),
              icon: f.icon || (f.level === 'danger' || f.severity === 'critical' ? '🚨' : '⚠️')
            }))
          }));

          const statsObj = data.summary || data.stats || {
            totalLogs: logsList.length,
            flaggedLogs: logsList.filter(l => l.isAnomaly).length,
            reachAnomalies: logsList.filter(l => (l.flags || []).some(f => f.type === 'REACH_HACK')).length,
            cleanLogs: logsList.filter(l => !l.isAnomaly).length
          };
          this.updateStats(statsObj);
          this.applyFilterAndRender();
        } catch (e) {
          console.error(e);
          if (e.status === 403) {
            this.stopLive();
            if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="padding:30px;text-align:center;color:#ef4444">Bạn không có quyền truy cập nhật ký chiến đấu.</td></tr>`;
            return;
          }
          if (!isSilent && tbody) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #ef4444; padding: 30px;">Lỗi kết nối máy chủ khi nạp nhật ký chiến đấu!</td></tr>`;
          }
        } finally {
          this.loading = false;
        }
      },

      updateStats(summary) {
        if (!summary) return;
        const totalHits = summary.totalLogs ?? summary.totalHits ?? 0;
        const flaggedHits = summary.flaggedLogs ?? summary.anomaliesCount ?? 0;
        const reachHits = summary.reachAnomalies ?? summary.reachCount ?? 0;
        const cleanHits = summary.cleanLogs ?? (totalHits - flaggedHits) ?? 0;

        const totalEl = document.getElementById('stat-total-hits');
        const flagEl = document.getElementById('stat-flagged-hits');
        const reachEl = document.getElementById('stat-reach-hits');
        const cleanEl = document.getElementById('stat-clean-hits');
        const badgeTab = document.getElementById('tab-combat-alert-badge');

        if (totalEl) totalEl.textContent = totalHits;
        if (flagEl) flagEl.textContent = flaggedHits;
        if (reachEl) reachEl.textContent = reachHits;
        if (cleanEl) cleanEl.textContent = cleanHits;

        if (badgeTab) {
          if (flaggedHits > 0) {
            badgeTab.textContent = `🚨 ${flaggedHits} Nghi Vấn`;
            badgeTab.style.display = 'inline-flex';
          } else {
            badgeTab.style.display = 'none';
          }
        }
      },

      setFilter(filterType) {
        this.currentFilter = filterType;
        const filterBtns = ['all', 'flagged', 'clean', 'ONE_SHOT', 'REACH_HACK', 'SPEED_HACK', 'GOD_MODE'];
        filterBtns.forEach(f => {
          const btn = document.getElementById(`btn-filter-${f.toLowerCase()}`);
          if (btn) {
            if (f === filterType) {
              btn.className = 'btn btn-primary btn-sm';
              btn.style.fontWeight = '700';
            } else {
              btn.className = 'btn btn-secondary btn-sm';
              btn.style.fontWeight = 'normal';
            }
          }
        });
        this.applyFilterAndRender();
      },

      search(keyword) {
        this.searchKeyword = (keyword || '').toLowerCase().trim();
        this.applyFilterAndRender();
      },

      applyFilterAndRender() {
        let list = [...this.rawLogs];

        // Lọc theo tag
        if (this.currentFilter === 'flagged') {
          list = list.filter(l => l.isAnomaly);
        } else if (this.currentFilter === 'clean') {
          list = list.filter(l => !l.isAnomaly);
        } else if (['ONE_SHOT', 'REACH_HACK', 'SPEED_HACK', 'GOD_MODE'].includes(this.currentFilter)) {
          list = list.filter(l => Array.isArray(l.flags) && l.flags.some(f => f.type === this.currentFilter));
        }

        // Lọc theo từ khóa tìm kiếm
        if (this.searchKeyword) {
          list = list.filter(l => {
            const txt = `${l.attacker?.steamId} ${l.attacker?.name} ${l.attacker?.species} ${l.victim?.steamId} ${l.victim?.name} ${l.victim?.species}`.toLowerCase();
            return txt.includes(this.searchKeyword);
          });
        }

        this.filteredLogs = list;
        this.renderTable();
      },

      renderTable() {
        const tbody = document.getElementById('combat-logs-tbody');
        if (!tbody) return;

        if (!this.filteredLogs.length) {
          tbody.innerHTML = `
            <tr>
              <td colspan="10" style="text-align: center; padding: 40px; color: #64748b;">
                Không tìm thấy đòn đánh nào phù hợp với bộ lọc hiện tại.
              </td>
            </tr>
          `;
          return;
        }

        tbody.innerHTML = this.filteredLogs.map((log, idx) => {
          const isSus = log.isAnomaly;
          const rowBg = isSus ? 'background: rgba(239, 68, 68, 0.08);' : '';
          
          const flagsHtml = (log.flags || []).map(f => {
            const cls = f.severity === 'critical' ? 'danger' : 'warning';
            return `<span class="flag-badge ${cls}" title="${f.desc}">${f.icon || '🚨'} ${f.desc}</span>`;
          }).join(' ');

          const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString('vi-VN') : '—';
          const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleDateString('vi-VN') : '';

          return `
            <tr style="${rowBg}">
              <td style="color: #64748b; font-weight: 700;">#${idx + 1}</td>
              <td style="font-size: 0.8rem; white-space: nowrap;">
                <strong style="color: #cbd5e1;">${timeStr}</strong><br>
                <small style="color: #64748b;">${dateStr}</small>
              </td>
              <td>
                <div style="font-weight: 700; color: #fff;">${log.attacker?.name || 'Vô Danh'}</div>
                <div style="font-size: 0.75rem; color: #fbbf24; font-family: monospace;">${log.attacker?.species || 'Dino'}</div>
                <small style="color: #64748b; font-family: monospace;">${log.attacker?.steamId || ''}</small>
              </td>
              <td>
                <div style="font-weight: 700; color: #fff;">${log.victim?.name || 'Vô Danh'}</div>
                <div style="font-size: 0.75rem; color: #38bdf8; font-family: monospace;">${log.victim?.species || 'Dino'}</div>
                <small style="color: #64748b; font-family: monospace;">${log.victim?.steamId || ''}</small>
              </td>
              <td>
                <span style="font-size: 1.05rem; font-weight: 800; color: ${isSus ? '#ef4444' : '#fbbf24'};">${log.damageDealt}</span>
                <small style="color: #94a3b8; display: block; font-size: 0.72rem;">Máu nạn nhân: ${log.victim?.hpAfter || 0}/${log.victim?.hpBefore || 0}</small>
              </td>
              <td>
                <span class="badge-slot" style="font-size: 0.75rem; padding: 2px 6px;">${log.hitPart || 'Thân'}</span>
              </td>
              <td>
                <strong style="color: ${log.distanceMeters > 7 ? '#ef4444' : '#10b981'}; font-size: 0.9rem;">${log.distanceMeters}m</strong>
              </td>
              <td>
                <span style="color: ${log.attacker?.speedKmh > 50 ? '#ef4444' : '#94a3b8'}; font-size: 0.85rem;">${log.attacker?.speedKmh || 0} km/h</span>
              </td>
              <td>
                ${flagsHtml || '<span class="flag-badge clean">🟢 Chuẩn Hợp Lệ</span>'}
              </td>
              <td style="text-align: right; white-space: nowrap;">
                ${isSus ? `
                  <button onclick="CombatInspector.takeAction('${log.id}', '${log.attacker?.steamId}', 'warn')" class="btn-action-sm" style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fcd34d;" title="Cảnh cáo">⚠️ Cảnh Cáo</button>
                  <button onclick="CombatInspector.takeAction('${log.id}', '${log.attacker?.steamId}', 'kick')" class="btn-action-sm btn-action-del" title="Kick khỏi server">👢 Kick</button>
                  <button onclick="CombatInspector.takeAction('${log.id}', '${log.attacker?.steamId}', 'ban')" class="btn-action-sm" style="background: #ef4444; color: #fff;" title="Ban vĩnh viễn">🔨 Ban</button>
                ` : `
                  <span style="color: #64748b; font-size: 0.8rem;">Đã an toàn</span>
                `}
              </td>
            </tr>
          `;
        }).join('');
      },

      async takeAction(logId, targetSteamId, action) {
        const actionNames = {
          warn: 'CẢNH CÁO người chơi',
          kick: 'KICK người chơi khỏi máy chủ',
          ban: 'BAN VĨNH VIỄN người chơi'
        };
        const actionDesc = actionNames[action] || action;
        if (!confirm(`Bạn có chắc chắn muốn thực hiện [${actionDesc}] đối với Steam ID ${targetSteamId}?`)) {
          return;
        }

        try {
          const hdrs = {
            'Content-Type': 'application/json',
            'x-steam-id': this.adminSteamId || AdminPanel.currentAdminSteamId,
            'x-admin-steam-id': this.adminSteamId || AdminPanel.currentAdminSteamId
          };
          const res = await fetch(ST25API.routes.adminCombatAction, {
            method: 'POST',
            headers: hdrs,
            body: JSON.stringify({
              adminSteamId: this.adminSteamId || AdminPanel.currentAdminSteamId,
              logId,
              targetSteamId,
              action
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            App.showToast(data.message, 'success');
            this.loadLogs();
          } else {
            App.showToast(data.error || 'Lỗi khi thực hiện hành động!', 'error');
          }
        } catch (e) {
          console.error(e);
          App.showToast('Lỗi kết nối máy chủ!', 'error');
        }
      }
    };

    document.addEventListener('DOMContentLoaded', () => {
      AdminPanel.init();
    });
  
