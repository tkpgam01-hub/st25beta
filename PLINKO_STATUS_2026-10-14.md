# Ghi chú Plinko — 14/10/2026

## Cách triển khai

- Trang người dùng: https://www.st25.io.vn/plinko.html
- Người chơi đăng nhập Steam; giao diện đọc số dư Lúa trong game.
- Chọn số Lúa mỗi bóng (1–500), mức rủi ro và số hàng (8–16).
- Máy chủ tạo lượt chơi, tính kết quả, trừ Lúa và cộng thưởng vào cùng ví game.
- PostgreSQL lưu lượt chơi, trạng thái giao dịch và dữ liệu xác minh kết quả.
- Hỗ trợ thủ công/tự động, tối đa 20 bóng đang xử lý. Yêu cầu cập nhật ví chạy tuần tự; hoạt ảnh có thể chạy đồng thời.
- Lượt chưa xác nhận hoặc cần đối soát sẽ khóa lượt tiếp theo để tránh giao dịch trùng.

## Điều kiện hoạt động

- Hosting của đúng dự án sở hữu www.st25.io.vn cần có kết nối PostgreSQL (`PLINKO_DATABASE_URL` hoặc `PORTAL_DATABASE_URL`).
- Cần quyền IslePilot đọc số dư và cập nhật currency, cùng cấu hình đăng nhập Steam hợp lệ.
- Bật `PLINKO_ENABLED=true`; kiểm tra có giới hạn `PLINKO_TEST_STEAM_IDS` hay không.
- Triển khai lại, kiểm tra API trạng thái và điều kiện ví của tài khoản đăng nhập trước khi kết luận chơi được.

## Lỗi hiện tại đã xác nhận

- Kiểm tra công khai ngày 14/10/2026: `/api/plinko/state` trên www.st25.io.vn trả HTTP 200, `ready:false`, thông báo “Plinko đang tạm đóng. Vui lòng thử lại sau.”
- Đây là nguyên nhân khóa nút phía máy chủ; chưa xác định chính xác cấu hình nào thiếu vì chưa truy cập được hosting.
- Bản mới từng ghi trong hồ sơ tại https://st25-vietnam.vercel.app/api/plinko/state hiện trả HTTP 404 `DEPLOYMENT_NOT_FOUND`.
- Hai hồ sơ xác thực Vercel cục bộ (`vercel-auth`, `vercel-st25-auth`) đều trả HTTP 403 `invalidToken:true` khi kiểm tra quyền truy cập.
- Không có trình duyệt kết nối trong phiên này; mở bằng in-app browser cũng không khả dụng.

## Thay đổi cục bộ trong phiên này

- `assets/css/plinko.css`: trên màn hình tối đa 650px, đưa phần điều khiển lên trước bảng bóng và đưa nút Thả bóng lên đầu form.
- `src/pages/plinko.html`: thêm phiên bản URL CSS `20261014-visible-play` để làm mới cache khi triển khai.
- Thay đổi này chỉ xử lý bố cục trên điện thoại, không giải quyết trạng thái khóa từ máy chủ. Chưa triển khai lên website.
- `tests/plinko-regression.cjs` đã đạt với ví/database giả lập; không phát sinh giao dịch ví thật.
- Kiểm tra trình duyệt chưa chạy được do Headless Chrome không khả dụng.

## Việc cần làm tiếp

1. Khôi phục phiên đăng nhập Vercel và quyền truy cập đúng dự án đang sở hữu www.st25.io.vn; không yêu cầu gửi token hay mật khẩu vào chat.
2. Kiểm tra cấu hình triển khai, database, quyền ví và giới hạn tài khoản thử nghiệm để tìm nguyên nhân `ready:false`.
3. Sửa cấu hình cần thiết và triển khai đúng dự án trong phạm vi Plinko, bảo toàn dữ liệu lịch sử và số dư.
4. Xác minh API trả sẵn sàng, tài khoản đăng nhập đọc được ví và nút Thả bóng hoạt động. Không tự bỏ qua khóa đối soát hoặc chạy thêm giao dịch ví thật khi chưa có phạm vi kiểm thử được cho phép.

Không ghi thông tin bí mật vào tài liệu này. Chưa bật lại được chức năng trên trang chính.
