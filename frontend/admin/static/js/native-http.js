import {adminFetch} from './native-access.js?v=0.15.28';
/** Shared bounded JSON requests; interrupted writes are never automatically replayed. */
export async function requestJSON(url,options={},timeout=15000){
 // Bounded requests never replay a write; an interrupted response may already have committed.
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await adminFetch(url,{...options,headers:{Accept:'application/json',...options.headers},signal:controller.signal});
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result){
   const error=new Error(result?.error||'服务器未能返回有效结果');error.status=response.status;
   error.uncertain=response.status>=500||!result;throw error;
  }
  return result;
 }catch(error){
  if(error.name==='AbortError'||error instanceof TypeError){error=new Error('网络请求未完成，结果需要核对');error.uncertain=true}
  throw error;
 }finally{clearTimeout(timer)}
}
