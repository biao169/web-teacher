import {adminFetch} from './native-access.js?v=0.15.28';
/** Shared log downloads and message detail actions; lists keep their existing save lifecycle. */
import {requestJSON} from './native-http.js';
import {notify,rememberNotice} from './native-notifications.js';

export function setupLogExport(root){
 // Every replacement list gets one handler; failed downloads leave filters and rows in place.
 const link=root.querySelector('[data-log-export]');if(!link)return;let busy=false;
 link.addEventListener('click',async event=>{
  event.preventDefault();if(busy)return;
  const url=new URL(link.href,location.origin),fmt=root.querySelector('[data-log-format]').value;
  url.searchParams.set('format',fmt);url.searchParams.set('details',root.querySelector('[data-log-details]').checked?'1':'0');
  busy=true;link.setAttribute('aria-disabled','true');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
  notify('正在生成脱敏日志文件…','progress',{id:'log-export'});
  try{
   const response=await adminFetch(url,{headers:{Accept:'application/json'},signal:controller.signal});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'日志导出失败，请缩小筛选范围后重试。')}
   const blob=await response.blob(),href=URL.createObjectURL(blob),download=document.createElement('a');
   download.href=href;download.download=`operation-logs.${fmt}`;document.body.append(download);download.click();download.remove();setTimeout(()=>URL.revokeObjectURL(href),10000);
   notify('日志文件已生成，已交给浏览器下载。','success',{id:'log-export'});
  }catch(error){notify(error.name==='AbortError'?'导出等待超时，请缩小筛选范围后重试。':error.message,'error',{id:'log-export'})}
  finally{clearTimeout(timer);busy=false;link.removeAttribute('aria-disabled')}
 });
}

const detail=document.querySelector('[data-record-detail]'),button=document.querySelector('[data-detail-status-save]');
if(detail&&button){
 button.addEventListener('click',async()=>{
  const select=document.querySelector('[data-detail-message-status]'),value=select.value;
  if(!value){notify('请选择处理状态。','info',{id:'message-status'});return}
  if(!confirm(`将此留言标记为“${select.selectedOptions[0].textContent}”？不会发送邮件。`))return;
  button.disabled=true;select.disabled=true;
  try{
   await requestJSON(`/api/admin/messages/${encodeURIComponent(detail.dataset.recordUid)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_csrf:detail.dataset.csrf,stamp:detail.dataset.recordStamp,action:'message-status',value})});
   rememberNotice('留言状态已更新','success',location.href);location.reload();
  }catch(error){
   notify(error.uncertain?'请求结果待核对，请重新打开详情再决定是否重试。':error.message,'error',{id:'message-status'});
   // An uncertain write may have committed. Keep it locked until a fresh server view.
   if(!error.uncertain){button.disabled=false;select.disabled=false}
  }
 });
}
