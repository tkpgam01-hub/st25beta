const fs = require('node:fs');
const path = require('node:path');
const {renderPage, readPublicAsset} = require('../../src/views/render');
function pageScripts(page) {
  return [...renderPage(page).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .map(match => {
      const source = match[1].match(/\bsrc=["']([^"']+)/);
      if (!source) return match[2];
      return source[1].startsWith('assets/js/features/') ? readPublicAsset(source[1]) : '';
    }).join('\n;\n');
}
const root = path.resolve(__dirname, '../..');
function read(file) {
  return file.endsWith('.html') && !file.includes('/')
    ? renderPage(file) : fs.readFileSync(path.join(root, file), 'utf8');
}
module.exports = {read, pageScripts, renderPage, readPublicAsset};
