const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const context=vm.createContext({console,URL,TextEncoder,TextDecoder,setTimeout,clearTimeout});
context.window=context;context.self=context;
for(const file of ['assets/vendor/islepilot-skin/client.js','assets/js/islepilot-skin-runtime.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const pilot=context.ST25Pilot,defaults=pilot.require(70454),skinExports=pilot.require(110149);
const {validateSkinPayload}=require('../src/api/skin-payload');
const payload=JSON.parse(JSON.stringify(skinExports.buildSkinExportPayload({species:'Tyrannosaurus',sex:'female',palette:defaults.speciesDefaultPalette('Tyrannosaurus'),variation:0,pattern:0,theme:0})));
assert.deepEqual(validateSkinPayload(payload),payload);
assert.equal(skinExports.speciesFromBlueprintClass(payload.class),'Tyrannosaurus');
assert.equal(skinExports.parseSkinExportPayload(JSON.parse(JSON.stringify(payload))).class,payload.class);
assert.equal(defaults.PALETTE_FIELDS.length,10);
assert.throws(()=>validateSkinPayload({...payload,body:[null,0,0,1]}));
assert.throws(()=>validateSkinPayload({...payload,body:[Infinity,0,0,1]}));
assert.throws(()=>validateSkinPayload({...payload,class:'../../secret'}));
assert.throws(()=>validateSkinPayload({...payload,pattern:-1}));
const glitch={...payload,body:[999e9,-999e9,0,1]};assert.throws(()=>validateSkinPayload(glitch),/Glitch/);
const assetDirectory=path.join(root,'assets/vendor/islepilot-skin');
const manifest=JSON.parse(fs.readFileSync(path.join(assetDirectory,'assets.json'),'utf8'));
let models=0;
for(const entry of manifest){
  assert.ok(!entry.error,entry.url);
  const file=path.join(assetDirectory,entry.url.slice(1));assert.equal(fs.statSync(file).size,entry.bytes,entry.url);
  if(entry.url.endsWith('.glb')){
    const bytes=fs.readFileSync(file);assert.equal(bytes.toString('ascii',0,4),'glTF',entry.url);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
    const size=bytes.readUInt32LE(12);assert.equal(bytes.toString('ascii',16,20),'JSON');const gltf=JSON.parse(bytes.toString('utf8',20,20+size).trim());
    assert.ok(gltf.meshes.length>0);assert.ok(gltf.materials.length>0);
    for(const view of gltf.bufferViews||[])assert.ok((view.byteOffset||0)+view.byteLength<=gltf.buffers[view.buffer].byteLength,entry.url);
    models++;
  }
}
assert.ok(models>=20);
const optimized=JSON.parse(fs.readFileSync(path.join(assetDirectory,'optimized-textures.json'),'utf8'));
assert.ok(optimized.after<optimized.before*.7);
for(const entry of Object.values(optimized.textures)){
  const bytes=fs.readFileSync(path.join(assetDirectory,entry.url.slice(1)));
  assert.equal(bytes.length,entry.bytes);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
}
const page=fs.readFileSync(path.join(root,'src/pages/skin.html'),'utf8');
assert.match(page,/islepilot-skin-frame/);assert.doesNotMatch(page,/skin-illustrations|skin-3d|skin-editor-ui|assets\/js\/skin\.js/);
console.log(`PASS imported editor: 10 channels, original linear export/import, invalid payload rejection, ${models} GLB models, ${manifest.length} complete assets`);
// A real controller with fake upstream responses must preserve every linear channel.
const handlers=new Map(),calls=[];
require('../src/controllers/skin')({get(){},post:(route,handler)=>handlers.set(route,handler)},{
  getRequestSteamId:()=> '76561198000000001',getLivePlayerBalance:async()=>100,
  callIslePilot:async(url,method,body)=>{calls.push({url,method,body});return method==='POST'?{ok:true,jobId:'offline-job'}:{species:'Tyrannosaurus',online:true};},
  modifyLivePlayerBalance:async()=>({balance:90}),clearPlayerCache:()=>{},apiCache:new Map()
});
(async()=>{
  const handler=handlers.get('/api/skin/apply');
  const response={code:200,status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  await handler({body:{payload}},response);
  assert.equal(response.code,200);assert.equal(response.data.success,true);
  assert.deepEqual(calls.find(call=>call.method==='POST').body,{payload});
  const before=calls.length;await handler({body:{payload:{...payload,eyes:[NaN,0,0,1]}}},response);
  assert.equal(response.code,400);assert.equal(calls.length,before);
  await handler({body:{payload:glitch}},response);
  assert.equal(response.code,400);assert.match(response.data.error,/Glitch/);assert.equal(calls.length,before);
  console.log('PASS skin API: original payload forwarded unchanged; invalid input makes no upstream call; no live mutations');
})().catch(error=>{console.error(error);process.exitCode=1;});
