const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

module.exports = async function run(root = path.resolve(__dirname, '..')) {
  const results = [];
  const {read, pageScripts} = require('./helpers/source.cjs');
  function environment() {
    const timers = new Map();
    const listeners = [];
    const storage = new Map();
    let timerId = 0;
    const clock = { now: 1000 };
    const context = {
      console, AbortController, URLSearchParams,
      ST25API: require('../src/api/endpoints'), ST25Core: require('../src/core/web'),
      Date: class extends Date { static now() { return clock.now; } },
      setTimeout: f => { timers.set(++timerId, f); return timerId; },
      clearTimeout: id => timers.delete(id),
      setInterval: f => { timers.set(++timerId, f); return timerId; },
      clearInterval: id => timers.delete(id),
      localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,String(v)), removeItem: k => storage.delete(k) },
      document: { hidden: false, readyState: 'loading', querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: (n,f) => listeners.push([n,f]) },
      window: { location: { search: '', pathname: '/index.html' }, addEventListener: (n,f) => listeners.push([n,f]) },
      confirm: () => true,
      fetch: async () => ({ ok: true, json: async () => ({}) })
    };
    vm.createContext(context);
    return { context, timers, listeners, storage, clock };
  }
  function script(e, file, name) {
    vm.runInContext(read(file) + `\nglobalThis.subject = ${name};`, e.context, { filename: file });
    return e.context.subject;
  }
  function inline(e, file, name) {
    const body = pageScripts(file);
    vm.runInContext(body + `\nglobalThis.subject = ${name};`, e.context, { filename: file });
    return e.context.subject;
  }
  const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
  async function test(name, fn) { await fn(); results.push(name); }

  await test('Identical reads share one request and release the lock', async () => {
    const e = environment(); const app = script(e, 'assets/js/app.js', 'App');
    const gate = deferred(); let calls = 0;
    e.context.fetch = () => { calls++; return gate.promise; };
    const a = app.readJSON('/api/test'); const b = app.readJSON('/api/test');
    assert.equal(a,b); assert.equal(calls,1);
    gate.resolve({ok:true,json:async()=>({balance:0})}); await a;
    assert.equal(app.readRequests.size,0);
  });
  await test('Timeout aborts a stuck read; a retry can start afterwards', async () => {
    const e = environment(); const app = script(e, 'assets/js/app.js', 'App');
    e.context.fetch = (_,options) => new Promise((resolve,reject) => options.signal.addEventListener('abort',()=>reject(new Error('aborted'))));
    const request = app.readJSON('/api/test'); const rejection = assert.rejects(request,/aborted/);
    [...e.timers.values()][0](); await rejection;
    assert.equal(app.readRequests.size,0);
    e.context.fetch = async()=>({ok:true,json:async()=>({})}); await app.readJSON('/api/test');
  });
  await test('Slow API cannot delay navigation; repeated init cannot add listeners', async () => {
    const e = environment(); const app = script(e, 'assets/js/app.js', 'App');
    const gate = deferred(); let nav = 0;
    app.renderEnhancedNav=()=>nav++; app.renderPlayerHUD=()=>{}; app.renderMobileNavigation=()=>{}; app.updateUI=()=>{};
    app.loadConfig=()=>gate.promise; app.loadEnvironment=()=>gate.promise; app.checkAuth=()=>gate.promise;
    const first=app.init(); assert.equal(nav,1);
    const count=e.listeners.length; await app.init(); assert.equal(e.listeners.length,count);
    gate.resolve(); await first;
    app.bindEvents(); assert.equal(e.listeners.filter(([n])=>n==='click').length,1);
  });
  await test('Hidden pages do not schedule polling', async () => {
    const e=environment(); const app=script(e,'assets/js/app.js','App');
    e.context.document.hidden=true; app.schedulePolling(); assert.equal(e.timers.size,0);
  });
  await test('Account HUD becomes ready while unrelated startup APIs are still pending', async () => {
    const e=environment(); const app=script(e,'assets/js/app.js','App');
    const slow=deferred(); const account=deferred(); const states=[];
    app.renderEnhancedNav=()=>{}; app.renderMobileNavigation=()=>{};
    app.renderWeatherWidget=()=>{}; app.updateUI=()=>{};
    app.renderPlayerHUD=()=>states.push(app.user?.steam_id || null);
    app.loadConfig=()=>slow.promise; app.loadEnvironment=()=>slow.promise;
    app.checkAuth=async()=>{app.user=await account.promise;};
    const startup=app.init();
    account.resolve({linked:true,steam_id:'76561198000000001'});
    await account.promise; await Promise.resolve(); await Promise.resolve();
    assert.equal(states.at(-1),'76561198000000001');
    slow.resolve(); await startup;
  });
  await test('Blocked local storage cannot discard a valid cookie login', async () => {
    const e=environment(); const app=script(e,'assets/js/app.js','App');
    e.context.fetch=async()=>({ok:true,json:async()=>({linked:true,steam_id:'76561198000000001'})});
    e.context.localStorage.setItem=()=>{throw new Error('storage disabled');};
    await app.checkAuth(); assert.equal(app.user.steam_id,'76561198000000001');
  });
  await test('Map reads cannot overlap and identical data does not redraw', async () => {
    const e=environment(); const map=script(e,'assets/js/map.js','IsleMap');
    const gate=deferred(); let reads=0, renders=0;
    e.context.App={readJSON:()=>{reads++;return gate.promise;}}; map.renderPlayerData=()=>renders++;
    const a=map.fetchData(); await map.fetchData(); assert.equal(reads,1);
    gate.resolve({health:0,lat:0,lng:1}); await a; await map.fetchData(); assert.equal(renders,1);
  });
  await test('Rapid tab switching cancels old motion; reduced motion cancels the remainder', async () => {
    const e=environment(); let change; const preference={matches:false,addEventListener:(_,f)=>{change=f;}};
    e.context.window.matchMedia=()=>preference;
    const motion=script(e,'assets/js/motion.js','window.ST25Motion'); const animations=[];
    const element={style:{},animate:()=>{const a={cancelled:false,cancel(){this.cancelled=true;this.oncancel?.();}};animations.push(a);return a;}};
    motion.enter(element); motion.enter(element); assert.equal(animations[0].cancelled,true);
    preference.matches=true; change(); assert.equal(animations[1].cancelled,true);
    motion.enter(element); assert.equal(animations.length,2);
  });
  await test('Unchanged garage data keeps existing cards and open details', async () => {
    const e=environment(); const garage=script(e,'assets/js/gara.js','Garage'); let renders=0;
    garage.renderActiveDino=()=>renders++; garage.renderSlots=()=>renders++; garage.updateCooldownUI=()=>{};
    garage.render(); garage.render(); assert.equal(renders,2);
  });
  await test('Active dinosaur updates do not recreate storage cards', async () => {
    const e=environment(); const garage=script(e,'assets/js/gara.js','Garage'); let slots=0;
    garage.renderActiveDino=()=>{}; garage.renderSlots=()=>slots++; garage.updateCooldownUI=()=>{};
    garage.activeDino={health:80}; garage.render(); garage.activeDino={health:70}; garage.render();
    assert.equal(slots,1);
  });
  await test('Concurrent park/restore is blocked; cancel during preparation prevents countdown', async () => {
    const e=environment(); const garage=script(e,'assets/js/gara.js','Garage');
    const gate=deferred(); let requests=0;
    e.context.App={showToast:()=>{}}; e.context.fetch=()=>{requests++;return gate.promise;};
    const a=garage.startRestoreChanneling('1','Tyrannosaurus',100);
    await garage.startRestoreChanneling('2','Triceratops',100); await garage.parkActiveDino(); assert.equal(requests,1);
    garage.cancelRestoreChanneling(); gate.resolve({ok:true}); await a;
    assert.equal(garage.restoreChannelingTimer,null); assert.equal(garage.actionBusy,false);
  });
  await test('Preparation failure never sends a final garage mutation', async () => {
    const e=environment(); const garage=script(e,'assets/js/gara.js','Garage');
    e.context.App={showToast:()=>{}}; e.context.fetch=async()=>({ok:false});
    await garage.startRestoreChanneling('1','Tyrannosaurus',100);
    assert.equal(garage.actionBusy,false); assert.equal(garage.pendingRestoreDino,null); assert.equal(e.timers.size,0);
  });
  await test('Garage countdown follows elapsed time instead of the number of timer ticks', async () => {
    const e=environment(); const garage=script(e,'assets/js/gara.js','Garage'); let final=0;
    e.context.App={showToast:()=>{}}; garage.executeFinalRestore=async()=>final++;
    await garage.startRestoreChanneling('1','Tyrannosaurus',100);
    const tick=e.timers.get(garage.restoreChannelingTimer); e.clock.now+=31000; await tick();
    assert.equal(final,1); assert.equal(garage.restoreRemainingSeconds,0); assert.equal(garage.restoreChannelingTimer,null);
  });
  await test('Expired trades refresh at most once per ten seconds', async () => {
    const e=environment(); const trade=inline(e,'giao-dich.html','TradeApp'); let loads=0;
    e.context.document.querySelectorAll=()=>[{getAttribute:()=>100,querySelector:()=>null}];
    trade.incomingTrades=[{}]; trade.loadData=()=>loads++; trade.startCountdownTimer();
    const tick=e.timers.get(trade.countdownInterval); for(let i=0;i<20;i++)tick(); assert.equal(loads,1);
    e.clock.now+=10000; tick(); assert.equal(loads,2);
  });
  await test('A double click cannot send two crate purchases', async () => {
    const e=environment(); e.context.App={showToast:()=>{}};
    inline(e,'hom-qua.html','openHalloweenGacha');
    vm.runInContext("myBalance=100; getActiveSteamId=()=> '76561198000000001';",e.context);
    const gate=deferred(); let calls=0; e.context.fetch=()=>{calls++;return gate.promise;};
    const a=e.context.subject(10); await e.context.subject(10); assert.equal(calls,1);
    gate.resolve({ok:false,json:async()=>({error:'QA denied'})}); await a;
  });
  return results;
};
if (require.main === module) module.exports().then(r=>console.log(`PASS ${r.length} regressions\n`+r.join('\n'))).catch(e=>{console.error(e);process.exitCode=1;});
