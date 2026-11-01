(() => {
  const $=id=>document.getElementById('plinko-'+id),money=n=>Number(n).toLocaleString('vi-VN')+' Lúa',esc=s=>App.escapeHTML(String(s));
  let state,automatic=false,frame,disposed=false,games=[],ball=null,currentTable;
  const maxBalls=20,animations=[],queue=[];let pendingBalls=0,processing=false,refreshPending=false,walletPaused=false;
  const canvas=$('board'),ctx=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const boardLayer=document.createElement('canvas'),boardContext=boardLayer.getContext('2d');
  let motionEnabled=!reduced.matches;
  try{const preference=localStorage.getItem('st25-plinko-motion');if(preference!==null)motionEnabled=preference==='on'&&!reduced.matches;}catch{}
  function motionControl(){$('motion').textContent='Hiệu ứng: '+(motionEnabled&&!reduced.matches?'Bật':'Tắt');$('motion').setAttribute('aria-pressed',String(motionEnabled&&!reduced.matches));}
  motionControl();
  $('motion').onclick=()=>{motionEnabled=!(motionEnabled&&!reduced.matches);try{localStorage.setItem('st25-plinko-motion',motionEnabled?'on':'off');}catch{}motionControl();if(!motionEnabled)finishAnimations();};
  reduced.addEventListener('change',()=>{motionControl();if(reduced.matches)finishAnimations();});
  $('seed').value=crypto.randomUUID();
  const feedback=s=>$('feedback').textContent=s;
  const selected=()=>state?.tables.find(t=>t.rows===Number($('rows').value)&&t.risk===$('risk').value);
  async function post(url,body){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);try{const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});const data=await res.json();if(!res.ok)throw Error(data.error||'Không xử lý được yêu cầu.');return data;}catch(e){if(e.name==='AbortError')throw Error('Chưa nhận được xác nhận. Dừng chơi và kiểm tra lịch sử; không gửi lại.');throw e;}finally{clearTimeout(timeout);}}
  function controls(){
    document.querySelectorAll('#plinko-form input,#plinko-form select,#plinko-form button[data-size],.plinko-tabs button,#plinko-seed').forEach(e=>e.disabled=pendingBalls>0);
    $('play').disabled=disposed||!currentTable||pendingBalls>=maxBalls||(automatic&&pendingBalls>0)||!state?.ready||!state?.authenticated||!state?.walletAvailable||state?.blocked||walletPaused;
    $('stop').hidden=queue.length===0;$('play').textContent=automatic?(pendingBalls?'Đang thả bóng…':'Bắt đầu tự động'):'Thả bóng ↓';
    $('active').textContent=pendingBalls+' / '+maxBalls+' bóng';$('active').classList.toggle('is-active',pendingBalls>0);
  }
  function point(row,right){const step=42,dy=37,rows=Number($('rows').value);return{x:500+(2*right-row)*step/2,y:row===rows?canvas.height-8:50+row*dy};}
  function cacheBoard(){
    boardLayer.width=canvas.width;boardLayer.height=canvas.height;
    const rows=Number($('rows').value);
    for(let r=0;r<rows;r++)for(let k=-1;k<=r+1;k++){
      const p=point(r,k),edge=k<0||k>r;
      boardContext.beginPath();boardContext.arc(p.x,p.y,edge?2.5:3.7,0,2*Math.PI);
      boardContext.fillStyle=edge?'#5d425f':'#c4aac9';boardContext.fill();
      if(!edge){boardContext.beginPath();boardContext.arc(p.x-0.7,p.y-1,1.1,0,2*Math.PI);boardContext.fillStyle='#f8eafa';boardContext.fill();}
    }
  }
  function paint(){
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(boardLayer,0,0);
    const actors=animations.length?animations:[{ball,trail:[],impact:null}];
    actors.forEach(actor=>{
      const {ball,trail,impact}=actor;
      if(impact){ctx.beginPath();ctx.arc(impact.x,impact.y,7+impact.phase*14,0,2*Math.PI);ctx.strokeStyle=`rgba(251,164,210,${(1-impact.phase)*0.7})`;ctx.lineWidth=2;ctx.stroke();}
      trail.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,2+i/trail.length*4,0,2*Math.PI);ctx.fillStyle=`rgba(255,130,189,${i/trail.length*0.3})`;ctx.fill();});
      if(ball){ctx.shadowBlur=animations.length>8?8:18;ctx.shadowColor='#ff70b1';ctx.beginPath();ctx.arc(ball.x,ball.y,8,0,2*Math.PI);ctx.fillStyle='#ffb5d9';ctx.fill();ctx.shadowBlur=0;ctx.beginPath();ctx.arc(ball.x-2,ball.y-2,3,0,2*Math.PI);ctx.fillStyle='#fff0f7';ctx.fill();}
    });
    canvas.dataset.flying=String(animations.length);
  }
  function renderTable(){currentTable=selected();if(!currentTable)return;const t=currentTable,amount=Number($('amount').value)||1;canvas.height=t.rows*37+110;canvas.style.aspectRatio='1000/'+canvas.height;$('slots').style.marginInline=((1000-(t.rows+1)*42)/20)+'%';$('slots').style.setProperty('--slots',t.multipliers.length);$('slots').innerHTML=t.multipliers.map((m,k)=>`<button type="button" style="--hue:${330-Math.abs(2*k/t.rows-1)*300}" title="Ô ${k+1}: ${(t.probabilities[k]*100).toFixed(6)}% · ${m}×" aria-label="Ô ${k+1}, hệ số ${m}, xác suất ${(t.probabilities[k]*100).toFixed(6)} phần trăm">${m>=1000?(m/1000).toFixed(1)+'k':m.toFixed(m<1?2:m<10?1:0).replace(/^0\./,".")}</button>`).join('');$('slots').querySelectorAll('button').forEach((b,k)=>b.onclick=()=>feedback(`Ô ${k+1} · ${t.multipliers[k]}× · xác suất ${(100*t.probabilities[k]).toFixed(6)}%`));const effective=t.probabilities.reduce((sum,p,k)=>sum+p*Math.floor(amount*t.multipliers[k])/amount,0);$('rtp').textContent=(t.rtp*100).toFixed(2)+'% · thực nhận '+(effective*100).toFixed(2)+'%';$('max').textContent=money(Math.floor(amount*Math.max(...t.multipliers)));$('odds').innerHTML=t.multipliers.map((m,k)=>`<tr><td>${k+1}</td><td>${(t.probabilities[k]*100).toFixed(6)}%</td><td>${m}×</td><td>${money(Math.floor(amount*m))}</td></tr>`).join('');ball=null;cacheBoard();paint();controls();}
  function history(){$('recent').innerHTML=games.filter(g=>g.status==='settled').slice(0,8).map(g=>`<span class="plinko-recent-chip ${g.multiplier>=1?'positive':''}" title="Lua">${esc(g.multiplier)}×</span>`).join('')||'<span>Lượt vừa chơi xuất hiện ở đây</span>';const statuses={settled:'Hoàn tất',review:'Cần đối soát',debit_pending:'Chờ xác nhận trừ',credit_pending:'Chờ xác nhận cộng'};$('history').innerHTML=games.length?games.slice(0,30).map((g,i)=>`<tr><td>Lúa game</td><td>${money(g.amount)}</td><td>${g.multiplier}×</td><td>${g.status==='settled'?money(g.payout):'—'}</td><td>${statuses[g.status]||esc(g.status)}</td><td>${g.serverSeed?`<button type="button" data-proof="${i}">Kiểm tra</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="6">Chưa có lượt chơi.</td></tr>';$('history').querySelectorAll('[data-proof]').forEach(b=>b.onclick=()=>verify(games[Number(b.dataset.proof)]));}
  const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  async function browserDraw(seed,clientSeed,rows){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(seed),{name:'HMAC',hash:'SHA-256'},false,['sign']);const path=[];for(let r=1;r<=rows;r++){const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(clientSeed+':'+r));path.push(new DataView(digest).getUint32(0)<2**31?'L':'R');}return{path,slot:path.filter(d=>d==='R').length};}
  async function verify(g){try{const commitment=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(g.serverSeed)));const result=await browserDraw(g.serverSeed,g.clientSeed,g.rows);const table=state.tables.find(t=>t.rows===g.rows&&t.risk===g.risk),multiplier=table.multipliers[result.slot],payout=Math.floor(g.amount*multiplier);const valid=commitment===g.commitment&&result.slot===g.slot&&result.path.join('')===g.path.join('')&&multiplier===g.multiplier&&payout===g.payout;$('proof').textContent=JSON.stringify({verified:valid,mode:'wallet',algorithm:g.algorithm,serverSeed:g.serverSeed,commitment:g.commitment,clientSeed:g.clientSeed,path:result.path.join(''),tile:result.slot+1,multiplier,payout},null,2);$('proof').closest('details').open=true;$('proof').scrollIntoView({block:'nearest'});}catch{feedback('Không xác minh được lượt này.');}}
  function landed(actor){
    const g=actor.game;ball=actor.points.at(-1);
    if(!disposed){const tile=$('slots').children[g.slot];tile?.classList.remove('winner');if(tile){void tile.offsetWidth;tile.classList.add('winner');}
      $('result').classList.toggle('positive',g.payout>=g.amount);$('result').textContent=`Ô ${g.slot+1} · ${g.multiplier}× · Nhận ${money(g.payout)}`;
      games=[g,...games.filter(row=>row.id!==g.id)].slice(0,30);history();
    }actor.resolve();
  }
  function finishAnimations(){cancelAnimationFrame(frame);frame=null;const finished=animations.splice(0);finished.forEach(landed);motionControl();if(!disposed)paint();}
  function animationTick(now){
    frame=null;if(disposed||document.hidden||reduced.matches||!motionEnabled){finishAnimations();return;}
    for(let i=animations.length-1;i>=0;i--){const actor=animations[i],g=actor.game;
      const progress=Math.max(0,Math.min(1,(now-actor.start)/1800));
      if(progress===1){animations.splice(i,1);landed(actor);continue;}
      const position=progress*g.rows,index=Math.min(g.rows-1,Math.floor(position)),p=position-index,a=actor.points[index],b=actor.points[index+1];
      actor.ball={x:a.x+(b.x-a.x)*p,y:a.y+(b.y-a.y)*p-8*Math.sin(p*Math.PI)};
      actor.trail.push({...actor.ball});if(actor.trail.length>6)actor.trail.shift();actor.impact=p<0.65?{...a,phase:p/0.65}:null;
    }paint();if(animations.length)frame=requestAnimationFrame(animationTick);
  }
  function animate(game){return new Promise(resolve=>{
    let right=0;const points=[point(0,0)];game.path.forEach((d,r)=>{if(d==='R')right++;points.push(point(r+1,right));});
    const actor={game,points,resolve,start:performance.now(),ball:points[0],trail:[],impact:null};
    if(disposed||document.hidden||reduced.matches||!motionEnabled){landed(actor);motionControl();if(!disposed)paint();return;}
    animations.push(actor);$('result').textContent='Đang thả bóng…';if(frame==null)frame=requestAnimationFrame(animationTick);
  });}
  function syncBalance(balance){if(!Number.isFinite(balance))return;$('balance').textContent=money(balance);if(state)state.balance=balance;if(App.user){App.user.balance=balance;App.publishUser();}}
  async function refresh(){const account=App.user?.steam_id||App.user?.steamId||null;const next=await App.readJSON(ST25API.routes.plinkoState);if(disposed||account!==(App.user?.steam_id||App.user?.steamId||null))return;state=next;walletPaused=(next.history||[]).some(g=>['review','debit_pending','credit_pending'].includes(g.status));$('balance').textContent=Number.isFinite(next.balance)?money(next.balance):'—';$('login').hidden=next.authenticated;$('notice').textContent=next.message;games=(next.history||[]).slice(0,30);history();if(!pendingBalls)renderTable();else controls();}
  async function resolveGame(job){const {amount,rows,risk,clientSeed,account}=job;
    const prepared=await post(ST25API.routes.plinkoPrepare,{});
    if(account!==(App.user?.steam_id||App.user?.steamId||null)||disposed)throw Error('Tài khoản đã thay đổi. Kiểm tra lịch sử.');
    $('proof').textContent='Cam kết trước lượt: '+prepared.commitment;
    const response=await post(ST25API.routes.plinkoPlay,{gameId:prepared.id,amount,rows,risk,clientSeed}),game=response.game;
    if(account!==(App.user?.steam_id||App.user?.steamId||null))throw Error('Tài khoản đã thay đổi. Kiểm tra lịch sử.');
    if(game.commitment!==prepared.commitment)throw Error('Cam kết seed không khớp. Liên hệ hỗ trợ.');syncBalance(response.balance??game.balance);return game;
  }
  function complete(){pendingBalls--;controls();if(!pendingBalls&&refreshPending&&!disposed){refreshPending=false;refresh().catch(()=>{});}}
  function cancelQueued(){pendingBalls-=queue.length;queue.length=0;controls();}
  async function processQueue(){
    if(processing)return;processing=true;
    try{while(queue.length&&!disposed){
      const job=queue.shift();controls();
      if(document.hidden||job.account!==(App.user?.steam_id||App.user?.steamId||null)){complete();cancelQueued();break;}
      try{const game=await resolveGame(job);
        if(job.account!==(App.user?.steam_id||App.user?.steamId||null)||disposed){complete();cancelQueued();break;}
        // Wallet requests settle serially; visual animations can overlap.
        animate(game).then(()=>{if(!disposed&&job.account===(App.user?.steam_id||App.user?.steamId||null))feedback(`Đã trừ ${money(job.amount)}, cộng ${money(game.payout)} vào ví game.`);complete();});
      }catch(e){walletPaused=true;complete();cancelQueued();feedback(e.message);refreshPending=true;if(!pendingBalls&&!disposed){refreshPending=false;try{await refresh();}catch{}}break;}
    }}finally{processing=false;controls();}
  }
  $('form').addEventListener('submit',e=>{
    e.preventDefault();if($('play').disabled||!currentTable||!$('form').reportValidity())return;
    const count=automatic?Number($('count').value):1;if(!Number.isInteger(count)||count<1||count>maxBalls)return;
    if(pendingBalls+count>maxBalls){feedback('Tối đa 20 bóng đang xử lý. Chờ bóng về ô rồi thả tiếp.');return;}
    const job={amount:Number($('amount').value),rows:Number($('rows').value),risk:$('risk').value,clientSeed:$('seed').value,account:App.user?.steam_id||App.user?.steamId||null,mode:'wallet'};
    if(!job.clientSeed){feedback('Nhập client seed.');return;}
    pendingBalls+=count;for(let i=0;i<count;i++)queue.push({...job});controls();processQueue();
  });
  $('stop').onclick=()=>{cancelQueued();feedback('Đã dừng bóng chờ. Bóng đã thả vẫn hoàn tất.');};
  for(const mode of ['manual','auto'])$(mode).onclick=()=>{automatic=mode==='auto';$('auto-options').hidden=!automatic;for(const x of ['manual','auto']){$(x).classList.toggle('selected',x===mode);$(x).setAttribute('aria-pressed',String(x===mode));}controls();};
  for(const id of ['risk','rows','amount'])$(id).addEventListener('change',renderTable);
  document.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>{const n=Number($('amount').value)||1;$('amount').value=b.dataset.size==='half'?Math.max(1,Math.floor(n/2)):b.dataset.size==='double'?Math.min(500,n*2):Math.min(500,Math.max(1,Math.floor(state?.balance??500)));renderTable();});
  let lastAccount;
  const unsubscribe=App.subscribeUser(()=>{const account=App.user?.steam_id||App.user?.steamId||null;if(account===lastAccount)return;lastAccount=account;cancelQueued();cancelAnimationFrame(frame);frame=null;animations.splice(0).forEach(actor=>actor.resolve());ball=null;paint();games=[];state=null;if(!pendingBalls)refresh().catch(()=>{$('notice').textContent='Không kết nối được Plinko. Thử tải lại trang.';});else{refreshPending=true;feedback('Tài khoản đã thay đổi. Kiểm tra lịch sử.');}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelQueued();finishAnimations();}});
  window.addEventListener('pagehide',()=>{disposed=true;cancelQueued();finishAnimations();cancelAnimationFrame(frame);unsubscribe();},{once:true});
  cacheBoard();paint();refresh().catch(()=>{$('notice').textContent='Không kết nối được Plinko. Thử tải lại trang.';});
})();
