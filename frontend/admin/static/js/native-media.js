import {adminFetch} from './native-access.js?v=0.15.28';
/** Shared media loading state. A failed request must not permanently hide a readable image. */
const previews=new WeakMap();
let detailDialog=null;
// Error bursts must not create another burst of HEAD requests on small servers.
const checks=[];let checking=0;
function checkMedia(work){return new Promise((resolve,reject)=>{checks.push({work,resolve,reject});pumpChecks()})}
function pumpChecks(){while(checking<2&&checks.length){const {work,resolve,reject}=checks.shift();checking++;Promise.resolve().then(work).then(resolve,reject).finally(()=>{checking--;pumpChecks()})}}
const create=(tag,text='',className='')=>Object.assign(document.createElement(tag),{textContent:text,className});
const privateURL=value=>{try{const url=new URL(value,location.href);return url.origin===location.origin&&/^\/api\/admin\/media\/[^/]+\/content$/.test(url.pathname)?url:null}catch{return null}};

export function clearMediaPreviews(root){
 root.querySelectorAll('[data-preview-bound]').forEach(media=>previews.get(media)?.dispose());
}
export function watchMediaPreview(media,{host=media.parentElement,onStatus=()=>{}}={}){
 if(previews.has(media))return previews.get(media);
 media.dataset.previewBound='';
 const panel=host.querySelector('[data-preview-feedback],[data-preview-fallback],[data-preview-error]')||create('div');
 panel.dataset.previewFeedback='';panel.classList.add('native-preview-feedback');panel.setAttribute('role','status');panel.hidden=true;
 const message=create('span'),actions=create('span','','native-preview-actions'),retry=create('button','↻ 重试','btn btn-outline-secondary btn-sm'),open=create('a','↗ 原文件','btn btn-outline-secondary btn-sm');
 message.dataset.previewMessage='';retry.type='button';retry.dataset.previewRetry='';retry.title='重新加载预览，不重新上传或修改文件';open.dataset.previewOpen='';open.target='_blank';open.rel='noopener noreferrer';open.referrerPolicy='no-referrer';open.title='新标签页打开原文件';open.href=media.src;
 actions.append(retry,open);panel.replaceChildren(message,actions);if(!panel.parentElement)host.append(panel);
 const compact=host.classList.contains('native-media-thumb-wrap'),details=create('button','失败','btn btn-outline-secondary btn-sm');
 if(compact){panel.classList.add('is-compact');details.type='button';details.dataset.previewDetails='';details.setAttribute('aria-label','查看预览失败原因');panel.append(details)}
 const frozen=compact?host.closest('tr')?.querySelector('.native-frozen'):null,mobile=frozen?details.cloneNode(true):null;
 const indicator=mobile?create('span','⚠'):null;
 if(mobile){mobile.dataset.previewMobile='';mobile.classList.add('native-preview-mobile');mobile.hidden=true;frozen.append(mobile);indicator.hidden=true;indicator.setAttribute('aria-hidden','true');host.querySelector('a').append(indicator)}
 let sequence=0,controller=null,timer=0,disposed=false,automaticRetries=0;
 const live=()=>!disposed&&media.isConnected&&host.contains(media);
 const cancel=()=>{sequence++;controller?.abort();controller=null;clearTimeout(timer);timer=0};
 function show(value,state='error'){
  message.textContent=value;panel.hidden=false;panel.dataset.previewState=state;
  media.dataset.previewState=state;retry.disabled=state==='loading';details.textContent=state==='loading'?'加载':'失败';details.title=value;
  if(mobile){mobile.hidden=false;mobile.textContent=state==='loading'?'预览加载中':'预览失败';mobile.title=value;indicator.hidden=state==='loading'}refreshDialog();onStatus(false,value);
 }
 function loaded(){
  if(!live())return;cancel();media.hidden=false;media.dataset.previewState='ready';panel.hidden=true;if(mobile){mobile.hidden=true;indicator.hidden=true}retry.disabled=false;message.textContent='✓ 预览已恢复';refreshDialog();onStatus(true,'');
 }
 async function diagnose(token){
  const result=(message,retryable=false)=>({message,retryable});
  const url=privateURL(media.src);if(!url)return result('外部图片无法预览，可能是链接失效或浏览器限制。');
  if(!live()||token!==sequence)return result('');
  const request=new AbortController();controller=request;const timeout=setTimeout(()=>request.abort(),8000);
  try{
   // HEAD checks the existing authorized endpoint and at most its signature bytes; never buffers the image.
   const response=await adminFetch(url,{method:'HEAD',headers:{Accept:'application/json'},credentials:'same-origin',redirect:'manual',cache:'no-store',signal:request.signal});
   if(token!==sequence)return result('');
   if(response.type==='opaqueredirect'||(response.status>=300&&response.status<400))return result('外部图片无法预览，可打开原文件核对。');
   const reasons={401:'登录已过期，请登录后重试。',403:'没有媒体查看权限。',404:'文件不存在或无法访问。',409:'文件已变化，请重试。',413:'文件超过20 MiB预览上限。'};
   if(reasons[response.status])return result(reasons[response.status]);
   if(!response.ok)return result('媒体服务暂不可用（HTTP '+response.status+'），请稍后重试。',[502,503,504].includes(response.status)&&!response.headers.get('retry-after'));
   const type=(response.headers.get('content-type')?.split(';')[0]||'').trim().toLowerCase();
   if(response.headers.get('content-length')==='0')return result('文件内容为空，无法预览；请核对原文件。');
   if((media.tagName==='IMG'&&!['image/jpeg','image/png','image/gif','image/webp'].includes(type))||(media.tagName==='VIDEO'&&!type.startsWith('video/')))return result('实际文件类型不支持此预览，请核对原文件。');
   return result('文件可读取，预览未完成；可能是传输中断或解码失败。',media.tagName==='IMG');
  }catch{return result(request.signal.aborted?'检查超时，请重试或打开原文件。':'网络检查失败，请重试或打开原文件。')}
  finally{clearTimeout(timeout);if(controller===request)controller=null}
 }
 async function failed(){
  if(!live())return;cancel();const token=sequence;if(media.tagName==='IMG')media.hidden=true;
  show('预览失败，正在检查…');const reason=await checkMedia(()=>diagnose(token));
  if(!live()||token!==sequence||media.dataset.previewState==='ready')return;
  show(reason.message);
  // Only bounded, read-only retries of same-origin authorized endpoints. Never
  // retry authorization errors, external redirects or mutate signed URLs.
  if(reason.retryable&&automaticRetries<2){
   automaticRetries++;show(reason.message+' 将自动重试（'+automaticRetries+'/2）。','loading');
   timer=setTimeout(()=>{if(live()&&token===sequence)reload(false)},1000*automaticRetries+Math.floor(Math.random()*500));
  }
 }
 function reload(manual=true){
  if(!live())return;cancel();const token=sequence;media.hidden=false;show('正在重新加载…','loading');
  if(manual)automaticRetries=0;
  const url=privateURL(media.src),source=media.getAttribute('src');
  if(url){url.searchParams.set('preview_retry',String(Date.now()));media.src=url.href}
  else{media.removeAttribute('src');media.src=source} // Do not alter signed external URLs.
  if(media.tagName==='IMG')media.loading='eager';else media.load();
  timer=setTimeout(()=>{if(live()&&token===sequence)show('加载较慢，可重试或打开原文件。')},15000);
 }
 function refreshDialog(){
  if(detailDialog?.owner!==control)return;detailDialog.message.textContent=message.textContent;detailDialog.retry.disabled=retry.disabled||media.dataset.previewState==='ready';
 }
 function openDetails(){
  if(detailDialog)detailDialog.dialog.close();
  const dialog=create('dialog','','native-preview-dialog'),heading=create('h2','图片预览状态'),name=create('p',media.alt||'媒体图片'),copy=create('p',message.textContent),buttons=create('div','','native-preview-actions'),again=create('button','↻ 重试','btn btn-primary btn-sm'),original=open.cloneNode(true),close=create('button','关闭','btn btn-outline-secondary btn-sm');
  dialog.dataset.previewDialog='';heading.id='media-preview-status-title';dialog.setAttribute('aria-labelledby',heading.id);copy.setAttribute('role','status');name.className='native-muted';
  again.type=close.type='button';again.dataset.previewDialogRetry='';again.addEventListener('click',reload);close.addEventListener('click',()=>dialog.close());buttons.append(again,original,close);dialog.append(heading,name,copy,buttons);document.body.append(dialog);
  detailDialog={dialog,owner:control,message:copy,retry:again};refreshDialog();
  dialog.addEventListener('close',()=>{if(detailDialog?.dialog===dialog)detailDialog=null;dialog.remove();if(live())(panel.hidden?(frozen?.querySelector('[tabindex]')||host.querySelector('a')):(details.getClientRects().length?details:mobile))?.focus()},{once:true});dialog.showModal();
 }
 details.addEventListener('click',openDetails);
 mobile?.addEventListener('click',openDetails);
 const event=media.tagName==='IMG'?'load':'loadedmetadata';media.addEventListener(event,loaded);media.addEventListener('error',failed);retry.addEventListener('click',reload);
 const control={dispose(){disposed=true;cancel();if(detailDialog?.owner===control)detailDialog.dialog.close();mobile?.remove();indicator?.remove();media.removeEventListener(event,loaded);media.removeEventListener('error',failed);retry.removeEventListener('click',reload);previews.delete(media);delete media.dataset.previewBound}};previews.set(media,control);
 // A lazy image waiting outside the viewport is pending, not broken.
 if(media.tagName==='IMG'&&media.getAttribute('src')&&media.complete){if(media.naturalWidth)loaded();else queueMicrotask(failed)}
 return control;
}
export function setupMediaPreviews(root=document){
 root.querySelectorAll('[data-media-thumb],[data-media-large]').forEach(media=>watchMediaPreview(media,{host:media.closest('[data-media-preview]')||media.parentElement}));
}
setupMediaPreviews();
