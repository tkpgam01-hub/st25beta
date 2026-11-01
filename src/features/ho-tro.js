
    async function loadMyTickets() {
      try {
        const res = await App.readResponse(ST25API.routes.supportMyTickets);
        const tickets = await res.json();

        const badge = document.getElementById('ticket-count-badge');
        badge.textContent = `${tickets.length} Ticket`;

        const container = document.getElementById('tickets-list-container');
        if (tickets.length === 0) {
          container.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 40px 10px;">Bạn chưa gửi ticket nào.</div>';
          return;
        }

        container.innerHTML = tickets.map(t => `
          <div class="ticket-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <strong style="color: #fbbf24;">Mã #${t.id}</strong>
              <span class="rule-badge badge-warn" style="font-size: 0.75rem;">${t.status}</span>
            </div>
            <div style="color: #fff; font-weight: 600; margin-bottom: 4px;">${t.violationRule}</div>
            <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 6px;">
              <div>• Bị tố cáo: <strong>${t.targetPlayer}</strong></div>
              <div>• Thời gian: ${t.timeReport} | Vị trí: ${t.locationReport}</div>
            </div>
            <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; color: #cbd5e1; font-size: 0.8rem; margin-bottom: 8px;">
              "${t.details}"
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted);">
              <a href="${t.videoUrl}" target="_blank" style="color: #38bdf8;">Xem Video Bằng Chứng ↗</a>
              <span>${t.createdAt}</span>
            </div>
          </div>
        `).join('');

      } catch (e) {
        console.error('Error loading tickets:', e);
      }
    }

    async function handleUnstuck() {
      if (!confirm('Bạn có chắc chắn muốn gửi lệnh cứu kẹt GPS cho khủng long hiện tại? Khủng long sẽ được đưa về vị trí an toàn.')) return;

      try {
        const res = await fetch(ST25API.routes.supportUnstuck, { method: 'POST' });
        const result = await res.json();
        if (res.ok) {
          App.showToast(result.message, 'success');
        } else {
          App.showToast(result.error || 'Cứu kẹt thất bại!', 'error');
        }
      } catch (e) {
        App.showToast('Lỗi mạng khi gửi cứu kẹt!', 'error');
      }
    }

    async function handleSendTicket(e) {
      e.preventDefault();
      const targetPlayer = document.getElementById('target-player').value.trim();
      const timeReport = document.getElementById('time-report').value.trim();
      const locationReport = document.getElementById('location-report').value.trim();
      const violationRule = document.getElementById('violation-rule').value;
      const videoUrl = document.getElementById('video-url').value.trim();
      const details = document.getElementById('ticket-details').value.trim();

      try {
        const res = await fetch(ST25API.routes.supportTicket, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetPlayer, timeReport, locationReport, violationRule, videoUrl, details })
        });
        const result = await res.json();
        if (res.ok) {
          App.showToast(result.message, 'success');
          document.getElementById('ticket-form').reset();
          loadMyTickets();
        } else {
          App.showToast(result.error || 'Gửi ticket thất bại!', 'error');
        }
      } catch (e) {
        App.showToast('Lỗi mạng khi gửi ticket!', 'error');
      }
    }

    document.addEventListener('DOMContentLoaded', loadMyTickets);
  
