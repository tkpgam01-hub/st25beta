# ST25 Skin Studio 3D

> Tài liệu lưu trữ của phiên bản cũ. Trang chỉnh skin hiện đã bỏ mô hình 3D và thanh độ trưởng thành. Xem [tài liệu hiện tại](SKIN_PREVIEW.md) để kiểm tra preview và phối màu.

Phần chỉnh skin sử dụng 17 mô hình minh họa 3D được tạo bằng mã nguồn của dự án. Không sao chép mô hình hoặc texture của trang tham khảo hay của game. Đây là bản phối màu minh họa, không phải phép xem trước chính xác skin trong The Isle.

## Tính năng

Ba trang gốc `triceratops.html`, `troodon.html`, `tyrannosaurus.html` từ thư mục `DINO HTML` được giữ tại `src/pages/illustrations/`. Đây là minh họa chuyển động từ ảnh bằng canvas 2D. Nút **Minh họa chuyển động** trong preview chọn đúng file theo loài; nút **Mô hình 3D** quay lại preview phối màu. Ảnh gốc giữ màu có sẵn. Loài chưa có file dùng preview 3D/2D hiện tại.

Danh mục loài ở `assets/js/skin-illustrations-catalog.js`. Chỉ tải iframe khi chọn chế độ chuyển động và khung preview đang hiện. Hủy iframe khi chuyển chế độ/loài, sang Kho skin/Cửa hàng, cuộn ra ngoài hoặc ẩn tab; preview 3D dừng render trong chế độ chuyển động.

Kiểm tra nhập minh họa: `$env:ST25_ILLUSTRATION_AUDIT='1'; node tests/redesign-browser-audit.cjs`. Audit kiểm tra ba loài ở năm kích thước, file/ảnh/hoạt ảnh đúng, dừng và khôi phục 3D, loài chưa có file, hủy iframe khi ẩn workspace. Kết quả tại `tests/skin-motion-results.json`.

- Xoay bằng kéo chuột/cảm ứng, zoom bằng cuộn hoặc chụm hai ngón tay.
- Phím mũi tên để xoay; cộng/trừ để zoom khi canvas được focus.
- Góc studio, ngang, chính diện; xoay tự động bật/tắt.
- Camera tự căn mô hình theo loài và tỉ lệ màn hình.
- Mười vùng màu, biến thể, năm kiểu hoa văn, giới tính, trưởng thành và preset đồng bộ từ bảng màu hiện tại.
- Tùy chọn chất lượng, ánh sáng, nền; xuất ảnh PNG nền trong suốt.
- Có thể phối màu, lưu preset trên thiết bị và xem 3D khi chưa đăng nhập. Áp dụng trong game vẫn qua xác thực/API hiện tại.
- Thiết bị không hỗ trợ WebGL2 hoặc tải module lỗi sử dụng preview 2D. Khi mất context đồ họa, hiện lại 2D; khôi phục context sẽ trở lại 3D. Có nút thử tải lại.

## Tối ưu

Three.js 0.180.0 và OrbitControls được phục vụ bằng file cục bộ, giữ giấy phép MIT tại `assets/vendor/three/LICENSE`. Thư viện và hình học chỉ được tải khi vùng preview sắp xuất hiện, chỉ trên trang skin. Preview không cần truy cập CDN.

Chỉ tạo hình học của loài đang chọn; giải phóng hình học cũ khi đổi loài. Vật liệu, palette shader và texture vảy nhỏ được dùng lại. Đổi màu không tạo lại mô hình hoặc compile lại shader. Các thay đổi render được gộp vào một animation frame.

Không có vòng render khi đứng yên. Dừng render khi ngoài viewport, trang bị ẩn hoặc workspace bị chuyển sang Kho skin/Cửa hàng. Khi bật xoay tự động mới chạy animation. Pixel ratio mặc định giới hạn 1.25 trên khung nhỏ/1.5 trên khung lớn, chế độ tiết kiệm giới hạn 1; drawing buffer tối đa khoảng 2.2 triệu pixel. Không có realtime shadow pass, postprocessing hoặc tải mô hình của tất cả các loài cùng lúc.

## Tổ chức mã

- `assets/js/skin-models.mjs`: profile và hình học minh họa của 17 loài; quản lý giải phóng geometry.
- `assets/js/skin-viewer.mjs`: renderer, palette shader, camera, OrbitControls, lifecycle và xuất ảnh.
- `assets/js/skin-3d.js`: lazy bootstrap, toolbar, fallback và đồng bộ `getSkinPayload()`.
- `assets/css/skin-3d.css`: bố cục và điều khiển desktop/mobile.
- `assets/js/skin.js`: giữ logic preset/mã skin/API và gọi sync 3D khi đổi trạng thái.

Khi có mô hình game được phép sử dụng, cần thêm GLTFLoader và cách ánh xạ channel/texture mask phù hợp với file đó. Renderer đã tách khỏi bộ sinh hình học để thay nguồn mô hình; bản hiện tại chưa có GLB importer và không có UV/mask gốc của game.

## Kiểm tra

`npm test` chạy kiểm tra hình học của tất cả 17 loài cùng các regression backend/frontend có sẵn. Kiểm tra browser dùng API giả lập, chặn giao dịch thật:

```powershell
$env:ST25_3D_AUDIT='1'
node tests/redesign-browser-audit.cjs

# Khách chưa đăng nhập
$env:ST25_3D_GUEST='1'
node tests/redesign-browser-audit.cjs

# Không có WebGL
$env:ST25_3D_FALLBACK='1'
node tests/redesign-browser-audit.cjs
```

Xóa biến môi trường thử nghiệm sau khi chạy. Có thể dùng `ST25_SKIN_AUDIT=1` cùng audit 3D để kiểm tra thêm các chức năng mã màu, preset và bảo vệ thao tác đồng thời.

Kích thước kiểm tra: 1440, 1024, 768, 390 và 320px. Báo cáo trong `skin-3d-results.json`, `skin-3d-guest-results.json` và `skin-3d-fallback-results.json`. Các kiểm tra này không xác nhận FPS trên GPU/điện thoại thực, màu render chính xác trong game hoặc giao dịch IslePilot thật.

## Triển khai

Deploy `server.js`, `vercel.json`, to?n b? `src/` v? `assets/`. Trang ngu?n ? `src/pages/skin.html`; Express gh?p header/footer khi ph?c v? URL `/skin.html`. Vercel ch?y c?ng ?ng d?ng Express. Kh?ng c?n build frontend ho?c c?i th? vi?n 3D ? runtime.
