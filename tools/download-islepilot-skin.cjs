const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'assets/vendor/islepilot-skin');
const source=fs.readFileSync(path.join(output,'client.js'),'utf8');
const urls=new Set([...source.matchAll(/"(\/cdn\/skinviewer\/[^"\n]+)"/g)].map(match=>match[1]));
for(const match of source.matchAll(/`\$\{N\}(\/[^`$]+)`/g))urls.add('/cdn/skinviewer'+match[1]);
const queue=[...urls].filter(url=>/\.(glb|png|webp|jpg|hdr)$/.test(url));
const results=[];
async function worker(){
  while(queue.length){
    const url=queue.shift(),file=path.join(output,url.slice(1));
    if(fs.existsSync(file)){results.push({url,bytes:fs.statSync(file).size});continue;}
    try{
      const response=await fetch('https://st25.islepilot.eu'+url,{signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const data=Buffer.from(await response.arrayBuffer());
      if(data.subarray(0,100).toString().includes('<html'))throw Error('HTML instead of asset');
      fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);
      results.push({url,bytes:data.length});
    }catch(error){results.push({url,error:error.message});}
  }
}
(async()=>{await Promise.all(Array.from({length:4},worker));results.sort((a,b)=>a.url.localeCompare(b.url));fs.writeFileSync(path.join(output,'assets.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({files:results.length,bytes:results.reduce((sum,x)=>sum+(x.bytes||0),0),failed:results.filter(x=>x.error)}));if(results.some(x=>x.error))process.exitCode=1;})();
