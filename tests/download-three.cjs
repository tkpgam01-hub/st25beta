const fs = require('node:fs');
(async () => {
  for (const [remote, local] of [['build/three.module.min.js','three.module.min.mjs'],['build/three.core.min.js','three.core.min.mjs'],['examples/jsm/controls/OrbitControls.js','OrbitControls.mjs'],['LICENSE','LICENSE']]) {
    const response = await fetch('https://unpkg.com/three@0.180.0/' + remote, {signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`${remote}: ${response.status}`);
    let source = await response.text();
    if(local.endsWith('.mjs')) source = source.replaceAll('./three.core.min.js', './three.core.min.mjs').replaceAll("from 'three'", "from './three.module.min.mjs'");
    fs.writeFileSync('assets/vendor/three/' + local, source);
    console.log(local, source.length);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
