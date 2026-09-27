import {adminFetch} from './native-access.js?v=0.15.28';
/** Shared authenticated helper requests; callers may cancel stale read-only previews. */
export async function assist(path,data,{signal,csrf}={}){
 const form=document.querySelector('#native-editor');
 const response=await adminFetch('/api/assistance/'+path,{method:'POST',signal,headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({_csrf:csrf??form?.elements.namedItem('_csrf').value,...data})});
 let result;try{result=await response.json()}catch{throw Error('服务暂时无法响应，请重试。')}
 if(!response.ok)throw Error(result.error||'操作失败，请重试。');
 return result;
}
