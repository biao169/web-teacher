import {adminFetch} from './native-access.js?v=0.15.28';
/** Shared media loading state. A failed request must not permanently hide a readable image. */
const previews=new WeakMap();
let detailDialog=null;
// Error bursts must not create another burst of HEAD requests on small servers.
const checks=[];let checking=0;
function checkMedia(work){return new Promise((resolve,reject)=>{checks.push({work,resolve,reject});pumpChecks()})}
function pumpChecks(){while(checking<2&&checks.length){const {work,resolve,reject}=checks.shift();checking++;Promise.resolve().then(work).then(resolve,reject).finally(()=>{checking--;pumpChecks()})}}
const create=(tag,text='',className='')=>Object.assign(document.createElement(tag),{textContent:text,className});
const privateURL=value=>{try{const url=new URL(value,location.href);return url.origin===location.origin&&(/^\/api\/admin\/media\/[^/]+\/content$/.test(url.pathname)||/^\/api\/admin\/media-audit\/[a-f0-9]{32}\/\d+\/\d+\/content$/.test(url.pathname))?url:null}catch{return null}};

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
   const issue=response.headers.get('x-media-error');
   if(issue==='media_read_denied')return result('网站运行账号没有读取文件的权限，请检查媒体目录和文件权限。');
   if(issue==='media_read_failed')return result('媒体文件暂不可读取，请检查磁盘与目录状态后重试。');
   const reasons={401:'登录已过期，请登录后重试。',403:'没有媒体查看权限。',404:'配置的媒体目录中找不到文件，或文件无法访问。',409:'文件已变化，请重试。',413:'服务器拒绝了此次读取，请检查代理或服务限制。'};
   if(reasons[response.status])return result(reasons[response.status]);
   if(!response.ok)return result('媒体服务暂不可用（HTTP '+response.status+'），请稍后重试。',[502,503,504].includes(response.status)&&!response.headers.get('retry-after'));
   const type=(response.headers.get('content-type')?.split(';')[0]||'').trim().toLowerCase();
   if(response.headers.get('content-length')==='0')return result('文件内容为空，无法预览；请核对原文件。');
   if((media.tagName==='IMG'&&!['image/jpeg','image/png','image/gif','image/webp'].includes(type))||(media.tagName==='VIDEO'&&!type.startsWith('video/')))return result('实际文件类型不支持此预览，请核对原文件。');
   const unsupported=media.tagName==='VIDEO'&&media.error?.code===4;
   return result(unsupported?'浏览器不支持此视频编码，可下载原文件后播放。':'文件头可读取，但预览尚未完成；可能是传输中断或文件无法解码。',media.tagName==='IMG'||(media.tagName==='VIDEO'&&!unsupported));
  }catch{return result(request.signal.aborted?'检查超时，请重试或打开原文件。':'网络检查失败，请重试或打开原文件。',!request.signal.aborted&&!!privateURL(media.src))}
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

/** On-demand dialog reuses the authorized content response and existing preview states. */
export function setupMediaViewer(root){
 const events=new AbortController();let current=null;
 function close(){if(current){current.abort.abort();clearMediaPreviews(current.dialog);current.dialog.querySelectorAll('video').forEach(video=>{video.pause();video.removeAttribute('src');video.load()});current.dialog.remove();current=null}}
 root.addEventListener('click',async event=>{
  const trigger=event.target.closest('[data-media-peek]');if(!trigger||!root.contains(trigger)||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const url=privateURL(trigger.href);if(!url)return;event.preventDefault();close();
  const dialog=create('dialog','','native-media-viewer'),heading=create('h2',trigger.dataset.previewTitle||'媒体预览'),body=create('div','','native-media-preview'),status=create('p','正在读取预览…','native-muted'),buttons=create('div','','native-helper-actions'),original=create('a','↗ 打开原文件','btn btn-outline-secondary btn-sm'),download=create('a','⇩ 下载','btn btn-outline-primary btn-sm'),exit=create('button','关闭','btn btn-outline-secondary btn-sm');
  heading.id='media-viewer-title';dialog.setAttribute('aria-labelledby',heading.id);body.dataset.mediaPreview='';status.setAttribute('role','status');exit.type='button';original.href=url.href;original.target='_blank';original.rel='noopener noreferrer';const downloadURL=new URL(url);downloadURL.searchParams.set('download','1');download.href=downloadURL.href;
  body.append(status);buttons.append(original,download,exit);dialog.append(heading,body,buttons);document.body.append(dialog);
  const abort=new AbortController();current={dialog,abort};exit.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{if(current?.dialog===dialog){close();trigger.focus()}});dialog.showModal();exit.focus();
  const timeout=setTimeout(()=>abort.abort(),10000);
  try{
   const response=await checkMedia(()=>adminFetch(url,{method:'HEAD',headers:{Accept:'application/json'},credentials:'same-origin',redirect:'manual',cache:'no-store',signal:abort.signal}));
   if(current?.dialog!==dialog)return;
   if(!response.ok)throw Error(response.status===409?'报告或文件已变化，请刷新核对页后重试。':response.status===404?'媒体文件已不存在，请重新核对。':'预览暂不可用（HTTP '+response.status+'），可打开原文件查看。');
   const type=(response.headers.get('content-type')||'').split(';')[0];
   let media;
   if(['image/png','image/jpeg','image/gif','image/webp'].includes(type)){media=create('img');media.alt=heading.textContent;media.dataset.mediaLarge=''}
   else if(type.startsWith('video/')){media=create('video');media.controls=true;media.preload='metadata';media.dataset.mediaLarge=''}
   else if(type==='application/pdf'){media=create('iframe');media.title=heading.textContent;media.className='native-media-viewer-pdf'}
   else{status.textContent='此类型不支持浏览器内预览，可以下载原文件。';return}
   media.src=url.href;body.replaceChildren(media);if(media.tagName!=='IFRAME')watchMediaPreview(media,{host:body});
  }catch(error){if(current?.dialog===dialog)status.textContent=abort.signal.aborted?'预览检查超时，可关闭后重试。':error.message}
  finally{clearTimeout(timeout)}
 },{signal:events.signal});
 return ()=>{events.abort();close()};
}
