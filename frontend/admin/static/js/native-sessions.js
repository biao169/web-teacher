import {adminFetch} from './native-access.js?v=0.15.28';
/** Account-local session controls: refresh fragments, preserve drafts, never retry writes automatically. */
import {mountTableHeaders} from './native-table-headers.js?v=0.15.38';
import {notify} from './native-notifications.js';
const section=document.querySelector('#tool-sessions'),form=document.querySelector('#native-editor');
if(section&&form){
 let busy=false,headers=null;
 function bindHeaders(){headers?.dispose();headers=mountTableHeaders(root(),{query:()=>url().searchParams,blocked:()=>busy||form.inert,apply:params=>{const target=new URL(root().dataset.endpoint,location.origin);target.search=params;perform('refresh',target)}})}
 const root=()=>section.querySelector('[data-sessions]');
 const picked=()=>[...root().querySelectorAll('[data-session-pick]:checked')].map(input=>input.dataset.sessionPick);
 // Session choices are helper state, never named values in the account form.
 /** Synchronize page-local selection, its tri-state checkbox and the revoke button. */
 function selection(){
  const inputs=[...root().querySelectorAll('[data-session-pick]:not(:disabled)')],n=picked().length;
  root().querySelector('[data-session-selected]').textContent=`已选 ${n} 条`;
  root().querySelector('[data-session-revoke=selected]').disabled=!n;
  const all=root().querySelector('[data-session-all]');all.checked=Boolean(inputs.length)&&n===inputs.length;all.indeterminate=n>0&&n<inputs.length;all.disabled=!inputs.length;
 }
 /** Serialize only this panel's filters; never change the account editor URL or draft. */
 function url(page=1){
  const target=new URL(root().dataset.endpoint,location.origin);
  root().querySelectorAll('[data-session-query]').forEach(input=>target.searchParams.set(input.dataset.sessionQuery,input.value));
  target.searchParams.set('page',page);
  if(root().dataset.nav)target.searchParams.set('nav',root().dataset.nav);
  return target;
 }
 /** Convert structured HTTP errors into the shared notification text. */
 async function responseData(response){
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||(response.status===401?'登录已过期，请重新登录。':'会话操作未完成，请刷新本区后重试。'));
  return data;
 }
 /** Replace the escaped server-rendered session fragment without replacing the form. */
 async function refresh(target=url()){
  const data=await responseData(await adminFetch(target,{headers:{Accept:'application/json'}}));
  if(typeof data.html!=='string')throw new Error('会话响应不完整，请重新刷新本区。');
  const template=document.createElement('template');template.innerHTML=data.html;
  const next=template.content.querySelector('[data-sessions]');
  if(!next)throw new Error('会话响应不完整，请重新刷新本区。');
  headers?.dispose();root().replaceWith(next);selection();bindHeaders();
 }
 /** Confirm destructive login changes, serialize actions, then refresh and report outcomes. */
 async function perform(action,target){
  if(busy||form.inert)return;
  let payload=null;
  if(action==='revoke'){
   const mode=target.dataset.sessionRevoke||'selected',ids=target.dataset.sessionOne?[target.dataset.sessionOne]:picked();
   const description=mode==='others'?'该账号执行时的全部其他活动会话（跨越当前筛选和所有页码）':`所选 ${ids.length} 条活动会话`;
   if(!confirm(`确定撤销${description}？\n这些登录将立即失效；当前浏览器和未保存的账号输入会保留。`))return;
   payload={_csrf:form.elements._csrf.value,stamp:root().dataset.accountStamp,mode,selected:mode==='others'?[]:ids,nav:root().dataset.nav,nav_stamp:root().dataset.navStamp};
  }
  const focusId=document.activeElement?.id;
  busy=true;root().inert=true;section.setAttribute('aria-busy','true');
  // Prevent a simultaneous account save from navigating away while this write is unresolved.
  const saves=[...document.querySelectorAll('button[form="native-editor"]:not(:disabled)')];saves.forEach(button=>button.disabled=true);
  try{
   if(payload){
    notify('正在撤销会话…','progress',{id:'sessions'});
    const result=await responseData(await adminFetch(root().dataset.endpoint+'/revoke',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(payload)}));
    notify(result.affected?`已撤销 ${result.affected} 条会话。`:'没有需要撤销的其他活动会话。','success',{id:'sessions'});
    try{await refresh(url());root().querySelector('[data-session-refresh]').focus();}catch(error){notify('撤销已成功，但列表未刷新。请点击本区刷新核对；账号输入已保留。','warning',{id:'sessions'});}
   }else{
    await refresh(target||url());
    if(focusId)section.querySelector('#'+focusId)?.focus();
   }
  }catch(error){
   notify((error instanceof TypeError?'请求未完成，请先刷新本区核对结果，不要重复撤销。':error.message)+' 账号输入已保留。','error',{id:'sessions'});
  }finally{
   busy=false;root().inert=false;section.removeAttribute('aria-busy');saves.forEach(button=>button.disabled=false);selection();
  }
 }
 section.addEventListener('change',event=>{
  if(event.target.matches('[data-session-all]'))root().querySelectorAll('[data-session-pick]:not(:disabled)').forEach(input=>input.checked=event.target.checked);
  if(event.target.matches('[data-session-pick],[data-session-all]'))selection();
  if(event.target.matches('select[data-session-query]'))perform('refresh');
 });
 section.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-session-query]')){event.preventDefault();perform('refresh');}});
 section.addEventListener('click',event=>{
  const button=event.target.closest('button'),link=event.target.closest('.native-pagination a');
  if(link){event.preventDefault();if(!link.closest('.disabled'))perform('refresh',new URL(link.href));}
  if(button?.matches('[data-session-refresh]'))perform('refresh');
  if(button?.matches('[data-session-one],[data-session-revoke]'))perform('revoke',button);
 });
 form.addEventListener('submit',event=>{if(busy){event.preventDefault();event.stopImmediatePropagation();}},true);
 selection();bindHeaders();
}
