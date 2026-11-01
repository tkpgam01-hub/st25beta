// Host rendering budget; animation, geometry and colour shader stay unchanged.
module.exports=function adaptSkinViewer(source){
  const patches=[['s=[1,2]','s=[1,1.25]'],['"shadow-mapSize-width":2048','"shadow-mapSize-width":1024'],['"shadow-mapSize-height":2048','"shadow-mapSize-height":1024'],['barStyles:{background:"#9db5ff"}','barStyles:{background:"#f6ab45"}']];
  for(const [before,after] of patches){if(!source.includes(before))throw Error('Viewer source changed: '+before);source=source.replace(before,after);}
  for(const [before,after] of [['(0,c.useState)(U[0]?.id??"")','(0,c.useState)("off")'],['maxDistance:40','maxDistance:120']]){
    if(!source.includes(before))throw Error('Viewer source changed: '+before);source=source.replace(before,after);
  }
  const camera=/function G\(e\)\{.*?\}function H\(e\)/;
  if(!camera.test(source))throw Error('Viewer camera source changed');
  source=source.replace(camera,'function G(e){let camera=(0,s.useThree)(H),size=(0,s.useThree)(state=>state.size),start=(0,c.useRef)(null);(0,c.useEffect)(()=>{if(!start.current)start.current=camera.position.clone();camera.position.copy(start.current).multiplyScalar(e.factor*Math.max(1,1.6/(size.width/size.height)));camera.updateProjectionMatrix();},[camera,e.factor,size.width,size.height]);return null}function H(e)');
  // Pause GPU work outside the viewport without changing visible animation quality.
  const hook='function G(e){';
  source=source.replace(hook,hook+'let renderer=(0,s.useThree)(state=>state.gl),setLoop=(0,s.useThree)(state=>state.setFrameloop);(0,c.useEffect)(()=>{let visible=true;const update=()=>{const mode=visible&&!document.hidden?"always":"never";setLoop(mode);renderer.domElement.dataset.renderMode=mode;};const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update();});observer.observe(renderer.domElement);document.addEventListener("visibilitychange",update);update();return()=>{observer.disconnect();document.removeEventListener("visibilitychange",update);};},[renderer,setLoop]);');
  return source;
};
