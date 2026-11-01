const crypto = require('node:crypto');
const risks = ['low','medium','high','extreme'];
const fail = message => { throw Object.assign(new Error(message), {status:400}); };
function table(rows, risk) {
  if (!Number.isInteger(rows) || rows<8 || rows>16 || !risks.includes(risk)) fail('Cấu hình Plinko không hợp lệ.');
  const probabilities=[1/2**rows];
  for(let k=1;k<=rows;k++)probabilities[k]=probabilities[k-1]*(rows-k+1)/k;
  const power={low:1,medium:2,high:4,extreme:7}[risk];
  const weights=probabilities.map((_,k)=>0.12+Math.pow(Math.abs(2*k/rows-1),power)*8);
  if(risk==='extreme') {
    const edge=Math.min(10000,0.35/(2*probabilities[0]));
    const remaining=0.914-2*probabilities[0]*edge;
    const total=weights.reduce((s,w,k)=>s+(k>0&&k<rows?probabilities[k]*w:0),0);
    weights.forEach((w,k)=>weights[k]=k===0||k===rows?edge:w*remaining/total);
  } else {
    const total=weights.reduce((s,w,k)=>s+probabilities[k]*w,0);
    weights.forEach((w,k)=>weights[k]=w*0.914/total);
  }
  const multipliers=weights.map(w=>Math.floor(w*10000)/10000);
  return {rows,risk,probabilities,multipliers,rtp:probabilities.reduce((s,p,k)=>s+p*multipliers[k],0)};
}
function draw(serverSeed,clientSeed,rows) {
  const path=[];
  for(let row=1;row<=rows;row++)path.push(crypto.createHmac('sha256',serverSeed).update(`${clientSeed}:${row}`).digest().readUInt32BE()<2**31?'L':'R');
  return {path,slot:path.filter(d=>d==='R').length};
}
function validate(input) {
  if(!input||typeof input.gameId!=='string'||!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(input.gameId))fail('Mã lượt chơi không hợp lệ.');
  if(!Number.isSafeInteger(input.amount)||input.amount<1||input.amount>500)fail('Chọn từ 1 đến 500 Lúa nguyên.');
  if(typeof input.clientSeed!=='string'||input.clientSeed.length<1||input.clientSeed.length>128)fail('Client seed phải có 1–128 ký tự.');
  table(input.rows,input.risk);return input;
}
module.exports={risks,table,draw,validate,commitment:seed=>crypto.createHash('sha256').update(seed).digest('hex'),payout:(amount,multiplier)=>Math.floor(amount*multiplier)};
