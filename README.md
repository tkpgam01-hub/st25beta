# 🦖 DINO VIETNAM — THE ISLE: EVRIMA WEB PORTAL

Hệ thống Website Cổng Thông Tin toàn diện cho cộng đồng game **The Isle: Evrima**, lấy cảm hứng từ cấu trúc của `dino4vn.com`, tích hợp giao tiếp **IslePilot API** (`https://islepilot.eu/dashboard`), bản đồ trực tiếp đảo Gateway v0.21.7, hệ thống Gara lưu trữ 10 ô và bộ cài đặt **IsleLiveMap HUD**.

---

## 🌟 TÍNH NĂNG CHÍNH

### 1. 📜 13 Điều Nội Quy Chuẩn Xác & Bảng Pack Limit
* Đầy đủ **13 Điều Nội Quy** từ BQT: Săn bắt tự do, Cấm Mixpack, Giao lưu tối đa 5 phút, Report trong 24h, Vùng Cam (Rừng Dừa), Giao tranh không cần call, Cấm Combat Log, Cấm Spam thú / farm thức ăn, 3 Khung xử lý cảnh cáo, Cấm Revenge Kill, Luật Gara 5 phút, và Luật Team 3 (Quy tắc F2).
* **Bảng Pack Limit trực quan** phân theo 3 nhóm loài:
  * **Carnivore (Ăn thịt):** T-Rex (2), Deinosuchus (2), Allosaurus (3), Carnotaurus (4), Dilophosaurus (4), Ceratosaurus (5), Austroraptor (6), Omniraptor (8), Herrerasaurus (8), Troodon (10), Pteranodon (10).
  * **Herbivore (Ăn cỏ):** Triceratops (3), Stegosaurus (3), Tenontosaurus (4), Diabloceratops (5), Kentrosaurus (5), Maiasaura (5), Pachycephalosaurus (6), Dryosaurus (8), Hypsilophodon (10).
  * **Omnivore (Ăn tạp):** Gallimimus (10), Beipiaosaurus (10).

### 2. 🗺️ Bản Đồ Trực Tiếp Gateway (Interactive Leaflet Map)
* Bản đồ chi tiết đảo Gateway với lưới toạ độ chuẩn **A1 – L12**.
* Đánh dấu ranh giới **🌴 Vùng Cam — Rừng Dừa** với cảnh báo Điều 6.
* Hiển thị các địa danh quan trọng: *Delta, Swamp, Highlands, Sanctuary Bắc / Nam, Hồ Trung Tâm*.
* **Toạ độ chuột theo thời gian thực:** Hiển thị trục X/Y và ô bản đồ (ví dụ: `E7`, `F6`).
* **Đồng bộ vị trí người chơi:** Kết nối Steam & IsleLiveMap HUD để hiển thị chấm xanh vị trí của bạn trên đảo cùng nút *"Về vị trí của tôi"*.

### 3. 🦖 Gara Khủng Long (10 Ô Lưu Trữ)
* Hiển thị chi tiết **Khủng Long Đang Chơi (Active Dino)**: Máu, Đói, Khát, Thể lực, Mức độ trưởng thành (Growth %), Giới tính, Đột biến (Mutations).
* 10 Slot Gara: Cất vào Gara, Khôi phục ra đảo, Xoá slot.
* **Tích hợp đồng hồ đếm ngược 5 PHÚT** theo đúng **Điều 12** sau khi lấy Dino ra đảo để tuân thủ luật chống tiếp viện/phá combat.

### 4. 📥 Tải Công Cụ IsleLiveMap HUD
* Kết nối trực tiếp tới Google Drive của bạn:
  * Thư mục Drive: `https://drive.google.com/drive/folders/1lt_7g8rYuyqvrqZJidq8O1o0az1u-EtS?usp=drive_link`
  * Tải trực tiếp file cài đặt: `IsleLiveMap-win-Setup.exe` (~106.4 MB)
* Hướng dẫn 3 bước cài đặt và khắc phục lỗi Windows SmartScreen.

### 5. ⚙️ Tích Hợp IslePilot API (`https://islepilot.eu/dashboard`)
* Do `https://islepilot.eu/dashboard` là trang quản trị bảo mật riêng (yêu cầu đăng nhập Steam/Admin của bạn), website cung cấp trang **Cấu hình API (`cai-dat.html`)** và file `server-config.json`.
* Bạn chỉ cần dán **IslePilot API Token** từ Dashboard vào để website tự động đồng bộ dữ liệu thời gian thực.
* Có sẵn **Mock Data thông minh** để toàn bộ tính năng hoạt động mượt mà ngay cả khi chạy offline hoặc thử nghiệm!

