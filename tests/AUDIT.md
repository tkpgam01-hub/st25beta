# Kết quả rà soát và sửa lỗi

Đã kiểm tra cú pháp JavaScript trong toàn bộ mã nguồn và HTML, JSON, liên kết và tài nguyên nội bộ của các trang portal. Bốn file `islepilot_*.html` là bản xuất tham khảo: kiểm tra script nhúng, không xác nhận dịch vụ bên ngoài còn hoạt động.

Các lỗi đã sửa:

- Express phục vụ cả thư mục dự án, làm lộ cấu hình/token, dữ liệu người dùng và mã nguồn. Giờ chỉ phục vụ HTML và `assets`.
- Cookie Steam ID, header, query và body có thể giả mạo danh tính. Giờ chỉ phiên có chữ ký mới xác định tài khoản; quyền admin cũng lấy từ phiên.
- Callback Steam trước đây không xác minh OpenID. Giờ kiểm tra state, return URL, các trường được ký và xác nhận trực tiếp với Steam.
- Đăng nhập bằng cách nhập Steam ID không chứng minh chủ tài khoản. Nút cũ chuyển sang đăng nhập Steam.
- API hỗ trợ và đội nhóm dùng tài khoản mẫu khi chưa đăng nhập; gara cho khách xem tài khoản qua query. Đã loại bỏ các đường truy cập này.
- Yêu cầu thay đổi dữ liệu từ origin khác bị chặn. Cookie phiên có HttpOnly, SameSite và Secure khi triển khai production.
- Yêu cầu đồng thời của cùng tài khoản bị chặn trong một tiến trình; các lỗi async được chuyển về middleware lỗi.
- API upstream có timeout; lỗi upstream không còn tạo trạng thái máy chủ online hoặc làm tài khoản bị coi là đã đăng xuất.
- Khi API số dư/giao dịch lỗi, backend không còn tự cập nhật ví nội bộ rồi báo thành công.
- Escape dữ liệu tên loài, giới tính, vai trò và lựa chọn dịch chuyển khi dựng HTML.
- Import server không tự mở cổng hoặc khởi chạy tác vụ quét giao dịch.
- Route Vercel của trang sòng bạc đi qua kiểm tra bật/tắt ở backend.

Kiểm tra đã chạy bằng Node runtime có sẵn trong VS Code:

- `tests/project-audit.cjs`
- `tests/backend-regression.cjs`
- `tests/frontend-regression.cjs`
- `tests/home-player-regression.cjs`
- `tests/quests-layout-regression.cjs`
- `tests/redesign-static-check.cjs`
- `tests/redesign-browser-audit.cjs`: 15 trang desktop và 5 trang mobile, không có lỗi runtime, ảnh hỏng hoặc tràn ngang.

Chạy lại các kiểm tra tự động bằng `npm test` khi Node.js đã được cài trong PATH.

## Cấu hình triển khai

Thiết lập `SESSION_SECRET` bằng chuỗi ngẫu nhiên dài và giữ nguyên giữa các lần deploy/instance. Production/Vercel sẽ từ chối đăng nhập khi thiếu biến này. Máy local tự tạo secret; khởi động lại sẽ yêu cầu đăng nhập lại.

Thiết lập `PUBLIC_ORIGIN` bằng URL HTTPS của portal, không có dấu `/` cuối. `ISLEPILOT_API_TOKEN` được ưu tiên hơn token trong file cấu hình. Mẫu biến nằm ở `.env.example`; ứng dụng không tự đọc `.env`.

Token cũ từng nằm trong mã nguồn và cấu hình có thể truy cập công khai. Cần thu hồi token cũ trong IslePilot và đặt token mới trên hosting. Việc này chưa được thực hiện vì không có quyền truy cập dashboard.

Giới hạn: các kiểm tra dùng dữ liệu giả lập, không thực hiện giao dịch hoặc đăng nhập Steam thật. Khóa đồng thời chỉ có hiệu lực trong một tiến trình; nhiều instance cần khóa và lưu trữ dùng chung. Giao dịch gồm nhiều lệnh upstream chưa có bảo đảm nguyên tử. JSON và bộ nhớ serverless chưa bảo đảm lưu dữ liệu bền vững giữa các instance/deploy; cần cơ sở dữ liệu để có bảo đảm đó.
