# Cấu trúc mã nguồn ST25

Luồng backend: `server.js → src/app.js → middleware → routes → controllers → models/api`.
Luồng giao diện: `pages → views/render.js → partials → HTML trả về trình duyệt → features`.

| Thư mục/file | Vai trò |
| --- | --- |
| `core/config.js` | Đường dẫn hệ thống, cổng web, nạp `.env`, địa chỉ IslePilot mặc định |
| `core/server-config.json` | Cấu hình máy chủ game, chức năng, quyền và tích hợp IslePilot |
| `core/web.js` | Cấu hình công khai cho trình duyệt |
| `core/auth.js` | Xác thực phiên Steam và cookie |
| `api/endpoints.js` | Danh sách URL API portal dùng chung cho backend/frontend |
| `api/upstream-endpoints.js` | URL IslePilot, gồm hàm tạo đường dẫn có Steam ID và ID tài nguyên |
| `api/islepilot-client.js` | Gọi IslePilot, timeout và cache |
| `models/` | Đọc/ghi cấu hình và dữ liệu portal |
| `controllers/` | Các handler theo chức năng: gara, skin, nhiệm vụ, chợ, hỗ trợ… |
| `controllers/context.js` | Các hàm nghiệp vụ dùng chung và trạng thái của một application |
| `middleware/` | Kiểm tra nguồn yêu cầu, phiên, giới hạn thao tác đồng thời và xử lý async |
| `routes/` | Đăng ký API và URL trang công khai |
| `pages/` | Toàn bộ trang HTML; `islepilot_*` là các bản HTML tham khảo đã có |
| `pages/skin-editor.html` | Trang chứa component chỉnh Skin IslePilot, nhúng vào `/skin.html` |
| `views/partials/` | Header/footer dùng chung |
| `views/render.js` | Ghép partial và giải quyết placeholder API |
| `features/` | JavaScript chức năng đã tách từ các trang HTML |

CSS, ảnh, thư viện và JavaScript dùng chung hiện có nằm trong `assets/`.
Plinko dùng `services/plinko-engine.js` cho xác suất/HMAC, `services/plinko.js` cho giao dịch và `models/plinko-store.js` cho nhật ký PostgreSQL. Chế độ thử chạy trong trình duyệt; giao dịch Lúa chỉ mở khi cấu hình database và cờ bật. Xem `../PLINKO_SETUP.md` để cấu hình và đối soát.
`src/features/*.js` được phục vụ qua `/assets/js/features/*.js`; cấu hình công khai và danh sách API được phục vụ qua `/assets/js/core.js` và `/assets/js/api/endpoints.js`.

## Thêm hoặc sửa trang

1. Tạo/sửa `src/pages/ten-trang.html`.
2. Dùng `<!-- include:header -->` và `<!-- include:footer -->` cho bố cục chung.
3. Đưa logic riêng vào `src/features/ten-trang.js`, tải bằng `<script src="assets/js/features/ten-trang.js"></script>`.
4. Tải `assets/js/core.js` và `assets/js/api/endpoints.js` trước các script chức năng.
5. Gọi API bằng `ST25API.routes.tenEndpoint`; dùng `ST25API.url(path, params)` để tạo query.
6. Với link API trong HTML, dùng `{{api:playerSteamLogin}}?redirect=/ten-trang.html`.

Tên file tự ánh xạ sang URL `/ten-trang.html`. Các URL cũ và thư mục tài nguyên công khai giữ nguyên. URL `/pages/ten-trang.html` chuyển hướng sang URL chuẩn để liên kết tương đối luôn đúng.

## Thêm API

Thêm đường dẫn vào `api/endpoints.js`, thêm handler trong controller chức năng, rồi đăng ký controller trong `routes/api.js`. Controller nhận các phụ thuộc từ application context. Với API IslePilot, thêm đường dẫn/hàm vào `api/upstream-endpoints.js` và gọi qua client.

## Chạy và triển khai

