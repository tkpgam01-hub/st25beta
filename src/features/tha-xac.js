
    let currentBalance = 100;

    async function loadCarcassData() {
      try {
        const [typesRes, marketRes] = await Promise.all([
          App.readResponse(ST25API.routes.carcassTypes),
          App.readResponse(ST25API.routes.marketData)
        ]);
        const typesData = await typesRes.json();
        const marketData = await marketRes.json();

        currentBalance = typesData.balance !== undefined ? typesData.balance : marketData.balance;
        document.getElementById('carcass-lua-val').textContent = `${currentBalance.toLocaleString('vi-VN')} Lúa 🌾`;

        const types = Array.isArray(typesData) ? typesData : (typesData.types || []);
        const grid = document.getElementById('carcass-grid');
        grid.innerHTML = types.map(c => `
          <div class="carcass-card">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="font-size: 2.5rem;">${c.icon}</span>
                <span class="rule-badge badge-allow" style="font-size: 0.85rem; font-weight: 700; color: #fbbf24;">
                  ${c.price} Lúa 🌾
                </span>
              </div>
              <h3 style="color: #fff; font-size: 1.2rem; margin-bottom: 6px;">${c.name}</h3>
              <div style="display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap;">
                <span class="rule-badge badge-allow" style="font-size: 0.75rem; color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);">
                  🦖 ${c.species}
                </span>
                <span class="rule-badge badge-allow" style="font-size: 0.75rem; color: #10b981; border-color: rgba(16, 185, 129, 0.4);">
                  📈 ${c.growthText || '100%'} Growth
                </span>
              </div>
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 12px;">${c.desc}</p>
              
              <div style="margin-bottom: 16px;">
                <span class="nutrient-tag">🥗 ${c.nutrients}</span>
              </div>
            </div>

            <button onclick="orderCarcass('${c.id}', ${c.price}, '${c.name}')" class="btn btn-primary" style="width: 100%; font-weight: 700;">
              🥩 Thả Xác Ngay (${c.price} Lúa)
            </button>
          </div>
        `).join('');

        // Hiển thị lịch sử các đơn thả xác đã từng đặt
        const orders = typesData.orders || [];
        const historyList = document.getElementById('carcass-history-list');
        if (orders.length > 0) {
          historyList.innerHTML = orders.map(ord => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; font-size: 0.85rem;">
              <div>
                <strong style="color: #fff; display: block;">${ord.carcassName} (-${ord.price} Lúa 🌾)</strong>
                <small style="color: #10b981;">${ord.note}</small>
              </div>
              <div style="text-align: right;">
                <span class="rule-badge badge-allow" style="font-size: 0.75rem;">${ord.status}</span>
                <div style="color: var(--text-muted); font-size: 0.75rem; margin-top: 4px;">${ord.orderedAt}</div>
              </div>
            </div>
          `).join('');
        }

      } catch (e) {
        console.error('Error loading carcass data:', e);
      }
    }

    async function orderCarcass(carcassId, price, name) {
      if (orderCarcass.pending) return;
      if (currentBalance < price) {
        App.showToast(`Bạn không đủ Lúa! Cần ${price} Lúa 🌾 (Hiện có: ${currentBalance}).`, 'error');
        return;
      }

      if (!confirm(`Xác nhận dùng ${price} Lúa 🌾 để thả [${name}] tại toạ độ hiện tại của bạn?`)) return;

      orderCarcass.pending = true;
      try {
        const res = await fetch(ST25API.routes.carcassOrder, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ carcassId })
        });
        const result = await res.json();
        if (res.ok) {
          App.showToast(result.message, 'success');
          currentBalance = result.newBalance;
          document.getElementById('carcass-lua-val').textContent = `${currentBalance.toLocaleString('vi-VN')} Lúa 🌾`;

          // Add to history
          const historyList = document.getElementById('carcass-history-list');
          const orderDiv = document.createElement('div');
          orderDiv.style = "display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; font-size: 0.85rem;";
          orderDiv.innerHTML = `
            <div>
              <strong style="color: #fff; display: block;">${result.order.carcassName} (-${result.order.price} Lúa 🌾)</strong>
              <small style="color: #10b981;">${result.order.note}</small>
            </div>
            <div style="text-align: right;">
              <span class="rule-badge badge-allow" style="font-size: 0.75rem;">${result.order.status}</span>
              <div style="color: var(--text-muted); font-size: 0.75rem; margin-top: 4px;">${result.order.orderedAt}</div>
            </div>
          `;
          if (historyList.querySelector('.text-muted')) historyList.innerHTML = '';
          historyList.prepend(orderDiv);

        } else {
          App.showToast(result.error || 'Đặt thả xác thất bại!', 'error');
        }
      } catch (e) {
        App.showToast('Lỗi mạng khi gọi thả xác!', 'error');
      } finally {
        orderCarcass.pending = false;
      }
    }

    document.addEventListener('DOMContentLoaded', loadCarcassData);
  
