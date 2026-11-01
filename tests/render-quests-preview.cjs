// Offline visual fixture: does not start the server or contact IslePilot.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const page=require('./helpers/source.cjs').renderPage('nhiem-vu.html');
const main=page.match(/<main\b[\s\S]*?<\/main>/)[0].replace(/<!-- Personal Profile Dashboard Banner -->[\s\S]*?<div id="quest-tabs"/,'<div id="quest-tabs"');
const quests=[
  {id:'1',name:'Người săn mồi mới',description:'Hạ 3 khủng long.',period:'daily',config:{count:3},progress:0,rewardAmount:15000},
  {id:'2',name:'Sinh tồn 30 phút',description:'Chơi trong 30 phút.',period:'daily',config:{minutes:30},progress:10,rewardAmount:50000},
  {id:'3',name:'Thợ săn',description:'Hạ 6 khủng long.',period:'daily',rarity:'uncommon',config:{count:6},progress:0,rewardAmount:32500},
  {id:'4',name:'Sinh tồn 1 giờ',description:'Chơi trong 60 phút.',period:'daily',rarity:'uncommon',config:{minutes:60},progress:60,rewardAmount:85000,completed:true,canClaim:true},
  {id:'5',name:'Sinh tồn 6 giờ',description:'Hoàn thành Sinh tồn 1 giờ trước.',period:'daily',rarity:'rare',config:{minutes:360},progress:0,rewardAmount:250000,locked:true}
];
const html=`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="../assets/css/style.css"><link rel="stylesheet" href="../assets/css/fonts.css"><link rel="stylesheet" href="../assets/css/portal-layout.css"><link rel="stylesheet" href="../assets/css/quests.css"></head><body class="st25-portal quests-page">${main}<script>const App={escapeHTML:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};function claimSingleQuest(){}function claimAllQuests(){}</script><script src="../assets/js/quests.js"></script><script>document.addEventListener('DOMContentLoaded',()=>QuestBoard.render(${JSON.stringify({serverQuests:quests,primeQuests:[],events:[]})}));</script></body></html>`;
fs.writeFileSync(path.join(__dirname,'quests-preview.html'),html);
console.log('Offline preview ready');
if (process.argv.includes('--browser')) {
  (async()=>{
    const {spawn}=require('node:child_process');
    const profile=path.join(__dirname,`.quest-preview-cdp-${Date.now()}`);
    const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--disable-gpu','--no-first-run','--disable-background-networking',`--user-data-dir=${profile}`,'--remote-debugging-port=0','--allow-file-access-from-files','about:blank'],{windowsHide:true,stdio:'ignore'});
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const portFile=path.join(profile,'DevToolsActivePort');
    let socket;
    try {
      for(let i=0;i<100&&!fs.existsSync(portFile);i++) await pause(100);
      const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
      const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      socket=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
      await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
      let id=0;const pending=new Map();const errors=[];
      socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);const task=pending.get(message.id);if(task){pending.delete(message.id);message.error?task.reject(message.error):task.resolve(message.result);}};
      const call=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
      await call('Runtime.enable');
      for(const width of [1440,390]) {
        await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
        await call('Page.navigate',{url:`file:///${path.join(__dirname,'quests-preview.html').replace(/\\/g,'/')}`});
        await pause(700);
        await call('Runtime.evaluate',{expression:'document.fonts.ready',awaitPromise:true});
        const metrics=await call('Runtime.evaluate',{expression:'JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,cards:document.querySelectorAll(".quest-card").length,font:getComputedStyle(document.querySelector(".quest-card h3")).fontFamily})',returnByValue:true});
        const result=JSON.parse(metrics.result.value);
        const capture=await call('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(__dirname,`quests-${width}-verified.png`),Buffer.from(capture.data,'base64'));
        console.log(JSON.stringify({...result,errors}));
        if(result.scroll>result.width || errors.length) throw new Error('Visual audit failed');
      }
      await call('Browser.close');
    } finally {socket?.close();child.kill();}
  })().catch(error=>{console.error(error);process.exitCode=1;});
}
