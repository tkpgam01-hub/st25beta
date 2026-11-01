const API=require('../api/endpoints'),Pilot=require('../api/upstream-endpoints');
module.exports=(app,context)=>{
  const service=require('../services/plinko')({balance:async(sid,fresh=false)=>{
    const player=await context.callIslePilot(Pilot.player(sid),'GET',null,fresh);const balance=player?.wallet?.balance;
    if(!player||player.error||player._status||!Number.isFinite(balance)||balance<0)throw Object.assign(Error('Không đọc được ví Lúa.'),{status:503});return balance;
  },change:async(sid,amount,reason)=>{try{return await context.callIslePilot(Pilot.playerCurrency(sid),'POST',{amount,reason});}finally{context.clearPlayerCache(sid);}}});
  const handler=action=>async(req,res)=>{try{res.json(await action(req));}catch(e){if(e.status)return res.status(e.status).json({error:e.message});throw e;}};
  app.get(API.routes.plinkoState,handler(req=>service.state(context.getRequestSteamId(req))));
  app.post(API.routes.plinkoPrepare,handler(req=>service.prepare(context.getRequestSteamId(req))));
  app.post(API.routes.plinkoPlay,handler(req=>service.play(context.getRequestSteamId(req),req.body)));
};
