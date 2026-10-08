export function retryKey(origin,scope){return 'teacher-sync-proposal:'+JSON.stringify([origin,[...scope].sort()]);}
export async function requestJSON(url,{body,fetcher=fetch,timeoutMs=30000}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetcher(url,{method:body===undefined?'GET':'POST',credentials:'same-origin',signal:controller.signal,headers:{'content-type':'application/json',...(body===undefined?{}:{'x-csrf-token':document.querySelector('meta[name="csrf-token"]').content})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const raw=await response.text();if(raw.length>131072)throw Error('响应超过诊断上限，请按请求 ID 查看服务端日志');
  let data;try{data=JSON.parse(raw);}catch{}
  if(!response.ok||!data||typeof data!=='object'){
   const code=raw.match(/\b110[12]\b/)?.[0];
   throw Error('HTTP '+response.status+' · '+(data?.error||data?.message||'响应不是有效 JSON')+(data?.code?' · '+data.code:'')+(code?' · 页面错误码 '+code:'')+'\n请求 ID：'+(data?.request_id||response.headers.get('x-request-id')||'未取得')+'\nRay ID：'+(response.headers.get('cf-ray')||'未取得')+(data?.diagnostic?'\n'+JSON.stringify(data.diagnostic,null,2):''));
  }
  return data;
 }catch(error){if(controller.signal.aborted)throw Error('等待响应超时；对端可能已创建任务，请使用同一请求重试，不要重复新建。');throw error;}
 finally{clearTimeout(timer);}
}
