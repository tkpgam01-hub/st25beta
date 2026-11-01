
    let myCode = '';
    let isUserLoggedIn = false;

    function getAuthHeaders() {
      const headers = { 'Content-Type': 'application/json' };
      try {
        const saved = JSON.parse(localStorage.getItem('st25_steam_user') || '{}');
        if (saved && saved.steam_id) {
          headers['x-steam-id'] = saved.steam_id;
        }
      } catch (_) {}
      return headers;
    }

    async function loadReferralData() {
      try {
        const res = await App.readResponse(ST25API.routes.referralMe, {
          headers: getAuthHeaders(),
          credentials: 'include'
        });
        const data = await res.json();

        isUserLoggedIn = !!data.loggedIn;

        const codeEl = document.getElementById('my-ref-code');
        const copyCodeBtn = document.getElementById('btn-copy-code');
        const copyLinkBtn = document.getElementById('btn-copy-link');
        const lockedNotice = document.getElementById('code-locked-notice');

        if (data.loggedIn && data.referralCode) {
          myCode = data.referralCode;
          codeEl.textContent = myCode;
          copyCodeBtn.style.display = 'inline-block';
          copyLinkBtn.style.display = 'inline-block';

          if (data.isCodeLocked) {
            codeEl.style.textDecoration = 'line-through';
            codeEl.style.color = '#ef4444';
            if (lockedNotice) lockedNotice.style.display = 'block';
          } else {
            codeEl.style.textDecoration = 'none';
            codeEl.style.color = '#fff';
            if (lockedNotice) lockedNotice.style.display = 'none';
          }
        } else {
          myCode = '';
          codeEl.innerHTML = `<span style="font-size: 1.2rem; color: #94a3b8;">Chưa Đăng Nhập Steam</span>`;
          codeEl.style.textDecoration = 'none';
          copyCodeBtn.style.display = 'none';
          copyLinkBtn.style.display = 'none';
          if (lockedNotice) lockedNotice.style.display = 'none';
        }

        document.getElementById('stat-count').textContent = data.invitedCount || 0;
        document.getElementById('stat-earned').textContent = `${(data.earnedLua || 0).toLocaleString('vi-VN')} Lúa 🌾`;
        document.getElementById('stat-balance').textContent = `${(data.currentBalance || 0).toLocaleString('vi-VN')} Lúa 🌾`;

        if (data.invitedBy) {
          const formBox = document.getElementById('claim-code-form');
          formBox.innerHTML = `
            <div style="background: rgba(16, 185, 129, 0.12); border: 1.5px solid #10b981; padding: 16px; border-radius: 8px; color: #10b981; font-weight: 600; text-align: center;">
              ✅ Bạn đã kích hoạt mã giới thiệu [<strong>${data.invitedBy}</strong>] và đã nhận +20 Lúa 🌾 vào ví!
            </div>
          `;
        }

      } catch (e) {
        console.error('Error loading referral info:', e);
      }
    }

    async function generateNewInviteCode() {
      try {
        App.showToast('Đang tạo mã mời mới...', 'info');
        const res = await fetch(ST25API.routes.referralGenerateCode, {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include'
        });
        const data = await res.json();
        if (res.ok && data.success) {
          App.showToast(data.message, 'success');
          await loadReferralData();
        } else {
          App.showToast(data.error || 'Không thể tạo mã mời mới!', 'error');
        }
      } catch (e) {
        App.showToast('Lỗi kết nối máy chủ!', 'error');
      }
    }

    function copyRefCode() {
      if (!myCode) {
        App.showToast('Vui lòng đăng nhập Steam trước để lấy mã!', 'warning');
        return;
      }
      navigator.clipboard.writeText(myCode).then(() => {
        App.showToast('Đã sao chép mã giới thiệu vào bộ nhớ tạm!', 'success');
        const btn = document.getElementById('btn-copy-code');
        btn.textContent = '✅ Đã Chép!';
        setTimeout(() => btn.textContent = '📋 Sao Chép Mã', 2000);
      });
    }

    function copyShareLink() {
      if (!myCode) {
        App.showToast('Vui lòng đăng nhập Steam trước để tạo link!', 'warning');
        return;
      }
      const link = `${window.location.origin}/lien-ket-steam.html?ref=${myCode}`;
      navigator.clipboard.writeText(link).then(() => {
        App.showToast('Đã sao chép link mời nhanh vào bộ nhớ tạm!', 'success');
        const btn = document.getElementById('btn-copy-link');
        btn.textContent = '✅ Đã Chép Link!';
        setTimeout(() => btn.textContent = '🔗 Sao Chép Link Giới Thiệu Nhanh', 2000);
      });
    }

    async function handleClaimCode(e) {
      e.preventDefault();
      const codeInput = document.getElementById('friend-code');
      const code = codeInput.value.trim();
      const btn = document.getElementById('btn-submit-claim');

      if (!code) {
        App.showToast('Vui lòng nhập mã giới thiệu hoặc Giftcode!', 'warning');
        return;
      }

      btn.disabled = true;
      btn.textContent = '⏳ Đang kiểm tra & cộng Lúa...';

      try {
        const res = await fetch(ST25API.routes.referralClaim, {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({ code })
        });
        const result = await res.json();
        if (res.ok) {
          App.showToast(result.message || 'Kích hoạt mã thành công! Đã cộng Lúa vào ví.', 'success');
          codeInput.value = '';
          await loadReferralData();
        } else {
          App.showToast(result.error || 'Kích hoạt mã thất bại!', 'error');
        }
      } catch (e) {
        App.showToast('Lỗi mạng khi kết nối máy chủ!', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '🌾 Kích Hoạt Mã Mời (+20 Lúa) 🚀';
      }
    }

    document.addEventListener('DOMContentLoaded', loadReferralData);
  
