(() => {
  const frame=document.getElementById('islepilot-skin-frame');
  function sendUser(user){
    frame.contentWindow.postMessage({type:'st25-skin-editor-user',user:user?{steam_id:user.steam_id||user.steamId,isLoggedIn:user.isLoggedIn,dino:{species:user.dino?.species}}:null},location.origin);
  }
  const unsubscribe=App.subscribeUser(sendUser);
  window.addEventListener('pagehide',unsubscribe,{once:true});
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
    if(event.data?.type==='st25-skin-editor-ready'){if(App.authResolved)sendUser(App.user);return;}
    if(event.data?.type!=='st25-skin-editor-height')return;
    const height=Number(event.data.height);
    if(Number.isFinite(height))frame.style.height=Math.max(360,Math.min(6000,height+2))+'px';
  });
})();
