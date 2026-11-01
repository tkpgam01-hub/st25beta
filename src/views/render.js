const fs = require('node:fs');
const path = require('node:path');
const Core = require('../core/config');
const API = require('../api/endpoints');

function renderPage(page) {
  if (!/^[a-zA-Z0-9_-]+\.html$/.test(page)) {
    const error = new Error('Invalid page'); error.code = 'ENOENT'; throw error;
  }
  const source = fs.readFileSync(path.join(Core.pagesDir, page), 'utf8');
  return source.replace(/<!-- include:(header|footer) -->/g, (_, partial) =>
    fs.readFileSync(path.join(Core.partialsDir, `${partial}.html`), 'utf8'))
    .replace(/\{\{api:([A-Za-z0-9]+)\}\}/g, (_, name) => {
      if (!API.routes[name]) throw new Error(`Unknown API path: ${name}`);
      return API.routes[name];
    });
}

function readPublicAsset(reference) {
  const clean = reference.replace(/^\//, '').split(/[?#]/)[0];
  let file;
  if (clean === 'assets/js/core.js') file = path.join(Core.root, 'src/core/web.js');
  else if (clean === 'assets/js/api/endpoints.js') file = path.join(Core.root, 'src/api/endpoints.js');
  else if (clean.startsWith('assets/js/features/')) file = path.resolve(Core.featuresDir, clean.slice('assets/js/features/'.length));
  else file = path.resolve(Core.root, clean);
  if (!file.startsWith(Core.root + path.sep)) throw new Error('Invalid asset path');
  return fs.readFileSync(file, 'utf8');
}
module.exports = {renderPage, readPublicAsset};
