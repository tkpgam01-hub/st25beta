const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const source=fs.readFileSync('src/core/auth.js','utf8');
for(const secret of [undefined,'weak']){
 const module={exports:{}};
 vm.runInNewContext(source,{module,require:name=>name==='./config'?{}:require(name),process:{env:{SESSION_SECRET:secret}},Buffer});
 const auth=module.exports,payload=Buffer.from(JSON.stringify({kind:'session',steamId:'76561198000000001',expires:Date.now()+60000})).toString('base64url');
 const signature=crypto.createHmac('sha256','st25-evrima-vietnam-auth-secret-key-2026-safe-fallback').update(payload).digest('base64url');
 assert.equal(auth.configured,false);assert.equal(auth.verify(payload+'.'+signature),null);
 assert.equal(auth.getRequestSteamId({headers:{cookie:'st25_session_token='+payload+'.'+signature}}),null);
 assert.throws(()=>auth.sign({}),e=>e.status===503);
}
console.log('PASS authentication: missing/weak secret disables sign-in and rejects forged legacy fallback sessions');
