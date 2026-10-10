import {adminFetch} from './native-access.js?v=0.15.28';
/** Shared bounded JSON requests; interrupted writes are never automatically replayed. */
const reads=new Set();let leaving=false;
function stopReads(){leaving=true;for(const c of reads)c.abort();}
document.addEventListener('teacher:navigation-start',stopReads);
window.addEventListener('pagehide',stopReads);
document.addEventListener('teacher:navigation-cancel',()=>{leaving=false;});
window.addEventListener('pageshow',()=>{leaving=false;});
export async function requestJSON(url,options={},timeout=15000){
 // Bounded requests never replay a write; an interrupted response may already have committed.
 const readonly=['GET','HEAD'].includes((options.method||'GET').toUpperCase());
 if(readonly&&leaving)throw new DOMException('Navigation in progress','AbortError');
 const controller=new AbortController();if(readonly)reads.add(controller);
 const timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await adminFetch(url,{...options,headers:{Accept:'application/json',...options.headers},signal:controller.signal});
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result){
   const error=new Error(result?.error||'服务器未能返回有效结果');error.status=response.status;
   error.uncertain=response.status>=500||!result;throw error;
  }
  if(readonly&&controller.signal.aborted)throw new DOMException('Read cancelled','AbortError');
  return result;
 }catch(error){
  if(error.name==='AbortError'||error instanceof TypeError){error=new Error('网络请求未完成，结果需要核对');error.uncertain=true}
  throw error;
 }finally{clearTimeout(timer);reads.delete(controller)}
}
