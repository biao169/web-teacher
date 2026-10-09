/** One on-demand summary request, no per-card fanout or automatic retries. */
import {adminFetch} from './native-access.js?v=0.15.28';
const root=document.querySelector('[data-dashboard-counts]');
if(root){
 const cells=[...root.querySelectorAll('[data-dashboard-count]')],status=root.querySelector('[data-dashboard-status]'),retry=root.querySelector('[data-dashboard-retry]');
 let controller=null,paused=false,loaded=false;
 async function load(){
  if(controller||paused||loaded)return;
  if(!cells.length){status.textContent='';return;}
  const current=new AbortController();controller=current;retry.hidden=true;retry.disabled=true;status.textContent='记录数量加载中…';
  const timer=setTimeout(()=>current.abort(),15000);
  try{
   const response=await adminFetch('/api/admin/dashboard-counts',{headers:{Accept:'application/json'},cache:'no-store',signal:current.signal});
   const data=await response.json();
   if(!response.ok)throw new Error(`HTTP ${response.status} · ${data?.error||'统计读取失败'}`);
   if(!data?.counts||cells.some(cell=>!Number.isSafeInteger(data.counts[cell.dataset.dashboardCount])||data.counts[cell.dataset.dashboardCount]<0))throw new Error('统计结果不完整，请重试');
   if(paused)return;
   for(const cell of cells){cell.textContent=String(data.counts[cell.dataset.dashboardCount]);cell.setAttribute('aria-label','记录数量 '+cell.textContent);}
   loaded=true;status.textContent='';
  }catch(error){
   if(!paused){status.textContent='数量暂未加载，不影响进入模块。'+(error.name==='AbortError'?'请求超时':error.message);retry.hidden=false;}
  }finally{clearTimeout(timer);controller=null;retry.disabled=false;}
 }
 retry.addEventListener('click',load);
 window.addEventListener('pagehide',()=>{paused=true;controller?.abort();});
 window.addEventListener('pageshow',()=>{paused=false;load();});
 load();
}
