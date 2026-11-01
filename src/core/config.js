const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');

// Shell/hosting values take precedence over the local .env file.
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  process.env.SESSION_SECRET = 'st25-vietnam-portal-super-secure-production-session-secret-key-2026-64bytes';
}

module.exports = Object.freeze({
  root,
  port: process.env.PORT || 3000,
  pagesDir: path.join(root, 'src/pages'),
  partialsDir: path.join(root, 'src/views/partials'),
  assetsDir: path.join(root, 'assets'),
  featuresDir: path.join(root, 'src/features'),
  configFile: path.join(root, 'src/core/server-config.json'),
  dataFile: path.join(root, 'src/models/data/portal-data.json'),
  temporaryConfigFile: path.join(os.tmpdir(), 'server-config.json'),
  temporaryDataFile: path.join(os.tmpdir(), 'portal-data.json'),
  upstreamBaseURL: process.env.ISLEPILOT_API_BASE_URL || 'https://islepilot.eu/api/v1'
});
