/** Read-only paged source panel; late responses never reopen a dismissed dialog. */
import {requestJSON} from './native-http.js?v=0.16.076';
import {adminFetch} from './native-access.js?v=0.15.28';
export function setupMediaLocations(root){
 const events=new AbortController();let dialog=null,sequence=0,pending=false;
 let disposed=root.dataset.mediaUsageStopped==='true',timer=null,deadline=null,controller=null;
 const initialURL=location.href;let nextOffset=0;
 const anchors=[...root.querySelectorAll('[data-media-locations]')];
 function stop(){disposed=true;clearTimeout(timer);clearTimeout(deadline);controller?.abort();controller=null;}
 const valid=()=>!disposed&&root.isConnected&&location.href===initialURL;
 function paint(anchor,text){if(valid()&&root.contains(anchor)){const cell=anchor.querySelector('[data-media-usage-summary]');if(cell)cell.textContent=text;}}
 function summary(item){
  if(!item)return '未找到媒体；点击查看';
  const parts=(item.groups||[]).map(g=>g.label+' ×'+g.count);
  if(item.protected)parts.push('包含受保护引用');
  if(item.uncertain)parts.push('引用需进一步核对');
  return parts.join('；')||(item.used?'已使用':'未使用');
 }
 async function batch(offset){
  if(!valid())return stop();
  const current=anchors.slice(offset,offset+20);if(!current.length)return;
  current.forEach(a=>paint(a,'读取中…'));controller=new AbortController();
  const active=controller;const activeDeadline=setTimeout(()=>active.abort(),15000);deadline=activeDeadline;
  try{
   const params=new URLSearchParams();current.forEach(a=>params.append('uid',a.dataset.mediaLocations));
   const response=await adminFetch('/api/admin/media/usage-summaries?'+params,{headers:{Accept:'application/json'},signal:active.signal});
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();if(!valid()||active.signal.aborted)return;
   current.forEach(a=>paint(a,summary(data.items?.[a.dataset.mediaLocations])));
  }catch(error){if(valid())current.forEach(a=>paint(a,'读取失败；点击查看'));}
  finally{clearTimeout(activeDeadline);if(controller===active)controller=null;}
  if(active.signal.aborted)return;
  nextOffset=offset+20;
  if(valid()&&offset+20<anchors.length)timer=setTimeout(()=>batch(offset+20),200);
 }
 const on=(node,name,fn)=>node.addEventListener(name,fn,{signal:events.signal});
 on(window,'pagehide',stop);
 on(document,'teacher:navigation-start',()=>{stop();close();});
 function resume(){if(root.isConnected&&location.href===initialURL&&root.dataset.mediaUsageStopped!=='true'){disposed=false;clearTimeout(timer);timer=setTimeout(()=>batch(nextOffset),1000);}}
 on(document,'teacher:navigation-cancel',resume);
 on(window,'pageshow',e=>{if(e.persisted)resume();});
 on(root,'native-list-loading',stop);
 on(root,'submit',stop);
 root.addEventListener('click',e=>{if(e.target.closest('[data-column-sort],.native-popover button'))stop();},{capture:true,signal:events.signal});
 on(root,'input',e=>{if(e.target.matches('#search,[name="q"]'))stop();});
 on(root,'change',e=>{if(e.target.matches('[data-page-size],select[name],input[name^="f."]'))stop();});
 on(document,'click',e=>{const a=e.target.closest('a[href]');if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.target==='_blank'||a.hasAttribute('download')||a.matches('[data-media-locations]'))return;const url=new URL(a.href,location.href);if(url.pathname!==location.pathname||url.search!==location.search)stop();});
 timer=setTimeout(()=>batch(0),1000);
 function close(){sequence++;dialog?.close();dialog?.remove();dialog=null}
 root.addEventListener('click',event=>{
  const anchor=event.target.closest('[data-media-locations]');if(!anchor||!root.contains(anchor)||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();if(pending)return;close();const current=document.createElement('dialog');dialog=current;current.className='native-locations-dialog';current.setAttribute('aria-label','媒体使用位置');
  current.innerHTML='<div class="native-title"><h2>使用位置</h2><button type="button" class="btn btn-outline-secondary btn-sm" data-close>关闭</button></div><div data-locations-content aria-live="polite"></div>';
  const body=current.querySelector('[data-locations-content]'),detail=anchor.cloneNode(true);detail.removeAttribute('data-media-locations');detail.className='btn btn-outline-secondary btn-sm';detail.textContent='打开媒体详情 ↗';detail.target='_blank';detail.rel='noopener noreferrer';current.append(detail);
  async function load(url){
   if(pending)return;pending=true;const id=++sequence;body.textContent='正在读取使用位置…';body.setAttribute('aria-busy','true');
   try{const result=await requestJSON(url);if(id!==sequence||dialog!==current)return;body.innerHTML=result.html;}
   catch(error){if(id!==sequence||dialog!==current)return;body.textContent=error.message+' ';const retry=document.createElement('button');retry.type='button';retry.className='btn btn-outline-primary btn-sm';retry.textContent='重试读取';retry.addEventListener('click',()=>load(url));body.append(retry)}
   finally{pending=false;if(id===sequence)body.removeAttribute('aria-busy')}
  }
  current.addEventListener('click',e=>{
   if(e.target.closest('[data-close]'))current.close();
   const link=e.target.closest('[data-source-page],.native-pagination a');if(!link)return;e.preventDefault();if(link.closest('.disabled'))return;load(link.href);
  });
  current.addEventListener('close',()=>{if(dialog===current){sequence++;dialog=null}current.remove();if(anchor.isConnected)anchor.focus()},{once:true});
  document.body.append(current);current.showModal();load('/api/admin/media/'+encodeURIComponent(anchor.dataset.mediaLocations)+'/locations');
 },{signal:events.signal});
 return ()=>{stop();events.abort();close()};
}
