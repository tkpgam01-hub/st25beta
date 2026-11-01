const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
let listener, builds = 0;
const nodes = {};
const body = {
  set innerHTML(html) {
    builds++;
    for (const [, name] of html.matchAll(/data-home="([^"]+)"/g)) {
      nodes[name] = { dataset: {home: name}, textContent: '', style: {}, attrs: {}, getAttribute(k) { return this.attrs[k]; }, setAttribute(k,v) { this.attrs[k] = String(v); } };
    }
  },
  querySelectorAll: () => Object.values(nodes)
};
const badge = {textContent:'',className:''};
const timers = new Map(); let timerId = 0;
const context = { setTimeout(fn,delay) { timers.set(++timerId,{fn,delay}); return timerId; }, clearTimeout(id) { timers.delete(id); }, window: {addEventListener() {}}, App: { subscribeUser(fn) { listener = fn; return () => {}; } }, document: { hidden:false, getElementById: id => id === 'dino-status-badge' ? badge : body, addEventListener() {} } };
context.ST25API = require('../src/api/endpoints');
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/home.js'),'utf8') + '\nglobalThis.widget = HomePlayer;', context);
context.widget.init(); context.widget.init();
const user = {linked:true,steam_id:'test',dino:{species:'Troodon',growth:39,health:0,hunger:100,thirst:66,grid:'D10'}};
listener(user);
assert.equal(builds,1);
const health = nodes.healthFill;
assert.equal(nodes.health.textContent,'0%');
assert.equal(health.style.transform,'scaleX(0)');
assert.equal(nodes.healthTrack.attrs['aria-valuenow'],'0');
listener(user); assert.equal(builds,1);
user.dino.thirst=65; user.dino.species='Deinosuchus'; listener(user);
assert.equal(builds,1); assert.equal(nodes.healthFill,health);
assert.equal(nodes.thirst.textContent,'65%');
assert.equal(nodes.species.textContent,'Deinosuchus');
listener(null,new Error('offline')); assert.equal(builds,1);
assert.equal(badge.textContent,'MẤT KẾT NỐI');
listener(user); assert.equal(badge.textContent,'● ONLINE');
listener({linked:false}); assert.equal(builds,2);
listener({linked:false}); assert.equal(builds,2);
// Validate the real backend helper without starting Express or contacting IslePilot.
const server = ['src/controllers/context.js','src/controllers/player.js','src/api/islepilot-client.js']
  .map(file => fs.readFileSync(path.join(__dirname,'..',file),'utf8')).join('\n');
const helper = server.match(/function normalizeStatPct\(val, maxVal\) \{[\s\S]*?\n\}/)[0];
vm.runInContext(helper,context);
assert.equal(context.normalizeStatPct(0,100),0);
assert.equal(context.normalizeStatPct(66,100),66);
assert.equal(context.normalizeStatPct(.39,1),39);
assert.match(server,/health: normalizeStatPct\(pilotPlayer.health, pilotPlayer.maxHealth\)/);
console.log('PASS sidebar: shared subscription, stable nodes, zero stats, changed species, offline preservation, logout, backend normalization');
(async () => {
  listener(user);
  assert.equal(timers.size,1);
  assert.equal([...timers.values()][0].delay,2000);
  let resolve, reads=0;
  context.App.readJSON=()=>{reads++; return new Promise(r=>{resolve=r;});};
  const tick=[...timers.values()][0].fn; timers.clear(); tick();
  await context.widget.refreshVitals(); assert.equal(reads,1);
  resolve({steam_id:'test',dino:{...user.dino,health:25}});
  await Promise.resolve(); await Promise.resolve();
  assert.equal(nodes.health.textContent,'25%');
  assert.equal(timers.size,1);
  context.document.hidden=true;
  await context.widget.refreshVitals(); assert.equal(reads,1);
  context.document.hidden=false;
  // A response started before logout must never restore the previous player's card.
  const request=context.widget.refreshVitals(); listener({linked:false});
  resolve({steam_id:'test',dino:{...user.dino,health:99}}); await request;
  assert.equal(context.widget.state,'anonymous'); assert.equal(timers.size,0);
  const route=server.slice(server.indexOf('app.get(ST25API.routes.playerVitals'),server.indexOf('app.get(ST25API.routes.playerMe'));
  assert.doesNotMatch(route,/getPlayerGarageStatus/);
  assert.match(route,/no-store/);
  assert.match(server,/test\(cleanEpKey\) \? 2000/);
  console.log('PASS fast vitals: 2s scheduling, no overlapping requests, live stat update, hidden tab, stale response after logout, lightweight uncached HTTP route');
})().catch(error=>{console.error(error);process.exitCode=1;});