---

## 🚀 CÁCH KHỞI CHẠY WEBSITE

### Khởi chạy bằng Node.js Server (Khuyên dùng):
Mở PowerShell tại thư mục dự án và chạy:
```powershell
node server.js
```
Truy cập trên trình duyệt:
* **Trang chủ:** [http://localhost:3000](http://localhost:3000)
* **Nội quy:** [http://localhost:3000/noi-quy.html](http://localhost:3000/noi-quy.html)
* **Bản đồ:** [http://localhost:3000/bando.html](http://localhost:3000/bando.html)
* **Gara:** [http://localhost:3000/gara.html](http://localhost:3000/gara.html)
* **Tải HUD:** [http://localhost:3000/tai-hud.html](http://localhost:3000/tai-hud.html)
* **Cấu hình API:** [http://localhost:3000/cai-dat.html](http://localhost:3000/cai-dat.html)

---

## 📁 CẤU TRÚC THƯ MỤC
```
the-isle-portal/
├── assets/
│   ├── css/
│   │   └── style.css            # Giao diện hiện đại phong cách The Isle
│   ├── js/
│   │   ├── app.js              # Quản lý trạng thái, auth và thông báo
│   │   ├── map.js              # Xử lý bản đồ Leaflet, lưới A1-L12, vị trí người chơi
│   │   └── gara.js             # Logic Gara, lưu/khôi phục, đếm ngược 5 phút
│   ├── map/
│   │   └── gateway.webp        # Ảnh bản đồ đảo Gateway chuẩn v0.21.7
│   └── vendor/
│       └── leaflet/            # Thư viện Leaflet JS & CSS cục bộ
├── index.html                  # Trang chủ cổng thông tin
├── noi-quy.html                # Toàn bộ 13 Điều Nội Quy & Bảng Pack Limit
├── bando.html                  # Bản đồ tương tác Gateway
├── gara.html                   # Gara khủng long 10 slot
├── tai-hud.html                # Tải IsleLiveMap HUD từ Google Drive
├── cai-dat.html                # Quản trị cấu hình IslePilot API
├── server.js                   # Node.js Express server & API proxy
├── server-config.json          # File cấu hình Server & IslePilot API
└── package.json                # Cấu hình dự án Node.js
```

## Rà soát và kiểm tra

Chạy `npm test` để kiểm tra mã nguồn, backend và frontend. Xem [kết quả và cấu hình triển khai](tests/AUDIT.md), đặc biệt `SESSION_SECRET` khi triển khai production/Vercel.
## Skin Studio

Trình chỉnh skin dùng component IslePilot gốc từ bản trang người dùng cung cấp, với model/texture và phân vùng màu gốc. Có chọn loài, màu, giới tính, họa tiết, Glitch, nhập/xuất JSON và preset lưu trên trình duyệt. Đăng nhập Steam và áp dụng skin đi qua API máy chủ ST25.

Xem [tính năng và cách kiểm tra](tests/SKIN_PREVIEW.md).
## ?? C?U TR?C TH? M?C

```text
src/
??? app.js                 # Gh?p ?ng d?ng Express
??? core/                  # C?u h?nh web/server v? x?c th?c
??? api/                   # URL API portal, URL/client IslePilot
??? models/                # L?u tr? c?u h?nh v? d? li?u
??? controllers/           # Backend theo ch?c n?ng
??? middleware/            # X?c th?c, kh?a thao t?c, x? l? y?u c?u
??? routes/                # ??ng k? URL trang v? API
??? pages/                 # To?n b? trang HTML
??? views/partials/        # Header/footer d?ng chung
??? features/              # JavaScript ch?c n?ng t?ch t? HTML
assets/                    # CSS, ?nh, th? vi?n, JavaScript d?ng chung
server.js                  # Entry point Node/Vercel
```

Xem [h??ng d?n c?u tr?c, th?m trang/API v? tri?n khai](src/ARCHITECTURE.md).
S?a giao di?n t?i `src/pages/`; c?u h?nh m?y ch? t?i `src/core/server-config.json`.
URL truy c?p v?n l? `/gara.html`, `/skin.html`? Ch?y qua Node server ?? gh?p header/footer.
