const ST25API = require('../api/endpoints');
// support feature HTTP handlers. Dependencies are supplied by the application.
module.exports = function register(app, context) {
  const {getPortalData, savePortalData, getRequestSteamId} = context;


// 13. Hệ Thống Hỗ Trợ & Cứu Kẹt (Support & Unstuck)
app.post(ST25API.routes.supportUnstuck, (req, res) => {
  const steamId = getRequestSteamId(req);
  if (!steamId) {
    return res.status(401).json({ error: "Vui lòng đăng nhập Steam để sử dụng Cứu Kẹt GPS!" });
  }
  res.json({
    success: true,
    message: `Hệ thống đã nhận lệnh Cứu Kẹt GPS cho tài khoản ${steamId}. Khủng long của bạn được dịch chuyển đến vùng an toàn (Rừng Dừa / Đồng Cỏ Cứu Trợ). Vui lòng relog game sau 30 giây!`
  });
});


app.post(ST25API.routes.supportTicket, (req, res) => {
  const { targetPlayer, timeReport, locationReport, videoUrl, violationRule, details } = req.body;

  if (!details || !violationRule) {
    return res.status(400).json({ error: "Vui lòng nhập điều luật vi phạm và nội dung tóm tắt!" });
  }

  const data = getPortalData();
  const steamId = getRequestSteamId(req) || "Khách ẩn danh";

  const newTicket = {
    id: `TK-${Math.floor(1000 + Math.random() * 9000)}`,
    senderSteamId: steamId,
    targetPlayer: targetPlayer || "Chưa rõ SteamID",
    timeReport: timeReport || new Date().toLocaleString('vi-VN'),
    locationReport: locationReport || "Không rõ toạ độ",
    videoUrl: videoUrl || "Đính kèm trên Discord",
    violationRule: violationRule,
    details: details,
    status: "Đang Tiếp Nhận (BQT đang xem log)",
    createdAt: new Date().toLocaleString('vi-VN')
  };

  data.tickets.unshift(newTicket);
  savePortalData(data);

  res.json({
    success: true,
    message: `Đã gửi Ticket tố cáo mã #${newTicket.id} thành công! Ban Quản Trị ST25 sẽ đối chiếu log server và phản hồi trong 24h theo Điều 4.`,
    ticket: newTicket
  });
});


app.get(ST25API.routes.supportMyTickets, (req, res) => {
  const data = getPortalData();
  const steamId = getRequestSteamId(req);
  if (!steamId) return res.status(401).json({ error: 'Chưa đăng nhập Steam.' });
  const userTickets = data.tickets.filter(t => t.senderSteamId === steamId);
  res.json(userTickets);
});
};
