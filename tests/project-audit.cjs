const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const {renderPage, readPublicAsset} = require('./helpers/source.cjs');
const pagesDir = path.join(root, 'src/pages');
// The editor must remain deployable even when its entry page is accidentally removed.
for (const file of ['src/pages/skin.html','src/pages/skin-editor.html','assets/vendor/islepilot-skin/client.js','assets/js/islepilot-skin-runtime.js','src/features/islepilot-skin.js']) {
  assert.ok(fs.existsSync(path.join(root, file)), `Skin editor: missing required file ${file}`);
}
let scripts = 0, json = 0, pages = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.build-cache','reference'].includes(entry.name) || /^\.(?:redesign|quests)-browser-/.test(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(?:js|cjs)$/.test(file)) { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }); scripts++; }
    else if (file.endsWith('.json')) { JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); json++; }
    else if (file.endsWith('.html')) {
      const isPage = path.dirname(file) === pagesDir;
      const html = isPage ? renderPage(entry.name) : fs.readFileSync(file, 'utf8');
      for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc\s*=|\btype\s*=\s*["'](?:application\/[^"']+|module)/i.test(match[1])) continue;
        new vm.Script(match[2], { filename: file }); scripts++;
      }
      if (isPage && !entry.name.startsWith('islepilot_')) {
        for (const [, ref] of html.replace(/<script\b[\s\S]*?<\/script>/gi, '').matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
          const clean = ref.split(/[?#]/)[0];
          if (!clean || /^(?:[a-z]+:|\/\/|\/api\/)/i.test(clean)) continue;
          const normalized = clean.replace(/^\//, '');
          if (/^assets\/js\/(?:core\.js|api\/|features\/)/.test(normalized)) readPublicAsset(normalized);
          else {
            const local = path.resolve(normalized.endsWith('.html') ? pagesDir : root, normalized);
            assert.ok(fs.existsSync(local), `${entry.name}: missing ${ref}`);
          }
        }
      }
      pages++;
    }
  }
}
walk(root);
assert.equal(fs.readdirSync(root).filter(name=>name.endsWith('.html')).length, 0);
for (const name of fs.readdirSync(pagesDir).filter(n=>n.endsWith('.html')&&!n.startsWith('islepilot_'))) {
  const html=renderPage(name);
  assert.doesNotMatch(html,/<!-- include:/);
  assert.equal((html.match(/<header\b/g)||[]).length,name==='skin-editor.html'?0:1,name);
  for(const [,source] of html.matchAll(/<script[^>]*\bsrc=["'](assets\/[^"']+)["']/g)) readPublicAsset(source);
}
console.log(`PASS project syntax: ${pages} HTML files, ${scripts} scripts, ${json} JSON files; public page local links/assets`);
