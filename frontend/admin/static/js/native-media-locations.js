/** Read-only paged source panel; late responses never reopen a dismissed dialog. */
import {requestJSON} from './native-http.js';
export function setupMediaLocations(root){
 const events=new AbortController();let dialog=null,sequence=0,pending=false;
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
 return ()=>{events.abort();close()};
}
