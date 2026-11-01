/* Import the user-supplied compiled client, without Next hydration or saved session data. */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const reference=path.join(root,'reference');
const directory=path.join(reference,fs.readdirSync(reference).find(name=>name.endsWith('_files')));
const context=vm.createContext({TURBOPACK:[]});
const provenance=[];
for(const name of fs.readdirSync(directory).filter(name=>name.includes('.js.')&&!name.startsWith('turbopack'))){
  const source=fs.readFileSync(path.join(directory,name),'utf8');
  if(!source.startsWith('(globalThis.TURBOPACK'))continue;
  vm.runInContext(source,context,{timeout:5000});
  provenance.push({file:name,sha256:crypto.createHash('sha256').update(source).digest('hex')});
}
const factories=new Map();
for(const chunk of context.TURBOPACK){
  let ids=[];
  for(const entry of chunk.slice(1)){
    if(typeof entry==='function'){for(const id of ids)factories.set(id,entry.toString());ids=[];}
    else if(typeof entry==='number')ids.push(entry);
  }
}
if(!factories.has(2492)||!factories.has(497890))throw Error('Incomplete SkinEditor/ReactDOM client');
factories.set(221208,require('./adapt-skin-viewer.cjs')(factories.get(221208)));
const output=path.join(root,'assets/vendor/islepilot-skin');
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'client.js'),'/* Client modules imported from the supplied IslePilot page. */\nwindow.ST25PilotFactories={\n'+[...factories].map(([id,code])=>JSON.stringify(id)+':'+code).join(',\n')+'\n};\n');
for(const name of fs.readdirSync(directory).filter(name=>name.endsWith('.css'))){
  fs.copyFileSync(path.join(directory,name),path.join(output,name));
}
fs.writeFileSync(path.join(output,'provenance.json'),JSON.stringify({source:'https://st25.islepilot.eu/skin',editorModule:2492,modules:factories.size,files:provenance},null,2)+'\n');
const html=fs.readFileSync(path.join(reference,fs.readdirSync(reference).find(name=>name.endsWith('.html'))),'utf8');
const flight=[];
const flightContext=vm.createContext({self:{__next_f:flight}});
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){
  const script=match[1].trim();
  if(script.startsWith('self.__next_f.push(')||script.startsWith('(self.__next_f='))vm.runInContext(script,flightContext,{timeout:1000});
}
const dict={};
function visit(value,depth=0){
  if(depth>12||!value)return;
  if(typeof value==='string'){
    try{visit(JSON.parse(value),depth+1);}catch{}
  }else if(typeof value==='object'){
    for(const [key,entry] of Object.entries(value)){
      if((key.startsWith('skin.')||key.startsWith('common.'))&&typeof entry==='string')dict[key]=entry;
      else visit(entry,depth+1);
    }
  }
}
for(const entry of flight){
  if(typeof entry[1]!=='string')continue;
  for(const line of entry[1].split('\n')){
    const json=line.slice(line.indexOf(':')+1);
    try{visit(JSON.parse(json));}catch{}
  }
}
fs.writeFileSync(path.join(output,'strings.vi.json'),JSON.stringify(dict,null,2)+'\n');
console.log(`Imported ${factories.size} client modules; excluded saved HTML, session data, analytics and extensions.`);
console.log(`Imported ${Object.keys(dict).length} UI strings.`);
