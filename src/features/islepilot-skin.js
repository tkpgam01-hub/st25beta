/* Original IslePilot editor, hosted with ST25 authentication and API paths. */
(async()=>{
  const status=document.getElementById('skin-client-status');
  try{
    const pilot=window.ST25Pilot;
    const React=pilot.require(52647),ReactDOM=pilot.require(497890);
    const viewer=pilot.require(221208),catalog=pilot.require(204081),three=pilot.require(436910);
    const [strings,optimized]=await Promise.all([
      fetch('/assets/vendor/islepilot-skin/strings.vi.json').then(response=>{if(!response.ok)throw Error('Không tải được ngôn ngữ');return response.json();}),
      fetch('/assets/vendor/islepilot-skin/optimized-textures.json').then(response=>response.ok?response.json():null).catch(()=>null)
    ]);
    const textureURL=url=>{const parsed=new URL(url,location.href);const match=optimized?.textures?.[parsed.pathname];return match?match.url+'?v='+optimized.version:url;};
    three.DefaultLoadingManager.setURLModifier(textureURL);
    for(const background of catalog.SKIN3D_BACKGROUNDS)background.image=textureURL(background.image);
    const warmed=new Set();
    function warmModel(species,pattern=1){
      const model=catalog.resolveDino(species);if(!model)return;
      const images=[model.patterns[pattern]||model.patterns[1],model.normalMap,model.racMap,model.juvenilePattern,model.maskMap,model.patternMasks?.[pattern]||model.tmcMap,...Object.values(catalog.SKIN3D_SHARED).filter(x=>typeof x==='string'&&/\.(png|webp)$/.test(x))];
      for(const original of images.filter(Boolean)){const url=textureURL(original);if(warmed.has(url))continue;warmed.add(url);const image=new Image();image.crossOrigin='anonymous';image.src=url;}
      for(const url of [model.glbModel+'?v=12','/cdn/skinviewer/shared/empty_warehouse_01_1k.hdr']){
        if(warmed.has(url))continue;warmed.add(url);
        const link=document.createElement('link');link.rel='preload';link.as='fetch';link.crossOrigin='anonymous';link.href=url;document.head.append(link);
      }
    }
    pilot.override(221208,{...viewer,SkinViewer3D:props=>{
      React.useMemo(()=>warmModel(props.species,props.patternIndex||1),[props.species,props.patternIndex]);
      return React.createElement(viewer.SkinViewer3D,props);
    }});
    const jsx=pilot.require(543355),layout=window.ST25SkinLayout(React);
    pilot.override(543355,{...jsx,jsxs:(type,props,key)=>{
      const tree=jsx.jsxs(type,props,key);
      return type==='div'&&/^grid gap-4 (lg|xl):grid-cols-\[minmax/.test(props?.className||'')?layout(tree):tree;
    }});
    const {SkinEditor}=pilot.require(2492),{PublicStringsProvider}=pilot.require(849551);
    const {Toaster}=pilot.require(360112);
    const species=['Allosaurus','Beipiaosaurus','Carnotaurus','Ceratosaurus','Deinosuchus','Diabloceratops','Dilophosaurus','Dryosaurus','Gallimimus','Herrerasaurus','Hypsilophodon','Maiasaura','Omniraptor','Pachycephalosaurus','Pteranodon','Stegosaurus','Tenontosaurus','Triceratops','Troodon','Tyrannosaurus'];
    const originalFetch=window.fetch.bind(window);
    // Keep the original client contract; the API key remains exclusively on the server.
    window.fetch=(input,options)=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.origin===location.origin&&url.pathname==='/api/skin/set'){
        let body;try{body=JSON.parse(options?.body||'{}');}catch{return Promise.resolve(new Response(JSON.stringify({error:'Dữ liệu skin không hợp lệ'}),{status:400,headers:{'Content-Type':'application/json'}}));}
        return originalFetch(ST25API.routes.skinApply,{...options,body:JSON.stringify({payload:body.payload})}).then(async response=>{
          const data=await response.json();
          // The portal accepts the command; its API does not expose command-status polling.
          delete data.jobId;
          return new Response(JSON.stringify(data),{status:response.status,headers:{'Content-Type':'application/json'}});
        });
      }
      return originalFetch(input,options);
    };
    class Boundary extends React.Component{
      constructor(props){super(props);this.state={error:null};}
      static getDerivedStateFromError(error){return {error};}
      render(){return this.state.error?React.createElement('p',{role:'alert'},'Không tải được trình chỉnh Skin: '+this.state.error.message):this.props.children;}
    }
    const root=ReactDOM.createRoot(document.getElementById('islepilot-skin-root'));
    let currentSpecies='Tyrannosaurus';
    let lastRender;
    function render(user){
      if(species.includes(user?.dino?.species))currentSpecies=user.dino.species;
      const identity=user?.steamId||user?.steam_id||'guest';
      const signature=JSON.stringify([identity,currentSpecies,identity!=='guest'&&user?.isLoggedIn!==false]);
      if(signature===lastRender)return;
      lastRender=signature;
      root.render(React.createElement(Boundary,null,React.createElement(PublicStringsProvider,{dict:strings},React.createElement(React.Fragment,null,React.createElement(SkinEditor,{key:identity,speciesOptions:species,currentSpecies,canSetSkin:identity!=='guest'&&user?.isLoggedIn!==false,isAdmin:false,serverId:'cmufraiwk7fnooa01vpdzdhm4',slug:'st25',glitchEnabled:false,variant:'embedded'}),React.createElement(Toaster,{theme:'dark',richColors:true})))));
      status.hidden=true;
    }
    render(null);
    if(parent!==window){
      window.addEventListener('message',event=>{
        if(event.origin===location.origin&&event.source===parent&&event.data?.type==='st25-skin-editor-user')render(event.data.user);
      });
      parent.postMessage({type:'st25-skin-editor-ready'},location.origin);
    }else{
      const me=await originalFetch(ST25API.routes.playerMe).then(response=>response.ok?response.json():null).catch(()=>null);
      render(me?.user||me);
    }
    window.ST25OriginalSkin={ready:true,exports:pilot.require(110149),defaults:pilot.require(70454)};
    const editor=document.getElementById('islepilot-skin-root');
    let lastHeight;
    function reportHeight(){const height=Math.ceil(editor.getBoundingClientRect().bottom);if(parent!==window&&height!==lastHeight){lastHeight=height;parent.postMessage({type:'st25-skin-editor-height',height},location.origin);}}
    const resize=new ResizeObserver(reportHeight);resize.observe(editor);
    window.addEventListener('pagehide',()=>resize.disconnect(),{once:true});
  }catch(error){status.textContent='Không tải được trình chỉnh Skin: '+error.message;status.setAttribute('role','alert');console.error(error);}
})();
