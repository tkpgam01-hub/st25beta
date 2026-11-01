const fs = require('node:fs');
const {dataFile: DATA_FILE, temporaryDataFile: TMP_DATA_FILE} = require('../core/config');
let memoryPortalData = null;


// ==================== NEW FEATURES BACKEND ==================== //

function getPortalData() {
  if (memoryPortalData) return memoryPortalData;

  // 1. Đọc từ DATA_FILE gốc trong thư mục dự án (Nguồn dữ liệu chính)
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8').replace(/^\uFEFF/, '');
      memoryPortalData = JSON.parse(raw);
      if (!memoryPortalData.adminAssignments) memoryPortalData.adminAssignments = {};
      return memoryPortalData;
    }
  } catch (e) {
    console.error('Lỗi đọc portal-data.json gốc:', e.message);
  }

  // 2. Fallback đọc từ TMP_DATA_FILE (cho môi trường Serverless tạm thời)
  try {
    if (fs.existsSync(TMP_DATA_FILE)) {
      const raw = fs.readFileSync(TMP_DATA_FILE, 'utf8').replace(/^\uFEFF/, '');
      memoryPortalData = JSON.parse(raw);
      if (!memoryPortalData.adminAssignments) memoryPortalData.adminAssignments = {};
      return memoryPortalData;
    }
  } catch (_) {}

  memoryPortalData = {
    userWallets: {
      "76561198636766540": 250
    },
    userGarage: {
      "76561198636766540": [
        {
          id: "garage-dino-1",
          species: "Tyrannosaurus",
          gender: "Đực (Male)",
          growth: 100,
          health: 100,
          hunger: 100,
          thirst: 100,
          diet: ["S", "S", "D"],
          stored_at: "06/10/2026",
          source: "Tài Khoản ST25",
          isLocal: true
        }
      ]
    },
    userInventory: {
      "76561198636766540": [
        { id: "inv-1", name: "Thẻ Hồi Sinh Bảo Hộ", icon: "🛡️", desc: "Bảo lưu 100% Growth nếu rớt vực", type: "item" }
      ]
    },
    marketListings: [
      { id: "mkt-1", seller: "Trùm Khủng Long ST25", sellerSteamId: "76561198000000001", title: "T-Rex Đực 100% Full Dinh Dưỡng S-S-D", species: "Tyrannosaurus", price: 120, growth: 100, diet: "100% S-S-D", icon: "🦖" },
      { id: "mkt-2", seller: "Sát Thủ Đầm Lầy", sellerSteamId: "76561198000000002", title: "Deinosuchus Cái 95% Prime Ready", species: "Deinosuchus", price: 90, growth: 95, diet: "90% S-S-D", icon: "🐊" },
      { id: "mkt-3", seller: "Raptor Tốc Độ", sellerSteamId: "76561198000000003", title: "Omniraptor Cặp Trống Mái Đột Biến Nhảy Cao", species: "Omniraptor", price: 60, growth: 100, diet: "Đầy đủ", icon: "🦅" }
    ],
    tickets: [],
    referrals: {},
    carcassOrders: [],
    adminAssignments: {}
  };
  return memoryPortalData;
}


function savePortalData(data) {
  memoryPortalData = data;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('Không thể ghi file DATA_FILE gốc:', err.message);
  }
  try {
    fs.writeFileSync(TMP_DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
  return true;
}
module.exports = {getPortalData, savePortalData};
