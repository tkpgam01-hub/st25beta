// Lossless WebP: preserve every mask channel and alpha value used by the skin shader.
const fs=require('node:fs'),path=require('node:path');
const sharp=require('../.build-cache/skin-tools/node_modules/sharp');
const root=path.resolve(__dirname,'../assets/vendor/islepilot-skin');
const originals=JSON.parse(fs.readFileSync(path.join(root,'assets.json'),'utf8'));
(async()=>{
  const textures={};let before=0,after=0;
  for(const entry of originals.filter(x=>x.url.endsWith('.png'))){
    const input=path.join(root,entry.url.slice(1));
    const buffer=await sharp(input).webp({lossless:true,exact:true,effort:6}).toBuffer();
    if(buffer.length>=entry.bytes*.9)continue;
    // Decode and compare RGBA, including transparent pixels, before shipping a mask.
    const original=await sharp(input).ensureAlpha().raw().toBuffer();
    const decoded=await sharp(buffer).ensureAlpha().raw().toBuffer();
    if(!original.equals(decoded))throw Error('Texture channels changed: '+entry.url);
    const url=entry.url.replace(/\.png$/,'.preview.webp');
    fs.writeFileSync(path.join(root,url.slice(1)),buffer);
    textures[entry.url]={url,bytes:buffer.length,originalBytes:entry.bytes};
    before+=entry.bytes;after+=buffer.length;
  }
  fs.writeFileSync(path.join(root,'optimized-textures.json'),JSON.stringify({version:'20261010-orange1',textures,before,after},null,2)+'\n');
  console.log(JSON.stringify({textures:Object.keys(textures).length,before,after,saved:before-after}));
})().catch(e=>{console.error(e);process.exitCode=1;});
