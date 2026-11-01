// Headless browser QA against offline fixtures only. Never contacts the game wallet.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {renderPage,readPublicAsset}=require('./helpers/source.cjs'),engine=require('../src/services/plinko-engine');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.build-cache/plinko-browser');fs.mkdirSync(out,{recursive:true});
const steam='76561198000000001',games=new Map();let balance=2000,prepareCount=0,playCount=0,activeWalletRequests=0,maxWalletRequests=0,failNextPlay=false;
const tables=Array.from({length:9},(_,i)=>engine.risks.map(risk=>engine.table(i+8,risk))).flat();
const user=()=>({linked:true,isLoggedIn:true,steam_id:steam,persona_name:'Offline QA',avatar:'/assets/imges/st25-favicon.png',balance,coins:balance,lua:balance,notifications:[]});
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
    res.setHeader('Content-Type','application/json');let result={success:true,items:[],data:[],players:[],quests:[],trades:[],incomingTrades:[],outgoingTrades:[],listings:[],inventory:[],garage:[],dinos:[],tickets:[]};
    if(url.pathname==='/api/player/me')result=user();
    if(url.pathname==='/api/plinko/state')result={ready:true,authenticated:true,walletAvailable:true,blocked:false,balance,tables,history:[...games.values()].filter(g=>g.status!=='prepared'),message:'Offline fixtures only'};
    if(req.method!=='GET'){
      if(!['/api/plinko/prepare','/api/plinko/play'].includes(url.pathname)){res.writeHead(403);return res.end(JSON.stringify({error:'All other mutations blocked'}));}
      activeWalletRequests++;maxWalletRequests=Math.max(maxWalletRequests,activeWalletRequests);res.once('finish',()=>activeWalletRequests--);await new Promise(resolve=>setTimeout(resolve,25));
      if(url.pathname.endsWith('/prepare')){prepareCount++;const id=crypto.randomUUID(),serverSeed=crypto.randomBytes(32).toString('hex');games.set(id,{id,serverSeed,commitment:engine.commitment(serverSeed),status:'prepared'});const g=games.get(id);result={id,commitment:g.commitment};}
      else{playCount++;let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);engine.validate(body);if(failNextPlay){failNextPlay=false;Object.assign(games.get(body.gameId),body,{status:'review'});res.writeHead(503);return res.end(JSON.stringify({error:'Offline uncertain wallet reply'}));}const g=games.get(body.gameId),draw=engine.draw(g.serverSeed,body.clientSeed,body.rows),multiplier=engine.table(body.rows,body.risk).multipliers[draw.slot],payout=Math.floor(body.amount*multiplier);balance+=payout-body.amount;Object.assign(g,body,draw,{multiplier,payout,balance,status:'settled',algorithm:'hmac-sha256-row-v1'});result={game:g,balance};}
    }
    return res.end(JSON.stringify(result));
  }
  try{const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('outside');const ext=path.extname(file);res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.svg':'image/svg+xml'}[ext]||'application/octet-stream');if(/^\/[\w-]+\.html$/.test(url.pathname))return res.end(renderPage(path.basename(file)));if(/^\/assets\/js\/(?:core\.js|api\/|features\/)/.test(url.pathname))return res.end(readPublicAsset(url.pathname));res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`,profile=path.join(out,'profile-'+Date.now());
  const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--disable-gpu','--no-first-run','--disable-background-networking',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:'ignore'});
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));let socket;const errors=[],metrics=[];
  try{
    const portFile=path.join(profile,'DevToolsActivePort');let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(portFile,'utf8').split('\n')[0].trim();if(/^\d+$/.test(port))break;}catch{}await pause(100);}if(!port)throw Error('Headless Chrome unavailable');
    const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});let id=0;const pending=new Map();
    socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);const task=pending.get(m.id);if(task){pending.delete(m.id);m.error?task.reject(m.error):task.resolve(m.result);}};
    const call=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;const timeout=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method));},15000);pending.set(key,{resolve:r=>{clearTimeout(timeout);resolve(r);},reject:e=>{clearTimeout(timeout);reject(e);}});socket.send(JSON.stringify({id:key,method,params}));});
    const evaluate=async expression=>{const response=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);return response.result.value;};
    const until=async expression=>{for(let i=0;i<80;i++){if(await evaluate(expression))return;await pause(100);}throw Error('Condition timed out: '+expression+' '+await evaluate('JSON.stringify({feedback:document.getElementById("plinko-feedback")?.textContent,hidden:document.hidden,reduced:matchMedia("(prefers-reduced-motion: reduce)").matches,motion:document.getElementById("plinko-motion")?.getAttribute("aria-pressed"),rounds:document.querySelectorAll("#plinko-history [data-proof]").length,proof:document.getElementById("plinko-proof")?.textContent,button:document.getElementById("plinko-play")?.textContent,disabled:document.getElementById("plinko-play")?.disabled})')); };
    await call('Runtime.enable');await call('Network.enable');await call('Network.setBlockedURLs',{urls:['*islepilot.eu*','*steamcommunity.com*','*api.steampowered.com*']});
    for(const width of [1440,768,390,320]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await call('Page.navigate',{url:origin+'/plinko.html?qa='+width});await until(`location.search==='?qa=${width}' && document.readyState==='complete' && typeof App!=='undefined' && App.authResolved && document.querySelectorAll('#plinko-slots button').length===17 && !document.getElementById('plinko-play').disabled`);await evaluate('document.fonts.ready.then(()=>true)');assert.notEqual(await evaluate('getComputedStyle(document.getElementById("plinko-play")).backgroundImage'),'none','Play button must retain its Plinko gradient');
      const metric=JSON.parse(await evaluate(`JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,slots:document.querySelectorAll("#plinko-slots button").length,menuLinks:Array.from(document.links).filter(a=>a.getAttribute("href")==="plinko.html").length})`));assert(metric.scroll<=metric.width,JSON.stringify(metric));assert(metric.menuLinks>=2);metrics.push(metric);
      const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`plinko-${width}.png`),Buffer.from(shot.data,'base64'));
    }
    await evaluate('window.boardPaints=0;const boardCtx=document.getElementById("plinko-board").getContext("2d");const drawImage=boardCtx.drawImage.bind(boardCtx);boardCtx.drawImage=(...args)=>{window.boardPaints++;return drawImage(...args)}');
    await pause(150);assert.equal(await evaluate('window.boardPaints'),0,'Idle board must not redraw');
    await evaluate('document.getElementById("plinko-form").requestSubmit()');await until('document.querySelector("#plinko-history [data-proof]")!==null');assert.equal(playCount,1,'Every ball must use the server wallet');assert.equal(await evaluate('document.querySelectorAll("#plinko-mode option").length'),1);assert.equal(await evaluate('document.getElementById("plinko-mode").value'),'wallet');
    assert(await evaluate('window.boardPaints')>10,'Animated ball must render frames');
    await evaluate('document.getElementById("plinko-motion").click();window.boardPaints=0;document.getElementById("plinko-form").requestSubmit()');
    await until('document.querySelectorAll("#plinko-history [data-proof]").length===2');assert(await evaluate('window.boardPaints')<=3,'Motion disabled must settle without animation loop');
    assert.equal(await evaluate('document.getElementById("plinko-motion").getAttribute("aria-pressed")'),'false');
    await evaluate('document.getElementById("plinko-motion").click();document.getElementById("plinko-form").requestSubmit()');
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await until('document.querySelectorAll("#plinko-history [data-proof]").length===3 && !document.getElementById("plinko-play").disabled && document.getElementById("plinko-motion").getAttribute("aria-pressed")==="false"');
    assert.equal(await evaluate('document.getElementById("plinko-motion").getAttribute("aria-pressed")'),'false');
    await call('Emulation.setEmulatedMedia',{features:[]});
    const effectsShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'plinko-effects.png'),Buffer.from(effectsShot.data,'base64'));

    await evaluate('document.querySelector("#plinko-history [data-proof]").click()');await until('document.getElementById("plinko-proof").textContent.includes(String.fromCharCode(34)+"verified"+String.fromCharCode(34)+": true")');
    for(const rows of [8,12,16])for(const risk of engine.risks){await evaluate(`document.getElementById('plinko-rows').value='${rows}';document.getElementById('plinko-risk').value='${risk}';document.getElementById('plinko-rows').dispatchEvent(new Event('change'))`);assert.equal(await evaluate('document.querySelectorAll("#plinko-slots button").length'),rows+1);}
    await evaluate('document.getElementById("plinko-motion").setAttribute("data-qa","burst");window.beforeBurst=document.querySelectorAll("#plinko-history [data-proof]").length;for(let i=0;i<21;i++)document.getElementById("plinko-form").requestSubmit()');
    assert.equal(await evaluate('document.getElementById("plinko-active").textContent'),'20 / 20 '+String.fromCharCode(98,243,110,103));
    assert.equal(await evaluate('document.getElementById("plinko-play").disabled'),true,'21st rapid click must not enqueue');
    await until('Number(document.getElementById("plinko-board").dataset.flying)>=2');
    const multiShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'plinko-multi20.png'),Buffer.from(multiShot.data,'base64'));
    await until('document.getElementById("plinko-active").textContent.startsWith("0 / 20")');
    assert.equal(await evaluate('document.querySelectorAll("#plinko-history [data-proof]").length'),23,'Exactly 20 new wallet rounds');assert.equal(playCount,23);
    await evaluate('document.getElementById("plinko-mode").value="wallet";document.getElementById("plinko-mode").dispatchEvent(new Event("change"));document.getElementById("plinko-form").requestSubmit()');await until('document.getElementById("plinko-active").textContent.startsWith("0 / 20") && document.getElementById("plinko-feedback").textContent.startsWith("\u0110\u00e3 tr\u1eeb")');assert.equal(playCount,24);assert.equal(prepareCount,24);await until('!document.getElementById("plinko-play").disabled && !document.getElementById("plinko-auto").disabled');
    await evaluate('document.getElementById("plinko-auto").click();document.getElementById("plinko-count").value="2";document.getElementById("plinko-form").requestSubmit()');await until('!document.getElementById("plinko-play").disabled');assert.equal(playCount,26,'Auto mode must finish both balls: '+await evaluate('JSON.stringify({feedback:document.getElementById("plinko-feedback").textContent,auto:document.getElementById("plinko-auto").getAttribute("aria-pressed"),valid:document.getElementById("plinko-form").checkValidity(),count:document.getElementById("plinko-count").value})'));
    await evaluate('document.getElementById("plinko-manual").click();for(let i=0;i<5;i++)document.getElementById("plinko-form").requestSubmit()');
    await until('document.getElementById("plinko-active").textContent.startsWith("0 / 20")');
    assert.equal(playCount,31);assert.equal(prepareCount,31);assert.equal(maxWalletRequests,1,'Queued wallet mutations must run serially while animations overlap');
    await evaluate('document.querySelector("#plinko-history [data-proof]").click()');await until('document.getElementById("plinko-proof").textContent.includes(String.fromCharCode(34)+"verified"+String.fromCharCode(34)+": true")');assert.deepEqual(errors,[]);
    failNextPlay=true;
    await evaluate('for(let i=0;i<5;i++)document.getElementById("plinko-form").requestSubmit()');
    await until('document.getElementById("plinko-active").textContent.startsWith("0 / 20") && document.getElementById("plinko-feedback").textContent.includes("Offline uncertain wallet reply")');
    await until('document.getElementById("plinko-play").disabled');
    assert.equal(playCount,32,'Wallet failure must cancel all four unissued rounds');assert.equal(prepareCount,32);assert.equal(maxWalletRequests,1);assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'offline fixtures; no real wallet operations',metrics,prepareCount,playCount,maxWalletRequests,errors},null,2));console.log('PASS Plinko browser (20 overlapping wallet balls, 21st rejected, queue stops on wallet failure): four responsive widths, wallet-only, no demo option, 12 risk/row switches, HMAC proofs, wallet UI, two-ball auto sequence, no JS errors');await call('Browser.close');
  }finally{if(errors.length)console.log(JSON.stringify(errors));socket?.close();child.kill();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
