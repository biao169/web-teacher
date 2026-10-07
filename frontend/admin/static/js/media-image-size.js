/** Inspect common image headers before browser decode to bound original bitmap memory. */
export async function imageSize(file){
 const b=new Uint8Array(await file.slice(0,1048576).arrayBuffer()),v=new DataView(b.buffer);
 const word=(p,n)=>String.fromCharCode(...b.slice(p,p+n)),u24=p=>b[p]+b[p+1]*256+b[p+2]*65536;let width=0,height=0;
 if(b.length>=24&&word(1,3)==='PNG'){width=v.getUint32(16);height=v.getUint32(20)}
 else if(b.length>=10&&['GIF87a','GIF89a'].includes(word(0,6))){width=v.getUint16(6,true);height=v.getUint16(8,true)}
 else if(b.length>=21&&word(0,4)==='RIFF'&&word(8,4)==='WEBP'){
  const kind=word(12,4);
  if(kind==='VP8X'&&b.length>=30){width=u24(24)+1;height=u24(27)+1}
  else if(kind==='VP8L'&&b.length>=25&&b[20]===47){const bits=v.getUint32(21,true);width=(bits&16383)+1;height=((bits>>>14)&16383)+1}
  else if(kind==='VP8 '&&b.length>=30&&b[23]===157&&b[24]===1&&b[25]===42){width=v.getUint16(26,true)&16383;height=v.getUint16(28,true)&16383}
 }else if(b[0]===255&&b[1]===216){
  let p=2;
  while(p+4<=b.length&&b[p]===255){
   while(p<b.length&&b[p]===255)p++;const marker=b[p++];
   if(marker===218||marker===217)break;
   if(marker===1||(marker>=208&&marker<=215))continue;
   if(p+2>b.length)break;const length=v.getUint16(p);if(length<2||p+length>b.length)break;
   if([192,193,194].includes(marker)&&length>=8){height=v.getUint16(p+3);width=v.getUint16(p+5);break}
   p+=length;
  }
 }
 if(!width||!height)throw Error('无法读取图片尺寸，请换用标准PNG、JPEG、GIF或WebP图片');
 if(width>16000||height>16000||width*height>32000000)throw Error('原图最多3200万像素，单边不超过16000像素；请先缩小原图');
 return {width,height};
}
