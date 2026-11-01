const channels=['body','markings','flank','underbelly','detail1','male_display','eyes','teeth','mouth','claws'];
function validateSkinPayload(input){
  if(!input||typeof input!=='object'||!/^BP_[A-Za-z]{3,40}_C$/.test(input.class)||typeof input.female!=='boolean')throw Error('Dữ liệu loài hoặc giới tính skin không hợp lệ.');
  const payload={class:input.class,female:input.female};
  for(const key of ['variation','pattern','theme']){
    if(!Number.isInteger(input[key])||input[key]<0||input[key]>1000)throw Error('Biến thể hoặc họa tiết skin không hợp lệ.');
    payload[key]=input[key];
  }
  for(const key of channels){
    const color=input[key];
    if(!Array.isArray(color)||color.length!==4||color.some(value=>typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e12))throw Error(`Kênh màu ${key} không hợp lệ.`);
    if(color.some(value=>value<0||value>1))throw Error('Glitch đã khóa. Chỉ được áp dụng màu skin tiêu chuẩn.');
    payload[key]=color.slice();
  }
  if(input.gore!==undefined){if(typeof input.gore!=='number'||!Number.isFinite(input.gore)||input.gore<0||input.gore>1)throw Error('Giá trị gore không hợp lệ.');payload.gore=input.gore;}
  return payload;
}
module.exports={validateSkinPayload};
