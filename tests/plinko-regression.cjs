const assert=require('node:assert/strict'),crypto=require('node:crypto');
const engine=require('../src/services/plinko-engine'),create=require('../src/services/plinko');
const previous={enabled:process.env.PLINKO_ENABLED,url:process.env.PLINKO_DATABASE_URL,testIds:process.env.PLINKO_TEST_STEAM_IDS};
delete process.env.PLINKO_TEST_STEAM_IDS;
process.env.PLINKO_ENABLED='true';process.env.PLINKO_DATABASE_URL='postgres://offline.invalid/test';
function fixture(failKind){
  const rows=new Map(),locks=new Set(),balances=new Map([['A',500],['B',900]]),calls=[];
  const store={withPlayer:async(sid,fn)=>{if(locks.has(sid))throw Object.assign(Error('locked'),{status:429});locks.add(sid);try{return await fn({});}finally{locks.delete(sid);}},
    history:async sid=>[...rows.values()].filter(r=>r.steam_id===sid&&r.status!=='prepared'),
    unresolved:async(c,sid)=>[...rows.values()].some(r=>r.steam_id===sid&&['review','debit_pending','credit_pending'].includes(r.status)),
    prepare:async(c,sid)=>{const existing=[...rows.values()].find(r=>r.steam_id===sid&&r.status==='prepared');if(existing)return existing;const row={id:crypto.randomUUID(),steam_id:sid,seed:crypto.randomBytes(32).toString('hex'),status:'prepared',payload:{},created_at:Date.now()};rows.set(row.id,row);return row;},
    get:async(c,id,sid)=>rows.get(id)?.steam_id===sid?rows.get(id):undefined,
    update:async(c,row,status,payload=row.payload)=>{const next={...row,status,payload:structuredClone(payload)};rows.set(row.id,next);return next;}};
  const bank={balance:async sid=>balances.get(sid),change:async(sid,amount,reason)=>{calls.push({sid,amount,reason});assert.notEqual([...rows.values()].find(r=>reason.endsWith(r.id)).status,'prepared');if(failKind&&reason.includes('_'+failKind+'_'))return null;const balance=balances.get(sid)+amount;balances.set(sid,balance);return{ok:true,balance,applied:true};}};
  return{service:create(bank,store),rows,calls,balances};
}
const input=g=>({gameId:g.id,amount:10,rows:16,risk:'low',clientSeed:'offline-seed'});
(async()=>{
  for(let rows=8;rows<=16;rows++)for(const risk of engine.risks){const t=engine.table(rows,risk);assert.equal(t.multipliers.length,rows+1);assert(Math.abs(t.probabilities.reduce((a,b)=>a+b,0)-1)<1e-12);assert(t.rtp<=0.914+1e-12&&t.rtp>0.9138);for(let k=0;k<=rows;k++){assert(Math.abs(t.probabilities[k]-t.probabilities[rows-k])<1e-12);assert(Math.abs(t.multipliers[k]-t.multipliers[rows-k])<0.00011);}assert(t.multipliers.every(m=>m>=0&&m<=10000));}
  assert.equal(engine.table(16,'extreme').multipliers[0],10000);
  const result=engine.draw('server','client',16);assert.deepEqual(engine.draw('server','client',16),result);assert.equal(result.path.length,16);assert.equal(result.slot,result.path.filter(d=>d==='R').length);assert.equal(engine.commitment('server'),crypto.createHash('sha256').update('server').digest('hex'));
  assert.equal(engine.payout(10,0.914),9);
  const f=fixture(),g=await f.service.prepare('A');assert(!('serverSeed' in g));assert.equal((await f.service.prepare('A')).id,g.id);
  for(const edit of [{amount:0},{amount:501},{amount:1.5},{rows:17},{risk:'fake'},{clientSeed:''},{gameId:'invalid'}])assert.throws(()=>engine.validate({...input(g),...edit}));
  await assert.rejects(f.service.play('B',input(g)),e=>e.status===404);
  await assert.rejects(f.service.play(null,input(g)),e=>e.status===401);
  const played=await f.service.play('A',{...input(g),commitment:'forged',status:'review',payout:999999,balance:999999,serverSeed:'forged'});assert.equal(played.game.status,'settled');assert.equal(played.game.commitment,g.commitment);assert.equal(engine.commitment(played.game.serverSeed),g.commitment);assert.deepEqual(engine.draw(played.game.serverSeed,'offline-seed',16).path,played.game.path);assert.equal(f.balances.get('A'),500-10+played.game.payout);assert.notEqual(played.game.payout,999999);
  const callCount=f.calls.length;const replay=await f.service.play('A',input(g));assert(replay.replayed);assert.equal(f.calls.length,callCount);
  process.env.PLINKO_ENABLED='false';assert((await f.service.play('A',input(g))).replayed);await assert.rejects(f.service.prepare('A'),e=>e.status===503);process.env.PLINKO_ENABLED='true';
  assert.equal((await f.service.state('B')).balance,900);assert.equal((await f.service.state('B')).history.length,0);assert.equal((await f.service.state(null)).tables.length,36);
  const offline=create({balance:async()=>{throw Error('offline');}}, {database:async()=>{throw Error('offline');},history:async()=>[]});
  const offlineState=await offline.state('A');assert.equal(offlineState.ready,false);assert.equal(offlineState.walletAvailable,false);assert.equal(offlineState.tables.length,36);
  const walletOffline=create({balance:async()=>{throw Error('offline');}}, {database:async()=>{},history:async()=>[]});assert.equal((await walletOffline.state('A')).walletAvailable,false);
  const poor=await f.service.prepare('A');f.balances.set('A',0);await assert.rejects(f.service.play('A',input(poor)),e=>e.status===400);assert.equal(f.calls.length,callCount);
  for(const kind of ['debit','payout']){const failed=fixture(kind),pending=await failed.service.prepare('A');const row=failed.rows.get(pending.id);let seed='winning';while(engine.payout(10,engine.table(16,'low').multipliers[engine.draw(seed,'offline-seed',16).slot])===0)seed+='x';row.seed=seed;
    await assert.rejects(failed.service.play('A',input(pending)),e=>e.status===503);assert.equal(failed.rows.get(pending.id).status,'review');const count=failed.calls.length;await assert.rejects(failed.service.play('A',input(pending)),e=>e.status===409);await assert.rejects(failed.service.prepare('A'),e=>e.status===409);assert.equal(failed.calls.length,count);const failedState=await failed.service.state('A');assert(failedState.blocked);assert(!('serverSeed' in failedState.history[0]));}
  process.env.PLINKO_ENABLED='false';process.env.PLINKO_TEST_STEAM_IDS='76561198682056372';
  assert.equal((await f.service.state(null)).ready,false);assert.equal((await f.service.state('76561198000000002')).ready,false);
  assert.equal((await f.service.state('76561198682056372')).ready,true);
  await assert.rejects(f.service.prepare('B'),e=>e.status===503);
  process.env.PLINKO_TEST_STEAM_IDS='invalid';assert.equal((await f.service.state('76561198682056372')).ready,false);
  console.log('PASS Plinko: 36 probability/payout tables, deterministic HMAC, commitment, validation, private history, wallet balance isolation, unique-game replay, insufficient points, uncertain debit/payout blocks, disabled mode, private test-account gate; no live transactions');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const [key,value] of [['PLINKO_ENABLED',previous.enabled],['PLINKO_DATABASE_URL',previous.url],['PLINKO_TEST_STEAM_IDS',previous.testIds]])if(value===undefined)delete process.env[key];else process.env[key]=value;});
