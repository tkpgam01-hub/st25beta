const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const Core = require('../src/core/config');
const API = require('../src/api/endpoints');
const PilotAPI = require('../src/api/upstream-endpoints');
const app = require('../src/app');
const server = app.listen(0, '127.0.0.1');
function get(url) {
  return new Promise((resolve, reject) => {
    http.get({host:'127.0.0.1', port:server.address().port, path:url}, response => {
      let text=''; response.on('data', chunk=>text+=chunk);
      response.on('end', ()=>resolve({status:response.statusCode, headers:response.headers, text}));
    }).on('error',reject);
  });
}
(async () => {
  await new Promise(resolve=>server.once('listening',resolve));
  const routes=app._router.stack.filter(layer=>layer.route && typeof layer.route.path==='string' && layer.route.path.startsWith('/api/'));
  assert.equal(routes.length,74,'Existing API handlers, Plinko, and Roulette routes must be registered');
  for (const route of routes) assert.ok(Object.values(API.routes).includes(route.route.path),route.route.path);
  assert.equal(PilotAPI.playerGarage('76561198000000001'),'/players/76561198000000001/garage');
  assert.equal(API.url(API.routes.skinInfo,{steamId:'123'}),'/api/skin/info?steamId=123');
  const assets=new Set(); let pages=0;
  for (const page of fs.readdirSync(Core.pagesDir).filter(name=>name.endsWith('.html'))) {
    const rendered = require('../src/views/render').renderPage(page);
    if (!page.startsWith('islepilot_')) {
      const apiPosition = rendered.indexOf('assets/js/api/endpoints.js');
      assert.ok(apiPosition >= 0, page);
      const featurePosition = rendered.indexOf('assets/js/features/');
      if (featurePosition >= 0) assert.ok(apiPosition < featurePosition, `${page}: API config must load before features`);
    }
    const response=await get('/'+page);

    assert.equal(response.status,200,page);
    assert.match(response.headers['content-type'],/text\/html/);
    if (!page.startsWith('islepilot_')) {
      assert.doesNotMatch(response.text,/<!-- include:|\{\{api:/,page);
      assert.equal((response.text.match(/<header\b/g)||[]).length,page==='skin-editor.html'?0:1,page);
      assert.ok(response.text.indexOf('assets/js/api/endpoints.js')<response.text.indexOf('</head>'),page);
      for(const [,source] of response.text.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["'](assets\/[^"']+)["']/g)) assets.add('/'+source);
    }
    pages++;
  }
  for(const source of assets) assert.equal((await get(source)).status,200,source);
  assert.equal((await get('/cdn/skinviewer/shared/T_SkinNoise_M.png')).status,200);
  assert.equal((await get('/pages/gara.html')).headers.location,'/gara.html');
  for(const url of ['/src/core/server-config.json','/src/core/auth.js','/src/models/data/portal-data.json','/src/pages/index.html','/assets/js/api/islepilot-client.js','/assets/js/api/upstream-endpoints.js']) {
    assert.equal((await get(url)).status,404,url);
  }
  console.log(`PASS architecture: ${pages} rendered pages, ${assets.size} public resources, 70 API routes, canonical URLs and private source files`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
