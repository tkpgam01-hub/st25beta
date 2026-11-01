/* Host adapter for the imported client module format. No Next app bootstrap. */
(() => {
  const factories=window.ST25PilotFactories,cache=new Map(),overrides=new Map();
  function record(id){if(!cache.has(id))cache.set(id,{id,exports:{},loaded:false});return cache.get(id);}
  function namespace(value){
    if(value?.__esModule)return value;
    return new Proxy(Object(value),{get(target,key){return key==='default'?value:target[key];}});
  }
  function load(id){
    if(overrides.has(id))return {exports:overrides.get(id)};
    const item=record(id);if(item.loaded)return item;
    const factory=factories[id];if(!factory)throw Error(`Missing IslePilot client module ${id}`);
    item.loaded=true;
    const api={m:item,e:item.exports,c:Object.fromEntries(cache),
      r:target=>load(target).exports,
      i:target=>namespace(load(target).exports),
      s(entries,target){
        const destination=target===undefined?item:record(target);
        destination.loaded=true;
        Object.defineProperty(destination.exports,'__esModule',{value:true,configurable:true});
        for(let i=0;i<entries.length;){const key=entries[i++],tag=entries[i++];
          Object.defineProperty(destination.exports,key,tag===0?{value:entries[i++],enumerable:true,configurable:true}:{get:tag,enumerable:true,configurable:true});
        }
      },
      v(value,target){(target===undefined?item:record(target)).exports=value;},
      n(value,target){(target===undefined?item:record(target)).exports=value;},
      j(value,target){Object.assign((target===undefined?item:record(target)).exports,value);},
      A:async target=>namespace(load(target).exports),
      l:async()=>{},
      g:globalThis
    };
    try{factory(api,item,item.exports);}catch(error){cache.delete(id);throw error;}
    return item;
  }
  overrides.set(141139,{useRouter:()=>({refresh(){},push:url=>location.assign(url),replace:url=>location.replace(url)})});
  overrides.set(797209,{useViewPrefs:()=>({ready:true,prefs:{render3d:true,showBalance:true,storage:'local'}})});
  window.ST25Pilot={require:id=>load(id).exports,override:(id,value)=>overrides.set(id,value)};
})();
