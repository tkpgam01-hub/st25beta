const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const relative = 'assets/vendor/islepilot-skin/cdn';
const target = path.join(root, 'public', relative);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(path.join(root, relative), target, { recursive: true });
console.log('Prepared skin models and textures for the Vercel CDN.');
