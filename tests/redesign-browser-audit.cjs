// Local visual audit. The fixture blocks mutations and never contacts IslePilot.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const {renderPage, readPublicAsset}=require('./helpers/source.cjs');
const steam='76561198000000001';
const dino={species:'Tyrannosaurus',gender:'Đực (Male)',growth:90,health:51,hunger:99,thirst:99,stamina:100,grid:'F7',lat:450,lng:500,position:{x:0,y:0}};
const user={linked:true,isLoggedIn:true,steam_id:steam,persona_name:'ST25 Survivor',avatar:'/assets/imges/st25-favicon.png',balance:202,coins:202,lua:202,role:'Thành viên',roleKey:'default',maxSlots:20,totalParked:6,notifications:[],dino};
const fixtures={
  '/api/skin/info':{balance:202,isOnline:true,personaName:'ST25 Survivor',steamId:steam,species:'Tyrannosaurus',growth:90,ownedSkins:[],shopSkins:[]},
  '/api/player/me':user,'/api/player/vitals':{steam_id:steam,dino},
  '/api/server/status':{name:'ST25 VIETNAM',status:'online',online:true,online_players:17,max_players:100,map:'Gateway'},
  '/api/server/environment':{isDay:true,displayBadge:'🌤️ Ban ngày · Trời quang 29°C',weatherIcon:'🌤️'},
  '/api/player/quests':{steamId:steam,isLoggedIn:true,player:{name:user.persona_name,species:dino.species,gender:dino.gender,growth:90,online:true,avatar:user.avatar},coins:202,serverQuests:[{id:'1',name:'Bậc thầy sinh tồn',description:'Sinh tồn 120 phút trên đảo Gateway.',period:'daily',progress:82,config:{minutes:120},rewardAmount:12},{id:'2',name:'Khám phá Gateway',description:'Di chuyển 25 km trên đảo.',period:'daily',progress:5300,config:{km:25},rewardAmount:15}],primeQuests:[]},
  '/api/player/map':{...dino,steam_id:steam,linked:true,online:true,name:user.persona_name,dino,player:user},
  '/api/player/team':{members:[],team:[]},'/api/map/zones':{zones:[],pois:[]},
  '/api/player/garage':{steamId:steam,activeDino:dino,maxSlots:20,totalParked:0,garage:[],slots:[],dinos:[],roleName:'Thành viên',roleKey:'default'},
  '/api/admin/check':{isAdmin:false,isSuperAdmin:false}
};
if(process.env.ST25_3D_GUEST) fixtures['/api/player/me']={linked:false,isLoggedIn:false};
const fallback={success:true,items:[],data:[],players:[],quests:[],trades:[],incomingTrades:[],outgoingTrades:[],listings:[],marketListings:[],inventory:[],garage:[],dinos:[],skins:[],ownedSkins:[],crates:[],tickets:[],types:[],locations:[],rules:[],leaderboard:[],referrals:[],balance:202,coins:202,lua:202};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');if(req.method!=='GET'){res.writeHead(403);return res.end(JSON.stringify({error:'Offline fixture blocks live actions'}));}return res.end(JSON.stringify(fixtures[url.pathname]||fallback));}
  const requested=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!requested.startsWith(root+path.sep)||!/(?:\.html|\.css|\.js|\.mjs|\.png|\.jpg|\.webp|\.ico|\.ttf|\.json)$/.test(requested)){res.writeHead(404);return res.end();}
  const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ttf':'font/ttf','.json':'application/json'};
  try{
    res.setHeader('Content-Type',types[path.extname(requested)]||'application/octet-stream');
    if (/^\/[a-zA-Z0-9_-]+\.html$/.test(url.pathname) || url.pathname==='/') res.end(renderPage(path.basename(requested)));
    else if (/^\/assets\/js\/(?:core\.js|api\/|features\/)/.test(url.pathname)) res.end(readPublicAsset(url.pathname));
    else res.end(fs.readFileSync(requested));
  }catch{res.writeHead(404);res.end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const profile=path.join(__dirname,`.redesign-browser-${Date.now()}`);
  const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--disable-gpu',...(process.env.ST25_3D_FALLBACK?['--disable-webgl']:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']),'--no-first-run','--disable-background-networking',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:'ignore'});
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));let socket;
  try{
    const portFile=path.join(profile,'DevToolsActivePort');let port;
    for(let i=0;i<100;i++) {
      try {const candidate=fs.readFileSync(portFile,'utf8').split('\n')[0].trim();if(/^\d+$/.test(candidate)){port=candidate;break;}}catch{}
      await pause(100);
    }
    if(!port)throw new Error('Chrome debugging port did not become ready');
    const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    let id=0;const pending=new Map();let errors=[];
    socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);if(process.env.ST25_3D_AUDIT && message.method==='Runtime.consoleAPICalled' && message.params.type==='error' && !(process.env.ST25_3D_FALLBACK && message.params.args.some(arg=>/WebGL.*context|Error creating WebGL/.test(String(arg.value))))) errors.push(message.params.args.map(arg=>arg.value||arg.description||'').join(' '));const task=pending.get(message.id);if(task){pending.delete(message.id);message.error?task.reject(message.error):task.resolve(message.result);}};
    const call=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
    await call('Runtime.enable');await call('Network.enable');
    await call('Network.setBlockedURLs',{urls:['*islepilot.eu*','*steamcommunity.com*','*api.steampowered.com*']});
    const pages=['index.html','bando.html','gara.html','nhiem-vu.html','giao-dich.html','hom-qua.html','skin.html','bxh.html','ho-tro.html','noi-quy.html','tai-hud.html','moi-ban.html','tha-xac.html','lien-ket-steam.html','cai-dat.html'];
    const cases=(process.env.ST25_SKIN_AUDIT || process.env.ST25_3D_AUDIT || process.env.ST25_ILLUSTRATION_AUDIT) ? [1440,1024,768,390,320].map(width=>({page:'skin.html',width})) : [...pages.map(page=>({page,width:1440})),...['index.html','bando.html','gara.html','nhiem-vu.html','giao-dich.html'].map(page=>({page,width:390}))];
    const results=[];
    for(const {page,width} of cases){errors=[];await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await call('Page.navigate',{url:origin+'/'+page});
      for(let attempt=0;attempt<40;attempt++){await pause(100);const ready=await call('Runtime.evaluate',{expression:'document.readyState !== "loading" && typeof App !== "undefined" && App.authResolved && !!window.ST25UI',returnByValue:true});if(ready.result.value)break;}
      await pause(300);
      const check=await call('Runtime.evaluate',{expression:'JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,icons:document.querySelectorAll(".site-header .st25-line-icon").length,dock:!!document.getElementById("st25-live-dock"),hud:!!document.querySelector(".player-hud-bar"),brokenImages:[...document.images].filter(i=>i.getAttribute("src")&&i.complete&&!i.naturalWidth).map(i=>i.getAttribute("src"))})',returnByValue:true});
      const metrics=JSON.parse(check.result.value);const result={page,width,...metrics,errors:[...errors]};results.push(result);
      console.log(JSON.stringify(result));
      if(['index.html','bando.html','nhiem-vu.html','skin.html'].includes(page)){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:!process.env.ST25_ILLUSTRATION_AUDIT});fs.writeFileSync(path.join(__dirname,`${process.env.ST25_ILLUSTRATION_AUDIT?'skin-motion':'redesign-'+page.replace('.html','')}-${width}.png`),Buffer.from(shot.data,'base64'));}
    }
    fs.writeFileSync(path.join(__dirname,process.env.ST25_ILLUSTRATION_AUDIT?'skin-motion-results.json':process.env.ST25_3D_AUDIT ? (process.env.ST25_3D_FALLBACK?'skin-3d-fallback-results.json':process.env.ST25_3D_GUEST?'skin-3d-guest-results.json':'skin-3d-results.json') : process.env.ST25_SKIN_AUDIT?'skin-audit-results.json':'redesign-audit-results.json'),JSON.stringify({scope:'Offline mocks; transactions blocked; not a live API test',results},null,2));
    await call('Browser.close');
    if(results.some(r=>r.scroll>r.width||r.errors.length||r.brokenImages.length))process.exitCode=1;
  }finally{socket?.close();child.kill();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
