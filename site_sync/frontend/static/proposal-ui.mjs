import {requestJSON,retryKey} from './proposal-client.mjs?v=0.16.041';
import {time} from './model.mjs?v=0.16.036';
export function installProposal({begin=()=>{},finish=()=>{}}={}){
 const button=document.querySelector('[data-proposal]');if(!button)return;
 const form=button.closest('form'),message=form.querySelector('[data-proposal-feedback]'),history=document.querySelector('[data-outgoing-proposals]');let busy=false;
 const origin=()=>document.querySelector('#site-sync-panel')?.dataset.peerOrigin||'peer';
 const pending=new Map();
 const storage={get:k=>{try{return sessionStorage.getItem(k)||pending.get(k);}catch{return pending.get(k);}},set:(k,v)=>{pending.set(k,v);if(pending.size>50)pending.delete(pending.keys().next().value);try{sessionStorage.setItem(k,v);}catch{}},remove:k=>{pending.delete(k);try{sessionStorage.removeItem(k);}catch{}}};
 async function load(){
  if(!history)return;
  try{const data=await requestJSON('/api/admin/site-sync/proposals');history.replaceChildren();
   if(!data.items.length){history.textContent='暂无发送记录';return;}
   const list=document.createElement('ul');
   for(const row of data.items){const item=document.createElement('li'),text=document.createElement('p');text.textContent=time(row.updated_at)+' · '+row.origin+' · '+(row.status==='confirmed'?'已送达：对端任务 '+row.result.task_id+(row.result.approval_required?'，等待对端审核':'，按对端策略自动确认'):'发送结果待确认')+' · 推送请求 '+row.request_id+(row.trace_id?' · 最近追踪 '+row.trace_id:'');item.append(text);
    if(row.status!=='confirmed'){const retry=document.createElement('button');retry.type='button';retry.className='btn btn-outline-primary btn-sm';retry.textContent='重试同一请求';retry.onclick=()=>submit(row.scope,row.request_id);item.append(retry);}
    if(row.diagnostic){const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='最近发送诊断';pre.textContent=JSON.stringify(row.diagnostic,null,2);details.append(summary,pre);item.append(details);}list.append(item);
   }history.append(list);
  }catch(e){history.textContent='发送记录读取失败：'+e.message;}
 }
 async function submit(scope,existing){
  if(busy)return;busy=true;button.disabled=true;begin('推送到对端');message.textContent='正在向对端提交推送请求…';
  const key=retryKey(origin(),scope);let id;
  try{
   if(!scope.length)throw Error('请至少选择一项同步内容');
   id=existing||storage.get(key)||crypto.randomUUID();storage.set(key,id);
   const data=await requestJSON('/api/admin/site-sync/proposal',{body:{request_id:id,scope}});
   if(!/^[a-f0-9]{32}$/.test(data.task_id)||typeof data.approval_required!=='boolean')throw Error('推送回执格式无效；请使用同一请求重试。');
   storage.remove(key);message.textContent='对端任务 '+data.task_id+(data.approval_required?'：等待对端审核':'：对端按预设策略自动确认')+'。该任务在对端执行；本站下方显示发送记录。';finish(message.textContent);
  }catch(e){message.textContent=e.message+(id?'\n推送请求 ID：'+id+'；结果未确认时使用同一请求重试。':'');finish(message.textContent,'error');}
  finally{busy=false;button.disabled=false;await load();}
 }
 button.onclick=()=>submit([...form.querySelectorAll('[name=scope]:checked')].map(x=>x.value));
 document.querySelector('[data-outgoing-refresh]')?.addEventListener('click',load);load();
}