Chạy `npm start` hoặc `node server.js` từ thư mục dự án `aaa`. Giao diện cần đi qua server để ghép header/footer. Vercel chạy cùng entry point `server.js` và đóng gói `src/` cùng `assets/`.

`.env` đặt tại thư mục `aaa`. Biến môi trường hosting/shell được ưu tiên khi nạp `.env`; `ISLEPILOT_API_BASE_URL` có thể ghi đè địa chỉ upstream. Token và `SESSION_SECRET` thuộc cấu hình server, không đưa vào `core/web.js` hoặc API đường dẫn công khai.

Chạy `npm test` để kiểm tra cú pháp, route, layout, asset, quyền truy cập và chức năng. Browser audit dùng dữ liệu giả lập và chặn giao dịch thật.

Các trang dùng `App.readJSON` hoặc `App.readResponse` cho API đọc: request trùng đang chạy được gộp, thời hạn chờ 10 giây bao gồm tải body. `readResponse` giữ HTTP status và cung cấp body riêng cho mỗi caller. POST vẫn chạy riêng, không được gộp hoặc tự gửi lại. Client IslePilot phía server gộp GET thông thường trong cùng tiến trình; GET yêu cầu dữ liệu mới (`bypassCache`) chạy độc lập. Cache được phân biệt theo cấu hình upstream, và `clearPlayerCache` vô hiệu cả cache lẫn khả năng ghi cache của GET cũ đang chạy. Gara và Skin gọi helper này sau thao tác thay đổi. Cơ chế này không gộp request giữa các instance Vercel khác nhau.

## Trình chỉnh Skin IslePilot

`features/skin-layout.js` sắp xếp lại các field và callback của component gốc theo bố cục Skin Designer: ảnh chọn loài phía trên, màu/họa tiết bên trái, mô hình ở giữa, thông số/áp dụng/preset bên phải. Adapter JSX trong `features/islepilot-skin.js` chỉ chuyển bố cục root của SkinEditor; không tạo bộ state màu hoặc API thứ hai. Trên tablet, sidebar chuyển xuống thành một hàng; trên điện thoại, mô hình chuyển lên trước bảng màu. Glitch bị khóa cả ở component (`glitchEnabled:false`) và API (kênh RGBA chỉ nhận 0–1). Phí áp dụng vẫn là 10 Lúa.

`assets/vendor/islepilot-skin/client.js` chứa các module client gốc từ bản lưu trong `reference/`. `islepilot-skin-runtime.js` nạp component độc lập; `features/islepilot-skin.js` nối phiên Steam và endpoint của portal. HTML đã lưu, dữ liệu phiên, script extension và analytics không được đưa vào trang đang chạy. `reference/` được Git bỏ qua.

Model/texture nằm trong `assets/vendor/islepilot-skin/cdn/skinviewer/`, phục vụ qua `/cdn/skinviewer/`. Vercel phục vụ các file này như tài nguyên static, tách khỏi function máy chủ. Máy Node thông thường phục vụ bằng Express. `api/skin-payload.js` kiểm tra payload trước khi chuyển nguyên các kênh màu linear đến IslePilot; token vẫn ở máy chủ.

Kiểm tra trình duyệt: `node tests/islepilot-skin-browser.cjs`. Xem [hướng dẫn Skin](../tests/SKIN_PREVIEW.md).

Viewer dùng `IntersectionObserver` và `visibilitychange` để chuyển render loop sang `never` khi canvas nằm ngoài màn hình hoặc tab bị ẩn; khi hiển thị lại, loop trở về `always`. Patch nằm trong `tools/adapt-skin-viewer.cjs`, tái tạo bằng `node tools/import-islepilot-skin.cjs`; chất lượng texture, model, DPR và shader không thay đổi trong tối ưu này. Browser audit đếm lệnh vẽ WebGL để xác nhận dừng và tiếp tục sau khi cuộn trang. Adapter dựng phí áp dụng bằng React thay vì quét DOM qua MutationObserver. Các thông báo người dùng và chiều cao trùng lặp không gây render/cập nhật iframe lại.
