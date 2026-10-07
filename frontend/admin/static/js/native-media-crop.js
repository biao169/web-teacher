/** Shared crop editor. Image-space selection survives all view transforms; output is only a draft File. */
import {fitView,imagePoint,zoomView,fullRect,pointRect,outputSize} from './media-crop-geometry.js';
import {imageSize} from './media-image-size.js';
const dialog=document.querySelector('[data-media-crop]'),el=n=>dialog.querySelector('[data-crop-'+n+']');
let active=null;
function notice(value,state='info'){el('status').textContent=value;el('status').dataset.uiState=state}
function snapshot(s){return {rect:{...s.rect},ratio:s.ratio,choice:s.choice,rw:s.rw,rh:s.rh}}
function remember(s){s.history.push(snapshot(s));if(s.history.length>20)s.history.shift()}
function pointer(event){const r=el('canvas').getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top}}
function stateControls(s){
 const rect=s.rect;for(const key of ['x','y','w','h'])if(document.activeElement!==el(key))el(key).value=Number(rect[key].toFixed(3));
 el('h').readOnly=!!s.ratio;el('ratio').value=s.choice;el('custom').hidden=s.choice!=='custom';
 el('undo').disabled=!s.anchor&&!s.history.length;el('zoom').value=Math.round(s.view.scale/s.base*100);el('zoom-value').textContent=el('zoom').value+'%';
 el('size').textContent='原图 '+s.width+' × '+s.height;el('confirm').disabled=s.busy||!!s.anchor;
 try{const size=outputSize(rect,Number(el('edge').value));el('output').textContent='输出 '+size.width+' × '+size.height+' px';el('output').dataset.uiState='info'}
 catch(error){el('output').textContent=error.message;el('output').dataset.uiState='warning';el('confirm').disabled=true}
}
function schedule(s){if(s.frame||active!==s)return;s.frame=requestAnimationFrame(()=>{s.frame=0;if(active===s&&s.bitmap)draw(s)})}
function draw(s){
 const canvas=el('canvas'),ctx=canvas.getContext('2d'),dpr=s.dpr,cw=s.cw,ch=s.ch;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cw,ch);const color=name=>getComputedStyle(dialog).getPropertyValue(name).trim();
 ctx.fillStyle=color('--surface');ctx.fillRect(0,0,cw,ch);
 ctx.fillStyle=color('--crop-checker');for(let x=0;x<cw;x+=16)for(let y=0;y<ch;y+=16)if((x/16+y/16)%2===0)ctx.fillRect(x,y,16,16);
 const v=s.view;ctx.drawImage(s.bitmap,v.x,v.y,s.width*v.scale,s.height*v.scale);
 const rect=s.guide||s.rect,x=rect.x*v.scale+v.x,y=rect.y*v.scale+v.y,w=rect.w*v.scale,h=rect.h*v.scale;
 ctx.fillStyle=color('--crop-mask');ctx.beginPath();ctx.rect(0,0,cw,ch);ctx.rect(x,y,w,h);ctx.fill('evenodd');
 ctx.strokeStyle=color('--crop-outline');ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);ctx.strokeStyle=color('--crop-grid');ctx.lineWidth=1;
 ctx.beginPath();for(let i=1;i<3;i++){ctx.moveTo(x+w*i/3,y);ctx.lineTo(x+w*i/3,y+h);ctx.moveTo(x,y+h*i/3);ctx.lineTo(x+w,y+h*i/3)}ctx.stroke();
 ctx.fillStyle=color('--crop-outline');for(const [cx,cy] of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]])ctx.fillRect(cx-3,cy-3,6,6);
 if(s.anchor){const a={x:s.anchor.x*v.scale+v.x,y:s.anchor.y*v.scale+v.y};ctx.strokeStyle=color('--crop-anchor');ctx.lineWidth=3;ctx.beginPath();ctx.arc(a.x,a.y,6,0,Math.PI*2);ctx.moveTo(a.x-10,a.y);ctx.lineTo(a.x+10,a.y);ctx.moveTo(a.x,a.y-10);ctx.lineTo(a.x,a.y+10);ctx.stroke()}
 stateControls(s);
}
function fit(s){
 const box=el('canvas').getBoundingClientRect();s.cw=Math.max(100,box.width);s.ch=Math.max(100,box.height);s.dpr=Math.min(2,devicePixelRatio||1);
 el('canvas').width=Math.round(s.cw*s.dpr);el('canvas').height=Math.round(s.ch*s.dpr);
 s.view=fitView(s.width,s.height,s.cw,s.ch);s.base=s.view.scale;schedule(s);
}
function zoom(s,factor,point={x:s.cw/2,y:s.ch/2}){s.view=zoomView(s.view,factor,point,s.base*.25,s.base*8);schedule(s)}
function resetAnchor(s){s.anchor=null;s.guide=null}
function commit(s,rect){if(rect.w<1||rect.h<1){notice('区域太小，请选择至少1像素宽高的范围','warning');return}remember(s);s.rect=rect;resetAnchor(s);notice('区域已确定；可继续调整视图，或生成裁剪图片。','success');schedule(s)}
function pick(s,p){
 const point=imagePoint(s.view,p);if(point.x<0||point.y<0||point.x>s.width||point.y>s.height){notice('请点击原图范围内的位置','warning');return}
 if(!s.anchor){s.anchor=point;s.guide=null;notice('第一个角已确定，请点击第二个角；仍可拖动或缩放视图。')}
 else commit(s,pointRect(s.anchor,point,s.ratio,s.width,s.height));schedule(s);
}
function ratioChanged(s){
 const choice=el('ratio').value,rw=Number(el('ratio-w').value),rh=Number(el('ratio-h').value);
 if(choice==='custom'&&(!Number.isInteger(rw)||!Number.isInteger(rh)||rw<1||rh<1||rw>10000||rh>10000)){notice('自定义比例宽高需为1–10000的整数','warning');return}
 remember(s);s.choice=choice;s.rw=rw;s.rh=rh;s.ratio=choice==='free'?0:choice==='original'?s.width/s.height:choice==='custom'?rw/rh:Number(choice);
 s.rect=fullRect(s.width,s.height,s.ratio);resetAnchor(s);notice('已按比例设置居中范围，可点击两个角重新框选。');schedule(s);
}
function finish(result=null){
 const s=active;if(!s)return;active=null;s.observer?.disconnect();cancelAnimationFrame(s.frame);s.bitmap?.close();el('canvas').width=1;el('canvas').height=1;
 dialog.close();s.resolve(result);s.focus?.focus();
}
export function editImage({file,extensions,maxBytes}){
 if(!dialog||active)return Promise.reject(Error('请先关闭当前图片编辑窗口'));
 return new Promise(resolve=>{
  const s=active={resolve,file,maxBytes,focus:document.activeElement,history:[],pointers:new Map(),suppressedUntil:0,anchor:null,guide:null,ratio:0,choice:'free',rw:4,rh:3,busy:true};
  dialog.querySelectorAll('input,select,button:not([data-crop-close])').forEach(n=>n.disabled=true);el('output').textContent='';el('size').textContent='';notice('正在读取图片…');dialog.showModal();
  (async()=>{
   try{
    const formats=[['png','image/png','PNG · 透明'],['jpg','image/jpeg','JPEG · 白底'],['jpeg','image/jpeg','JPEG · 白底']].filter(([ext])=>extensions.includes(ext));const unique=formats.filter((v,i)=>formats.findIndex(f=>f[1]===v[1])===i);
    if(!unique.length)throw Error('当前上传配置未允许PNG或JPEG输出');
    if(file.size>20*1048576)throw Error('原图文件不能超过20 MiB');
    await imageSize(file);if(active!==s)return;
    const bitmap=await createImageBitmap(file);if(active!==s){bitmap.close();return}
    s.bitmap=bitmap;s.width=bitmap.width;s.height=bitmap.height;
    if(s.width*s.height>32000000||s.width>16000||s.height>16000)throw Error('图片解码尺寸过大，请先缩小原图');
    s.rect=fullRect(s.width,s.height);s.busy=false;
    el('format').replaceChildren(...unique.map(([ext,mime,label])=>{const o=new Option(label,mime);o.dataset.ext=ext;return o}));
    el('edge').value=Math.max(64,Math.min(4096,Math.max(s.width,s.height)));el('ratio-w').value='4';el('ratio-h').value='3';
    dialog.querySelectorAll('input,select,button:not([data-crop-close])').forEach(n=>n.disabled=false);
    fit(s);s.observer=new ResizeObserver(()=>{if(active===s&&!s.busy)fit(s)});s.observer.observe(el('canvas'));
    notice('当前为整图范围。依次点击两个角可重新框选；拖动与缩放不会选点。');el('canvas').focus();
   }catch(error){if(active===s){notice(error.message||'无法解码图片，请换用其他图片','error');s.busy=true}}
  })();
 });
}
if(dialog){
 dialog.querySelectorAll('[data-crop-close]').forEach(b=>b.addEventListener('click',()=>finish()));dialog.addEventListener('cancel',e=>{e.preventDefault();finish()});
 const canvas=el('canvas');
 canvas.addEventListener('pointerdown',e=>{
  const s=active;if(!s?.bitmap||s.busy||e.button!==0)return;e.preventDefault();canvas.focus();const p=pointer(e);
  s.pointers.set(e.pointerId,{...p,start:p,moved:false});canvas.setPointerCapture(e.pointerId);
  if(s.pointers.size>1){for(const p of s.pointers.values())p.moved=true;s.pinch=null;s.suppressedUntil=performance.now()+300}
 });
 canvas.addEventListener('pointermove',e=>{
  const s=active;if(!s?.bitmap||s.busy)return;const point=pointer(e),p=s.pointers.get(e.pointerId);
  if(!p){if(s.anchor&&e.pointerType!=='touch'){s.guide=pointRect(s.anchor,imagePoint(s.view,point),s.ratio,s.width,s.height);schedule(s)}return}
  const previous={x:p.x,y:p.y};p.x=point.x;p.y=point.y;
  if(s.pointers.size>=2){
   const [a,b]=[...s.pointers.values()],center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance=Math.hypot(a.x-b.x,a.y-b.y);
   if(s.pinch){s.view.x+=center.x-s.pinch.center.x;s.view.y+=center.y-s.pinch.center.y;zoom(s,distance/Math.max(1,s.pinch.distance),center)}
   s.pinch={center,distance};for(const p of s.pointers.values())p.moved=true;s.suppressedUntil=performance.now()+300;
  }else if(p.moved||Math.hypot(p.x-p.start.x,p.y-p.start.y)>=6){
   const origin=p.moved?previous:p.start;p.moved=true;s.view.x+=p.x-origin.x;s.view.y+=p.y-origin.y;schedule(s);
  }
 });
 const release=(e,cancelled=false)=>{
  const s=active;if(!s)return;const p=s.pointers.get(e.pointerId);if(!p)return;
  s.pointers.delete(e.pointerId);s.pinch=null;
  if(cancelled||p.moved){s.suppressedUntil=performance.now()+250;for(const p of s.pointers.values())p.moved=true}
  else if(!s.busy&&!s.pointers.size&&performance.now()>s.suppressedUntil)pick(s,pointer(e));
  if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
 };
 canvas.addEventListener('pointerup',e=>release(e));canvas.addEventListener('pointercancel',e=>release(e,true));canvas.addEventListener('lostpointercapture',e=>release(e,true));
 canvas.addEventListener('wheel',e=>{const s=active;if(!s?.bitmap||s.busy)return;e.preventDefault();for(const p of s.pointers.values())p.moved=true;s.suppressedUntil=performance.now()+250;zoom(s,Math.exp(-Math.max(-200,Math.min(200,e.deltaY))*.002),pointer(e))},{passive:false});
 canvas.addEventListener('keydown',e=>{
  const s=active;if(!s?.bitmap||s.busy)return;const delta={ArrowLeft:[20,0],ArrowRight:[-20,0],ArrowUp:[0,20],ArrowDown:[0,-20]}[e.key];
  if(delta){e.preventDefault();s.view.x+=delta[0];s.view.y+=delta[1];schedule(s)}
  else if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(s,e.key==='-'?1/1.2:1.2)}else if(e.key==='Home'){e.preventDefault();fit(s)}
 });
 el('zoom').addEventListener('input',()=>{const s=active;if(s&&!s.busy)zoom(s,Number(el('zoom').value)/100*s.base/s.view.scale)});
 el('fit').addEventListener('click',()=>{if(active&&!active.busy)fit(active)});
 el('ratio').addEventListener('change',()=>{if(active&&!active.busy)ratioChanged(active)});el('apply-ratio').addEventListener('click',()=>{if(active&&!active.busy)ratioChanged(active)});
 el('reset').addEventListener('click',()=>{const s=active;if(!s||s.busy)return;remember(s);s.ratio=0;s.choice='free';s.rect=fullRect(s.width,s.height);resetAnchor(s);fit(s);notice('已恢复全图及初始视图。')});
 el('undo').addEventListener('click',()=>{const s=active;if(!s||s.busy)return;if(s.anchor)resetAnchor(s);else if(s.history.length){Object.assign(s,s.history.pop());el('ratio-w').value=s.rw;el('ratio-h').value=s.rh}notice('已撤销，原图片未改变。');schedule(s)});
 el('apply-rect').addEventListener('click',()=>{
  const s=active;if(!s||s.busy)return;const rect=Object.fromEntries(['x','y','w','h'].map(k=>[k,Number(el(k).value)]));if(s.ratio)rect.h=rect.w/s.ratio;
  if(Object.values(rect).some(v=>!Number.isFinite(v))||rect.x<0||rect.y<0||rect.w<1||rect.h<1||rect.x+rect.w>s.width+.001||rect.y+rect.h>s.height+.001){notice('数值区域必须位于原图内，宽高至少1像素','warning');return}commit(s,rect);
 });
 for(const name of ['edge','format'])el(name).addEventListener('input',()=>{if(active?.bitmap&&!active.busy)stateControls(active)});
 el('confirm').addEventListener('click',async()=>{
  const s=active;if(!s?.bitmap||s.busy||s.anchor)return;let output;
  try{
   const {width,height}=outputSize(s.rect,Number(el('edge').value));s.busy=true;dialog.querySelectorAll('input,select,button:not([data-crop-close])').forEach(n=>n.disabled=true);notice('正在生成裁剪图片…');
   output=document.createElement('canvas');output.width=width;output.height=height;const ctx=output.getContext('2d'),mime=el('format').value;
   if(mime==='image/jpeg'){ctx.fillStyle=getComputedStyle(dialog).getPropertyValue('--crop-export-bg').trim();ctx.fillRect(0,0,width,height)}
   const r=s.rect;ctx.drawImage(s.bitmap,r.x,r.y,r.w,r.h,0,0,width,height);
   const blob=await new Promise(resolve=>output.toBlob(resolve,mime,.9));if(active!==s)return;
   if(!blob||blob.type!==mime)throw Error('浏览器未能生成所选图片格式，请选择PNG后重试');
   if(blob.size>s.maxBytes)throw Error('生成文件超过上传限制，请减小输出尺寸或改用JPEG');
   const ext=el('format').selectedOptions[0].dataset.ext,name=s.file.name.replace(/\.[^.]+$/,'').slice(0,150)+'_crop.'+ext;
   finish(new File([blob],name,{type:mime}));
  }catch(error){if(active===s){s.busy=false;dialog.querySelectorAll('input,select,button:not([data-crop-close])').forEach(n=>n.disabled=false);notice(error.message,'error');stateControls(s)}}
  finally{if(output){output.width=1;output.height=1}}
 });
}
