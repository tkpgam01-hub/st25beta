const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const reply=data=>({ok:true,json:async()=>data});
function backend(){
  const cfg={islepilot:{api_token:'offline-fixture',api_base_url:'https://offline.invalid'}};
  const context={module:{exports:{}},process:{env:{}},AbortSignal,console:{warn(){},error(){}},fetch:async()=>reply({})};
  context.require=name=>name.includes('settings')?{getConfig:()=>cfg}:{upstreamBaseURL:'https://offline.invalid'};
  vm.runInNewContext(fs.readFileSync('src/api/islepilot-client.js','utf8'),context);
  return {api:context.module.exports,context,cfg};
}
(async()=>{
  {
    const {api,context}=backend(),gate=deferred();let calls=0;
    context.fetch=()=>{calls++;return gate.promise;};
    const reads=Array.from({length:12},()=>api.callIslePilot('/server'));
    assert.equal(calls,1);gate.resolve(reply({online:12}));
    assert((await Promise.all(reads)).every(x=>x.online===12));
    await api.callIslePilot('/server');assert.equal(calls,1);
  }
  {
    const {api,context}=backend(),gate=deferred();let calls=0;
    context.fetch=()=>{calls++;return gate.promise;};
    const a=api.callIslePilot('/server'),b=api.callIslePilot('/server');
    gate.reject(Error('offline'));assert.equal(await a,null);assert.equal(await b,null);
    context.fetch=async()=>{calls++;return reply({online:1});};
    await api.callIslePilot('/server');assert.equal(calls,2);
  }
  {
    const {api,context}=backend(),gates=[];
    context.fetch=()=>{const gate=deferred();gates.push(gate);return gate.promise;};
    const reads=[api.callIslePilot('/server'),api.callIslePilot('/server','GET',null,true),api.callIslePilot('/server','GET',null,true)];
    assert.equal(gates.length,3);
    gates.forEach((g,i)=>g.resolve(reply({version:i})));await Promise.all(reads);
    assert.equal((await api.callIslePilot('/server')).version,0);
  }
  {
    const {api,context}=backend(),gates=[];const sid='76561198000000001',path='/players/'+sid+'/garage';
    context.fetch=()=>{const gate=deferred();gates.push(gate);return gate.promise;};
    const old=api.callIslePilot(path);api.clearPlayerCache(sid);const fresh=api.callIslePilot(path);
    assert.equal(gates.length,2);gates[1].resolve(reply({slots:2}));await fresh;
    gates[0].resolve(reply({slots:1}));await old;
    assert.equal((await api.callIslePilot(path)).slots,2);
  }
  {
    const {api,context,cfg}=backend();let calls=0;
    context.fetch=async()=>reply({version:++calls});
    await api.callIslePilot('/server');cfg.islepilot.api_token='other-offline-fixture';
    assert.equal((await api.callIslePilot('/server')).version,2);
    await Promise.all([api.callIslePilot('/commands','POST',{}),api.callIslePilot('/commands','POST',{})]);assert.equal(calls,4);
  }
  {
    const timers=new Map();let id=0,calls=0;const gate=deferred();
    const context={Response,AbortController,ST25Core:{readTimeoutMs:10000},document:{addEventListener(){}},window:{},
      setTimeout:f=>{timers.set(++id,f);return id;},clearTimeout:id=>timers.delete(id),fetch:()=>{calls++;return gate.promise;}};
    vm.runInNewContext(fs.readFileSync('assets/js/app.js','utf8')+'\nglobalThis.app=App;',context);
    const a=context.app.readResponse('/api/quests'),b=context.app.readResponse('/api/quests');
    gate.resolve(new Response(JSON.stringify({error:'offline'}),{status:503}));
    const [ra,rb]=await Promise.all([a,b]);assert.equal(calls,1);assert.equal(ra.status,503);
    assert.deepEqual(await ra.json(),await rb.json());assert.equal(context.app.responseRequests.size,0);
    assert.throws(()=>context.app.readResponse('/api/quests',{method:'POST'}),/GET/);
    context.fetch=(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted'))));
    const stuck=context.app.readResponse('/api/stuck');const rejected=assert.rejects(stuck,/aborted/);
    [...timers.values()][0]();await rejected;assert.equal(context.app.responseRequests.size,0);
    context.fetch=async()=>new Response('{"ok":true}');assert.equal((await (await context.app.readResponse('/api/stuck')).json()).ok,true);
  }
  {
    const gate=deferred();let calls=0;
    const context={document:{addEventListener(){}},confirm:()=>true,App:{showToast(){}},
      ST25API:{routes:{carcassOrder:'/api/carcass/order'}},fetch:()=>{calls++;return gate.promise;}};
    vm.runInNewContext(fs.readFileSync('src/features/tha-xac.js','utf8'),context);
    const first=context.orderCarcass('1',10,'fixture');await context.orderCarcass('1',10,'fixture');assert.equal(calls,1);
    gate.reject(Error('offline'));await first;
    context.fetch=async()=>{calls++;return {ok:false,json:async()=>({error:'offline'})};};
    await context.orderCarcass('1',10,'fixture');assert.equal(calls,2);
  }
  console.log('PASS API concurrency: shared reads, independent response bodies, timeout/retry, HTTP errors, transaction freshness, invalidation race, scope change, separate mutations, carcass double click; no live calls');
})().catch(error=>{console.error(error);process.exitCode=1;});
