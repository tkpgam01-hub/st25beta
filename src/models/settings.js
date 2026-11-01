const fs = require('node:fs');
const {configFile: CONFIG_FILE, temporaryConfigFile: TMP_CONFIG_FILE} = require('../core/config');
let memoryConfig = null;


function getConfig() {
  // 1. Đọc từ CONFIG_FILE gốc trong thư mục dự án (Nguồn dữ liệu chính)
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8').replace(/^\uFEFF/, '');
      memoryConfig = JSON.parse(raw);
      return memoryConfig;
    }
  } catch (e) {
    console.error('Lỗi đọc server-config.json gốc:', e.message);
  }

  if (memoryConfig) return memoryConfig;

  // 2. Fallback đọc từ TMP_CONFIG_FILE (dành cho môi trường Serverless tạm thời)
  try {
    if (fs.existsSync(TMP_CONFIG_FILE)) {
      const raw = fs.readFileSync(TMP_CONFIG_FILE, 'utf-8').replace(/^\uFEFF/, '');
      memoryConfig = JSON.parse(raw);
      return memoryConfig;
    }
  } catch (_) {}

  memoryConfig = {
    server: { name: "ST25 VIETNAM", short_name: "ST25", max_players: 100 },
    garage: {
      default_slots: 3,
      role_limits: { "default": 3, "admin": 20, "mod": 20, ".": 20 },
      player_custom_slots: {},
      user_roles: {}
    },
    islepilot: {
      enabled: true,
      api_base_url: "https://islepilot.eu/api/v1",
      server_id: "cmufraiwk7fnooa01vpdzdhm4",
      api_token: ""
    }
  };
  return memoryConfig;
}


function saveConfig(cfg) {
  memoryConfig = cfg;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Không thể ghi file CONFIG_FILE gốc:', err.message);
  }
  try {
    fs.writeFileSync(TMP_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (_) {}
  return true;
}
module.exports = {getConfig, saveConfig};
