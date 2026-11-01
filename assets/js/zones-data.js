// IslePilot ST25 Map Zones & POIs Data (Phiên Bản Địa Danh Tiếng Việt Hài Hước)
// Calibration chuẩn xác theo https://st25.islepilot.eu/map
// Point A: worldX = 534057.925, worldY = -267245.9 -> u = 0.932096, v = 0.305304
// Point B: worldX = 87931.248, worldY = -104086.204 -> u = 0.535622, v = 0.449611
// scaleU = 8.8870347e-7, scaleV = 8.8445012e-7

const IslePilotZonesData = {
  calibration: {
    originU: 0.5356221651318197,
    originV: 0.4496109559223209,
    originWorldX: 87931.248,
    originWorldY: -104086.204,
    scaleU: 8.8870347e-7,
    scaleV: 8.8445012e-7
  },

  worldToLatLng(worldX, worldY) {
    const u = this.calibration.originU + (worldX - this.calibration.originWorldX) * this.calibration.scaleU;
    const v = this.calibration.originV + (worldY - this.calibration.originWorldY) * this.calibration.scaleV;
    const lng = Math.min(1000, Math.max(0, u * 1000));
    const lat = Math.min(1000, Math.max(0, (1 - v) * 1000));
    return { lat, lng, u, v };
  },

  // Colored Circular Zones & Points
  circles: [
    // 1. BÃI THẢ AI TRUNG TÂM (Xanh lam #38bdf8 - Size cực lớn)
    {
      id: "ai_center",
      name: "Siêu Thị Ship Thịt Tận Răng (Bãi Thả AI Trung Tâm)",
      category: "ai_zone",
      color: "#38bdf8",
      fillColor: "#38bdf8",
      fillOpacity: 0.25,
      weight: 3,
      radius: 50,
      worldX: 104293,
      worldY: 311124,
      desc: "Trạm cơm bình dân phục vụ các sát thủ ăn thịt đói meo! AI thả ngập mồm, tha hồ săn không sợ đói lả!"
    },

    // 2. SANCTUARIES - 6 THÁNH ĐỊA CON NON (Xanh ngọc #34d399)
    {
      id: "sanc_delta",
      name: "Trường Mầm Non Búp Sen (Sanctuary Delta)",
      category: "sanctuary",
      color: "#10b981",
      fillColor: "#34d399",
      fillOpacity: 0.32,
      weight: 2,
      radius: 14,
      worldX: 226985,
      worldY: -15682,
      desc: "Khu bảo tồn con nít Delta! Nơi con non bú bình ăn nấm, cấm các đại ca to xác bén mảng gõ đầu!"
    },
    {
      id: "sanc_eastlake",
      name: "Nhà Trẻ Trốn Nợ Hồ Đông (Sanctuary EastLake)",
      category: "sanctuary",
      color: "#10b981",
      fillColor: "#34d399",
      fillOpacity: 0.32,
      weight: 2,
      radius: 14,
      worldX: 437404,
      worldY: -172729,
      desc: "Nơi các cháu ăn quả an toàn né mấy con Rex háu ăn rình mò bên bờ hồ."
    },
    {
      id: "sanc_mudflats",
      name: "Trại Tị Nạn Bùn Lầy (Sanctuary Mudflats)",
      category: "sanctuary",
      color: "#10b981",
      fillColor: "#34d399",
      fillOpacity: 0.32,
      weight: 2,
      radius: 14,
      worldX: -336645,
      worldY: 175736,
      desc: "Con non trốn phụ huynh quậy đục nước, an toàn tuyệt đối trước móng vuốt ăn thịt."
    },
    {
      id: "sanc_southplains",
      name: "Mẫu Giáo Đồng Bằng Nam (Sanctuary South Plains)",
      category: "sanctuary",
      color: "#10b981",
      fillColor: "#34d399",
      fillOpacity: 0.32,
      weight: 2,
      radius: 14,
      worldX: -181812,
      worldY: 234530,
      desc: "Vườn trẻ thơ mộng, nơi mầm non tương lai lớn lên mà không lo bị xiên que."
    },
    {
      id: "sanc_swamp",
      name: "Nhà Trẻ Chống Sấu Cắn Trộm (Sanctuary Swamp)",
      category: "sanctuary",
      color: "#10b981",
      fillColor: "#34d399",
      fillOpacity: 0.32,
      weight: 2,
      radius: 14,
      worldX: 24556,
      worldY: 288236,
      desc: "Cá sấu đứng ngoài bờ dãi chảy ròng ròng mà không làm gì được mấy bé non tơ."
    },
    {
      id: "sanc_verdant",
      name: "Lớp Học Rừng Xanh (Sanctuary Verdant Forest)",
      category: "sanctuary",
      color: "#10b981",
      fillColor: "#34d399",
      fillOpacity: 0.32,
      weight: 2,
      radius: 14,
      worldX: 169261,
      worldY: -241585,
      desc: "Tán cây xanh mát che chở tuổi thơ dữ dội của đàn thú ăn cỏ nhí."
    },

    // 3. VÙNG CAM — RỪNG DỪA (Điều 6 Nội Quy ST25)
    {
      id: "orange_coconut",
      name: "VÙNG CAM ÉP ĂN CHAY — RỪNG DỪA (Điều 6)",
      category: "orange_zone",
      color: "#ea580c",
      fillColor: "#f97316",
      fillOpacity: 0.3,
      weight: 3,
      dashArray: "6, 6",
      radius: 45,
      worldX: -212000,
      worldY: -250000,
      desc: "VÙNG CAM (ĐIỀU 6): Cấm CAMP đồ sát người mới! Trên 50% Growth cấm săn con non, vi phạm ăn gậy Mod ngay!"
    },

    // 4. ĐIỂM NÓNG GIAO TRANH — PATROL ZONES ĐỎ (#ff0000)
    {
      id: "pz_forks",
      name: "Ngã Ba Đâm Thuê (Forks Plains 1)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 30,
      worldX: 227553,
      worldY: -88491,
      desc: "Điểm nóng giao tranh Forks Plains: Nơi va chạm nảy lửa, thấy bóng dáng là lao vào đớp!"
    },
    {
      id: "pz_delta1",
      name: "Đấu Trường Sinh Tử Delta (Delta 1)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 20,
      worldX: 198553,
      worldY: 71371,
      desc: "Khúc sông đẫm máu Delta: Tỉ lệ sống sót 50/50, cẩn thận kẻo thành mồi ngon!"
    },
    {
      id: "pz_njungle2",
      name: "Khúc Cua Báo Thủ (Northern Jungle 2)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 12,
      worldX: 146158,
      worldY: -200732,
      desc: "Góc rình mồi hiểm hóc ở Rừng Bắc, chớp mắt là bay nửa cây máu."
    },
    {
      id: "pz_westrail1",
      name: "Trạm Xe Lửa Báo Đời 1 (West Rail 1)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 20,
      worldX: -221616,
      worldY: -996,
      desc: "Đoạn đường ray chạy việt dã nghẹt thở của các vận động viên săn mồi."
    },
    {
      id: "pz_westrail2",
      name: "Trạm Xe Lửa Báo Đời 2 (West Rail 2)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 20,
      worldX: -246809,
      worldY: 29498,
      desc: "Đoạn ray thứ 2: Đi không cẩn thận là vấp đá ngã gãy giò!"
    },
    {
      id: "pz_westrail3",
      name: "Trạm Xe Lửa Báo Đời 3 (West Rail 3)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 20,
      worldX: -310363,
      worldY: -2346,
      desc: "Khu vực giao nhau giữa rừng và đường tàu Tây."
    },
    {
      id: "pz_westrail4",
      name: "Trạm Xe Lửa Báo Đời 4 (West Rail 4)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 20,
      worldX: -335790,
      worldY: 49076,
      desc: "Trạm cuối đường ray: Nơi xác khủng long chất thành đống."
    },
    {
      id: "pz_splains1",
      name: "Vòng Xoay Huyết Chiến 1 (South Plains 1)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 20,
      worldX: -218068,
      worldY: 310617,
      desc: "Đồng Bằng Nam điểm nóng số 1: Carno phi như tên bắn rượt mồi."
    },
    {
      id: "pz_splains2",
      name: "Vòng Xoay Huyết Chiến 2 (South Plains 2)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 20,
      worldX: -202483,
      worldY: 272586,
      desc: "Đồng Bằng Nam điểm nóng số 2: Trận địa của các đàn Stego và T-Rex."
    },
    {
      id: "pz_splains3",
      name: "Vòng Xoay Huyết Chiến 3 (South Plains 3)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 20,
      worldX: -252577,
      worldY: 291601,
      desc: "Đồng Bằng Nam điểm nóng số 3: Vùng cỏ trống trải, né núp cực khó."
    },
    {
      id: "pz_splains4",
      name: "Vòng Xoay Huyết Chiến 4 (South Plains 4)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 20,
      worldX: -268445,
      worldY: 136089,
      desc: "Đồng Bằng Nam điểm nóng số 4: Giáp ranh rừng già Tây."
    },
    {
      id: "pz_sbeach2",
      name: "Bãi Cắn Trộm Bờ Nam (Southern Beach 2)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 30,
      worldX: -99571,
      worldY: 319086,
      desc: "Bãi tắm ngắm hoàng hôn và nghe tiếng kêu thất thanh của con mồi."
    },
    {
      id: "pz_thepit1",
      name: "Hố Đen Mất Xác 1 (The Pit 1)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 30,
      worldX: -451389,
      worldY: 328489,
      desc: "The Pit Điểm 1: Rơi xuống là hết cứu, khỏi kêu gào vô ích!"
    },
    {
      id: "pz_thepit2",
      name: "Hố Đen Mất Xác 2 (The Pit 2)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 30,
      worldX: -366466,
      worldY: 372888,
      desc: "The Pit Điểm 2: Địa ngục trần gian, vách đá dựng đứng."
    },
    {
      id: "pz_thepit3",
      name: "Hố Đen Mất Xác 3 (The Pit 3)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 12,
      worldX: -291575,
      worldY: 295065,
      desc: "The Pit Điểm 3: Miệng hố hẹp dễ lọt chân."
    },
    {
      id: "pz_thepit4",
      name: "Hố Đen Mất Xác 4 (The Pit 4)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 20,
      worldX: -303069,
      worldY: 348756,
      desc: "The Pit Điểm 4: Nơi yên nghỉ của hàng trăm con khủng long trưởng thành."
    },
    {
      id: "pz_thepit5",
      name: "Hố Đen Mất Xác 5 (The Pit 5)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 20,
      worldX: -256314,
      worldY: 353230,
      desc: "The Pit Điểm 5: Vực sâu thăm thẳm."
    },
    {
      id: "pz_thepit6",
      name: "Hố Đen Mất Xác 6 (The Pit 6)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 30,
      worldX: -242298,
      worldY: 414399,
      desc: "The Pit Điểm 6: Khu vực đáy hố, xương chất đống."
    },
    {
      id: "pz_thepit7",
      name: "Hố Đen Mất Xác 7 (The Pit 7)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 20,
      worldX: -336907,
      worldY: 239556,
      desc: "The Pit Điểm 7: Vách đá trơn trượt."
    },
    {
      id: "pz_thepit8",
      name: "Hố Đen Mất Xác 8 (The Pit 8)",
      category: "hotspot_red",
      color: "#ef4444",
      fillColor: "#dc2626",
      fillOpacity: 0.28,
      weight: 2,
      radius: 12,
      worldX: -365294,
      worldY: 209914,
      desc: "The Pit Điểm 8: Góc hiểm trở phía tây nam."
    },

    // 5. VÙNG TUẦN TRA TÍM (#a78bfa)
    {
      id: "pz_mudflats_purple",
      name: "Vùng Tuần Tra Bãi Lầy (Mudflats)",
      category: "patrol_purple",
      color: "#8b5cf6",
      fillColor: "#a78bfa",
      fillOpacity: 0.28,
      weight: 2,
      radius: 14,
      worldX: -302325,
      worldY: 150410,
      desc: "Đội tuần tra Bãi Bùn Lầy Lội: Ai đi ngang nhớ nộp mãi lộ!"
    },
    {
      id: "pz_porthill_purple",
      name: "Đồi Cảng Hóng Gió (Port Hill)",
      category: "patrol_purple",
      color: "#8b5cf6",
      fillColor: "#a78bfa",
      fillOpacity: 0.28,
      weight: 2,
      radius: 14,
      worldX: 441455,
      worldY: -305467,
      desc: "Đồi cao lộng gió ngắm toàn cảnh bến tàu bỏ hoang."
    },
    {
      id: "pz_radiotower_purple",
      name: "Tháp Bắt Sóng 5G (Radio Tower)",
      category: "patrol_purple",
      color: "#8b5cf6",
      fillColor: "#a78bfa",
      fillOpacity: 0.28,
      weight: 2,
      radius: 14,
      worldX: 532599,
      worldY: -207214,
      desc: "Tháp truyền tin đỉnh chóp: Bắt sóng WiFi cực mạnh cho khủng long lướt mạng!"
    }
  ],

  // Polygons (Mass Migration MMZ, Swamps, Đại Di Cư)
  polygons: [
    {
      id: "mmz_ne_cape",
      name: "Hành Lang Đi Phượt Mũi Đông Bắc (NE Cape MMZ)",
      category: "migration",
      color: "#f59e0b",
      fillColor: "#f59e0b",
      fillOpacity: 0.22,
      weight: 2,
      points: [
        { x: 367640, y: -556696 },
        { x: 518421, y: -556696 },
        { x: 518421, y: -385516 },
        { x: 367640, y: -385516 }
      ],
      desc: "Tuyến đường phượt ngắm bình minh và tìm kiếm thảo mộc tươi tốt."
    },
    {
      id: "mmz_swamps",
      name: "Tuyến Di Cư Lội Bùn Né Sấu (Swamps MMZ)",
      category: "migration",
      color: "#22c55e",
      fillColor: "#4dff00",
      fillOpacity: 0.22,
      weight: 2,
      points: [
        { x: -34069, y: 232495 },
        { x: 137867, y: 232495 },
        { x: 137867, y: 368285 },
        { x: -34069, y: 368285 }
      ],
      desc: "Hành lang di cư đầm lầy: Vừa đi vừa cầu nguyện không bị cá sấu kéo giò!"
    },
    {
      id: "mmz_great1",
      name: "Cao Tốc Chạy Show Kiếm Ăn 1 (Đại Di Cư Đông Bắc)",
      category: "migration",
      color: "#22c55e",
      fillColor: "#4dff00",
      fillOpacity: 0.2,
      weight: 2,
      points: [
        { x: 196154, y: -433411 },
        { x: 17030, y: -174193 },
        { x: 169870, y: -68549 },
        { x: 330497, y: -348309 }
      ],
      desc: "Tuyến cao tốc liên tỉnh dành cho các đàn ăn cỏ chạy show ăn lộc."
    },
    {
      id: "mmz_great2",
      name: "Cao Tốc Chạy Show Kiếm Ăn 2 (Đại Di Cư Tây Nam)",
      category: "migration",
      color: "#22c55e",
      fillColor: "#4dff00",
      fillOpacity: 0.2,
      weight: 2,
      points: [
        { x: -260048, y: 62187 },
        { x: -125316, y: 252611 },
        { x: -82379, y: 191616 },
        { x: -141602, y: 127645 },
        { x: -110510, y: 51773 },
        { x: -197864, y: 35408 }
      ],
      desc: "Tuyến đường hành quân vượt rừng và đồng cỏ Tây Nam."
    },
    {
      id: "mmz_great3",
      name: "Ngã Tư Hỗn Loạn Trung Tâm (Đại Di Cư 3)",
      category: "migration",
      color: "#22c55e",
      fillColor: "#4dff00",
      fillOpacity: 0.2,
      weight: 2,
      points: [
        { x: -16017, y: 27798 },
        { x: 4711, y: -28734 },
        { x: 44686, y: -4931 },
        { x: 81700, y: -9394 },
        { x: 111312, y: 76892 },
        { x: 47647, y: 118547 },
        { x: 37283, y: 50113 }
      ],
      desc: "Giao lộ tử thần nơi các đàn chạm trán nhau, ồn ào như chợ vỡ."
    }
  ],

  // 24 Landmark Locations (Tên Tiếng Việt Hài Hước)
  locations: [
    { name: "Bến Phà Đẫm Máu (Delta)", worldX: 175337, worldY: 35988, desc: "Nơi các anh hào hẹn hò đập lộn rồi chết đuối" },
    { name: "Vịnh Vỡ Mồm (Delta Bay)", worldX: 338271, worldY: 216326, desc: "Biển êm sóng lặng nhưng bước chân ra là ăn vả" },
    { name: "Bờ Biển Dưỡng Lão (East Coast)", worldX: 540588, worldY: -95732, desc: "Nơi các cụ khủng long lui về ở ẩn né drama" },
    { name: "Hồ Cúi Đầu Mất Xác (Eastern Lake)", worldX: 417150, worldY: -135304, desc: "Cúi xuống húp nước, ngẩng lên bay luôn cái đầu" },
    { name: "Đồng Bằng Ba Chĩa (Forks Plains)", worldX: 245214, worldY: -118006, desc: "Đất chật người đông, chuyên đâm thuê chém mướn" },
    { name: "Cao Nguyên Gió Rét (Highland)", worldX: -75590, worldY: -59325, desc: "Rex rượt hụt hơi, ăn cỏ vừa nhai vừa run lẩy bẩy" },
    { name: "Rừng Rậm Trầm Cảm (Jungle I sec.)", worldX: 122676, worldY: -94714, desc: "Đi vào thì dễ, đi ra lạc mẹ nó đường" },
    { name: "Bãi Lầy Tụt Quần (Mudflats)", worldX: -329556, worldY: 112985, desc: "Chạy chậm như rùa bò, mồi ngon cho chim sà xuống đớp" },
    { name: "Mũi Cà Mau Đông Bắc (NE Cape)", worldX: 434366, worldY: -463531, desc: "Nơi tận cùng bản đồ, chim không đỗ cá không bơi" },
    { name: "Vịnh Tránh Var (North Bay)", worldX: 10378, worldY: -412878, desc: "Chạy ra đây trốn khi bị cả server lùng sục" },
    { name: "Thảo Nguyên Xiên Que (North Plains)", worldX: 353462, worldY: -346961, desc: "Cỏ thì tươi ngon mà mạng thì như chỉ mành treo chuông" },
    { name: "Rừng Già Cây Biết Cắn (Northern Jungle)", worldX: 145968, worldY: -337916, desc: "Núp lùm đỉnh cao, bước một bước giật mình mười bước" },
    { name: "Sống Lưng Gãy Giò (NW. Ridge)", worldX: -161671, worldY: -257866, desc: "Nhảy thử đi rồi biết mùi xe lăn y tế" },
    { name: "Cảng Ve Chai Phế Liệu (Port)", worldX: 547677, worldY: -301396, desc: "Tàu bè trôi dạt, toàn khủng long đói meo rình mò" },
    { name: "Bãi Cát Phơi Xác (Sandbank Bay)", worldX: 399934, worldY: 77483, desc: "Nắng vàng biển xanh, nằm thở oxy chờ hồi máu" },
    { name: "Đồng Bằng Chạy Bo (South Plains)", worldX: -187889, worldY: 189982, desc: "Sân vận động điền kinh quốc tế ST25" },
    { name: "Bãi Biển Thở Oxy (Southern Beach - East)", worldX: 109623, worldY: 416903, desc: "Tắm nắng chờ giờ bay màu" },
    { name: "Bãi Biển Săn Cá Sấu (Southern Beach - West)", worldX: -57361, worldY: 413850, desc: "Gió thổi hiu hiu, dưới chân có hàm răng nhọn hoắt" },
    { name: "Đầm Lầy Kéo Giò (Swamps)", worldX: 47848, worldY: 308474, desc: "Bảo tàng Deinosuchus - Ai lội nước xin vĩnh biệt cụ!" },
    { name: "Hố Tử Thần Diệt Chủng (The Pit)", worldX: -362975, worldY: 317632, desc: "Rơi xuống là hết cứu, khỏi gào thét mất công" },
    { name: "Vũng Nước Móc Cua (Tide Pool)", worldX: 456646, worldY: -33999, desc: "Nước nông tới mắt cá mà lòng dạ hiểm sâu" },
    { name: "Bờ Tây Sóng Vỗ Bay Màu (West Coast)", worldX: -401458, worldY: -18735, desc: "Biển rộng bao la, cắn lén bất ngờ" },
    { name: "Đường Ray Báo Đời (West Rail)", worldX: -244601, worldY: -1549, desc: "Tàu hỏa chạy bằng cơm, rượt đuổi nghẹt thở từng mét" },
    { name: "Trạm Hút Nước Đổi Mạng (Water Access)", worldX: 84306, worldY: -214224, desc: "Một ngụm nước ngọt đổi một kiếp luân hồi" }
  ]
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = IslePilotZonesData;
}
