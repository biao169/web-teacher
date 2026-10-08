import {begin,finish} from './feedback.mjs?v=0.16.046';
const form=document.querySelector('#sync-connection');
if(form)form.onsubmit=async e=>{e.preventDefault();const message=form.querySelector('[data-connection-message]'),button=form.querySelector('button');button.disabled=true;begin('保存连接与授权');try{const r=await fetch('/api/admin/site-sync/connection',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':document.querySelector('meta[name="csrf-token"]').content},body:JSON.stringify({origin:form.elements.origin.value,enabled:form.elements.enabled.checked,incoming_auto_scope:[...form.querySelectorAll('[name=incoming_auto_scope]:checked')].map(e=>e.value),incoming_auto_delete:form.elements.incoming_auto_delete.checked})});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error('HTTP '+r.status+' · '+(d.error||d.detail||'保存失败，请检查权限、域名及部署密钥'));}message.textContent='连接与授权已保存';finish(message.textContent);}catch(e){message.textContent=e.message;finish(e.message,'error');}finally{button.disabled=false;}};

import {installProposal} from './proposal-ui.mjs?v=0.16.046';
installProposal({begin,finish});

const probeButton=document.querySelector('[data-sync-probe]');
if(probeButton)probeButton.onclick=async()=>{
 const output=document.querySelector('[data-sync-probe-result]');probeButton.disabled=true;begin('测试连通性与授权');output.textContent='正在测试已保存连接…';
 try{const response=await fetch('/api/admin/site-sync/connectivity',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':document.querySelector('meta[name="csrf-token"]').content},body:'{}'});
 if(!response.ok){const raw=await response.text(),code=raw.match(/\b110[12]\b/)?.[0],ray=response.headers.get('cf-ray');throw new Error('测试接口 HTTP '+response.status+(code?' · Worker '+code:'')+(ray?' · Ray ID '+ray:'')+'；请检查后台权限、登录状态及 Worker 平台日志');}
 const result=await response.json();const auth=result.steps?.find(s=>s.stage==='peer_authorization');output.textContent=result.message+(auth?.missing_scope_details?.length?'\n对端缺少：'+auth.missing_scope_details.map(x=>x.label+' ['+x.scope+']').join('、'):'')+'\n'+JSON.stringify(result,null,2);finish(output.textContent,result.connectivity_ok===false||result.ok===false?'error':result.authorization_ok===false?'warning':'success','连通性与授权诊断');
 }catch(error){output.textContent=error.message;finish(error.message,'error');}finally{probeButton.disabled=false;}
};

const retryForm=document.querySelector('#sync-retry-policy');
if(retryForm){
 const url='/admin/site-sync/api/retry-policy',message=retryForm.querySelector('[data-retry-message]');
 fetch(url,{credentials:'same-origin'}).then(async r=>{if(!r.ok)throw Error('读取重试设置失败');return r.json();}).then(d=>{retryForm.elements.fast_retry_seconds.value=d.fast_retry_seconds;}).catch(e=>{message.textContent=e.message;});
 retryForm.onsubmit=async e=>{e.preventDefault();const b=retryForm.querySelector('button');b.disabled=true;begin('保存重试等待');try{const r=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':document.querySelector('meta[name="csrf-token"]').content},body:JSON.stringify({fast_retry_seconds:Number(retryForm.elements.fast_retry_seconds.value)})});if(!r.ok)throw Error('保存失败：请检查权限及数值范围');message.textContent='已保存，现有任务下一次失败即使用新等待时间';finish(message.textContent);}catch(e){message.textContent=e.message;finish(e.message,'error');}finally{b.disabled=false;}};
}

if(form){const inputs=[...form.querySelectorAll('[name=incoming_auto_scope]')];for(const input of inputs)input.addEventListener('change',()=>{const deps=JSON.parse(input.dataset.syncDeps||'[]');for(const other of inputs){if(input.checked&&deps.includes(other.value))other.checked=true;if(!input.checked&&JSON.parse(other.dataset.syncDeps||'[]').includes(input.value))other.checked=false;}});}
