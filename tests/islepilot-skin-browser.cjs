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
  '/api/admin/check':{isAdmin:false,isSuperAdmin:false},'/api/casino/stats':{enabled:false}
};
if(process.env.ST25_3D_GUEST) fixtures['/api/player/me']={linked:false,isLoggedIn:false};
const fallback={success:true,items:[],data:[],players:[],quests:[],trades:[],incomingTrades:[],outgoingTrades:[],listings:[],marketListings:[],inventory:[],garage:[],dinos:[],skins:[],ownedSkins:[],crates:[],tickets:[],types:[],locations:[],rules:[],leaderboard:[],referrals:[],balance:202,coins:202,lua:202};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');if(req.method!=='GET'){res.writeHead(403);return res.end(JSON.stringify({error:'Offline fixture blocks live actions'}));}return res.end(JSON.stringify(fixtures[url.pathname]||fallback));}
  const requested=url.pathname.startsWith('/cdn/skinviewer/')?path.join(root,'assets/vendor/islepilot-skin',decodeURIComponent(url.pathname)):path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!requested.startsWith(root+path.sep)||!/(?:\.html|\.css|\.js|\.mjs|\.png|\.jpg|\.webp|\.ico|\.ttf|\.json|\.glb|\.woff2|\.hdr)$/.test(requested)){res.writeHead(404);return res.end();}
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

    const results=[];
    for(const width of [1440,1024,768,390,320]){
      errors=[];
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
      await call('Page.navigate',{url:origin+'/skin.html'});
      for(let i=0;i<150;i++){
        await pause(100);
        const result=await call('Runtime.evaluate',{expression:"!!document.getElementById('islepilot-skin-frame')?.contentWindow?.ST25OriginalSkin?.ready",returnByValue:true});
        if(result.result.value)break;
      }
      await pause(2500);
      const exercise=await call('Runtime.evaluate',{expression:`(async()=>{
        const frame=document.getElementById('islepilot-skin-frame'),w=frame.contentWindow,d=w.document;
        const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const waitFor=async predicate=>{for(let i=0;i<120;i++){if(await predicate())return true;await pause(50);}return false;};
        let copied='';Object.defineProperty(w.navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});
        const button=text=>[...d.querySelectorAll('button')].find(b=>b.textContent.trim().toLowerCase()===text.toLowerCase());
        button('Sao chép JSON').click();await pause(100);
        const before=JSON.parse(copied);
        const color=d.querySelector('input[type=color]');
        Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(color,'#ff3300');
        color.dispatchEvent(new w.Event('input',{bubbles:true}));color.dispatchEvent(new w.Event('change',{bubbles:true}));
        await pause(350);button('Sao chép JSON').click();await pause(100);
        const after=JSON.parse(copied);
        const preset=d.querySelector('input[placeholder="Tên preset"]');
        Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(preset,'QA preset '+${width});
        preset.dispatchEvent(new w.Event('input',{bubbles:true}));await pause(100);button('Lưu').click();await pause(100);
        const saved=JSON.parse(w.localStorage.getItem('skyclaw-skin-presets')||'[]');
        const result={color:after.body[0]!==before.body[0]&&after.body[1]!==before.body[1],preset:saved.some(x=>x.name==='QA preset '+${width}),linear:after.body[0]===1,applyEnabled:!button('Áp dụng trong game').disabled};
        result.glitchLocked=!button('Glitch')&&d.body.innerText.includes('Glitch đã khóa');
        const user=App.user;App.user=null;App.publishUser();
        result.guestBlocked=await waitFor(()=>button('Áp dụng trong game')?.disabled);
        App.user=user;App.publishUser();
        result.sessionRestored=await waitFor(()=>button('Áp dụng trong game')&&!button('Áp dụng trong game').disabled);
        result.orange=w.getComputedStyle(d.documentElement).getPropertyValue('--primary').trim()==='#f6ab45';
        result.fee=d.querySelector('.st25-apply-fee')?.textContent.includes('10 Lúa')&&button('Áp dụng trong game').classList.contains('st25-apply-button');
        result.optimizedTextures=w.performance.getEntriesByType('resource').some(x=>x.name.includes('.preview.webp'));
        const viewer=d.querySelector('.skin-preview-column').getBoundingClientRect(),colours=d.querySelector('.skin-colours').getBoundingClientRect();
        result.evenFrames=w.innerWidth<=760||Math.abs(viewer.bottom-colours.bottom)<2;
        result.speciesCards=d.querySelectorAll('.skin-species-card').length===20;
        result.speciesImages=[...d.querySelectorAll('.skin-species-card img')].every(x=>x.complete&&x.naturalWidth>0);
        d.querySelector('[data-species="Carnotaurus"]').click();await waitFor(()=>d.querySelector('[data-species="Carnotaurus"]').getAttribute('aria-pressed')==='true');
        button('Sao chép JSON').click();await pause(100);
        result.speciesSelection=JSON.parse(copied).class==='BP_Carnotaurus_C'&&d.querySelector('[data-species="Carnotaurus"]').getAttribute('aria-pressed')==='true';
        // Select the second numeric field (pattern), rather than the variation field.
        const patternInput=d.querySelectorAll('.skin-pattern-fields input')[1];
        Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(patternInput,'1');patternInput.dispatchEvent(new w.Event('input',{bubbles:true}));await pause(200);
        result.pattern=await waitFor(async()=>{button('Sao chép JSON').click();await pause(50);return JSON.parse(copied).pattern===1;});
        d.querySelector('[data-species="Tyrannosaurus"]').click();await waitFor(()=>d.querySelector('[data-species="Tyrannosaurus"]').getAttribute('aria-pressed')==='true');await pause(600);
        result.visibilityPause=true;
        if(${width}===1440){
          const canvas=d.querySelector('canvas');
          const proto=w.WebGL2RenderingContext.prototype,original=proto.drawElements;
          let draws=0;proto.drawElements=function(...args){draws++;return original.apply(this,args);};
          const spacer=document.createElement('div');spacer.style.height='2000px';document.body.append(spacer);
          const reveal=()=>window.scrollTo(0,frame.getBoundingClientRect().top+window.scrollY+canvas.getBoundingClientRect().top-150);
          try{
            reveal();await waitFor(()=>canvas.dataset.renderMode==='always');await pause(600);const visible=draws;
            window.scrollTo(0,document.body.scrollHeight);
            const paused=await waitFor(()=>canvas.dataset.renderMode==='never');
            await pause(100);draws=0;await pause(600);const hidden=draws;
            reveal();const resumed=await waitFor(()=>canvas.dataset.renderMode==='always');
            draws=0;await pause(600);const restored=draws;
            w.ST25SkinRenderAudit={visible,hidden,restored};
            result.visibilityPause=paused&&resumed&&visible>0&&hidden===0&&restored>0;
          }finally{proto.drawElements=original;spacer.remove();window.scrollTo(0,0);}
        }
        result.compactFrame=Math.abs(frame.clientHeight-d.getElementById('islepilot-skin-root').getBoundingClientRect().bottom-2)<4;
        return result;
      })()`,awaitPromise:true,returnByValue:true});
      const result=await call('Runtime.evaluate',{expression:`(()=>{const frame=document.getElementById('islepilot-skin-frame'),w=frame?.contentWindow,d=w?.document;return {ready:!!w?.ST25OriginalSkin?.ready,canvas:d?.querySelectorAll('canvas').length,colors:d?.querySelectorAll('input[type=color]').length,scroll:document.documentElement.scrollWidth,innerScroll:d?.documentElement.scrollWidth,status:d?.getElementById('skin-client-status').textContent,alerts:[...d?.querySelectorAll('[role=alert]')||[]].map(x=>x.textContent),text:d?.body.innerText.slice(0,1300)}})()`,returnByValue:true});
      const record={width,...result.result.value,exercise:exercise.exceptionDetails?{error:exercise.exceptionDetails.exception?.description||exercise.exceptionDetails.text}:exercise.result.value,errors:[...errors]};results.push(record);console.log(JSON.stringify(record));
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(__dirname,'islepilot-skin-'+width+'.png'),Buffer.from(shot.data,'base64'));
    }
    fs.writeFileSync(path.join(__dirname,'islepilot-skin-results.json'),JSON.stringify(results,null,2));
    await call('Browser.close');
    if(results.some(r=>!r.ready||!r.canvas||r.colors!==10||r.scroll>r.width||r.errors.length||r.alerts.length||!r.exercise||Object.values(r.exercise).some(x=>x!==true)))process.exitCode=1;
  }finally{socket?.close();child.kill();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
