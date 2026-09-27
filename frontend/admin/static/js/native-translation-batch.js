import {adminFetch} from './native-access.js?v=0.15.28';
/** One browser drives bounded requests; reloads only read progress and never resume by themselves. */
import {assist} from './native-assistance.js';
import {notify} from './native-notifications.js';
const root=document.querySelector('[data-translation-batch]');
if(root){
 let state=JSON.parse(root.dataset.initial),driving=false,busy=false,generation=0;
 const phases={scan:'扫描来源',reconcile:'核对有效来源',ready:'等待执行',run:'处理队列',retry:'重排失败',done:'本批次结束'};
 const statuses={success:'✓ 成功',reused:'↶ 复用',failed:'× 失败',waiting:'◷ 等待重试',skipped:'— 跳过'};
 const names=Object.fromEntries(state.modules.map(x=>[x.id,x.label]));
 // Restore the owned job's fixed selections on reload; editing these controls only affects a new scan.
 if(state.job?.own){root.querySelectorAll('[name=batch-source]').forEach(n=>n.checked=state.job.modules.includes(n.value));
  const select=root.querySelector('[data-batch-provider]');if([...select.options].some(o=>o.value===state.job.provider))select.value=state.job.provider;}
 /** Render counters and links with text nodes only, retaining scroll and source selections. */
 function render(){
  const job=state.job,own=job?.own;
  const providers={default:'全局默认服务',fallback:'按配置回退',mymemory:'MyMemory',google:'Google',deepl:'DeepL',microsoft:'Microsoft',libretranslate:'LibreTranslate'};
  root.querySelector('[data-batch-scope]').textContent=own?`当前任务：${job.modules.map(t=>names[t]||t).join('、')} · ${providers[job.provider]||job.provider}；下方选项仅在新扫描时采用。`:'';
  root.querySelector('[data-batch-status]').textContent=job?(job.paused?'Ⅱ 已暂停':phases[job.phase])+(job.active?' · 当前请求处理中':driving?' · 本页推进中':' · 本页未自动运行'):'尚未建立批次';
  root.querySelector('[data-batch-message]').textContent=job?.message||'先选择公开来源并扫描。';
  root.querySelector('[data-batch-position]').textContent=job?`已检查 ${job.scanned} 个字段，扫描开始时预计 ${job.total} 个`:'扫描不调用翻译服务';
  const progress=root.querySelector('[data-batch-progress]');progress.value=job?(job.phase==='scan'?Math.min(99,100*job.scanned/Math.max(1,job.total)):100):0;
  for(const node of root.querySelectorAll('[data-batch-count]'))node.textContent=job?.counts[node.dataset.batchCount]||0;
  for(const node of root.querySelectorAll('[data-batch-metric]'))node.textContent=job?.metrics?.[node.dataset.batchMetric]??0;
  root.querySelector('[data-batch-packing]').textContent=job&&!job.packing?'此任务沿用旧版单条执行；完成后重新扫描可使用合批统计。':job?.needs_recovery?'有未完整保存的请求，请继续原任务核对；不会自动重发待确认内容。':'本任务支持多原文合批，统计按本次扫描累计。';
  for(const button of root.querySelectorAll('[data-batch-action]')){
   const action=button.dataset.batchAction;
   button.disabled=action==='pause'?!job?.can_pause:busy||driving||!state.can_edit||
    (action==='scan'? job?.needs_recovery||!state.can_create||!state.modules.length||Boolean(job?.active&&Date.parse(job.recovery_at)>Date.now())||Boolean(job&&!job.paused&&!['ready','done'].includes(job.phase)):
     !job||!own||Boolean(job.active&&Date.parse(job.recovery_at)>Date.now())||action==='once'&&['scan','reconcile','retry'].includes(job.phase));
  }
  root.querySelectorAll('[name=batch-source],[data-batch-provider]').forEach(n=>n.disabled=busy||driving||!state.can_create||!state.can_edit);
  const body=root.querySelector('[data-batch-recent]');body.replaceChildren();
  for(const item of job?.recent||[]){
   const tr=document.createElement('tr');
   for(const text of [`${names[item.table]||item.table} / ${item.field_label||item.field}`,statuses[item.status]||item.status,item.message]){const td=document.createElement('td');td.textContent=text;td.title=text;tr.append(td)}
   const td=document.createElement('td');if(state.can_edit){const a=document.createElement('a');a.href='/admin/translation_cache/'+encodeURIComponent(item.uid)+'/edit';a.textContent='编辑';a.className='btn btn-outline-primary btn-sm';a.title='查看原文和人工修订译文';td.append(a)}tr.append(td);body.append(tr);
  }
  if(!body.children.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent=job&&!own?'当前由其他账号控制；不显示来源详情。':'暂无处理结果';tr.append(td);body.append(tr)}
 }
 /** Ignore delayed responses older than the displayed revision of the same job. */
 function apply(data){if(state.job&&data.job&&state.job.id===data.job.id&&state.job.rev>data.job.rev)return;state=data;render()}
 async function refresh(){const response=await adminFetch('/api/assistance/translation-batch/status',{headers:{Accept:'application/json'}});const data=await response.json();if(!response.ok)throw Error(data.error||'无法读取进度');apply(data)}
 const call=(operation,data)=>assist('translation-batch/'+operation,data,{csrf:root.dataset.csrf});
 /** Pace one bounded group at a time; a server retry deadline stops all further provider requests meanwhile. */
 async function drive(){
  const mine=++generation;driving=true;render();
  try{
   while(driving&&mine===generation){
    const job=state.job;if(!job?.own||job.paused||['ready','done'].includes(job.phase))break;
    if(job.active&&Date.parse(job.recovery_at)>Date.now()){await refresh();await new Promise(r=>setTimeout(r,1000));continue}
    const wait=job.next_at?Date.parse(job.next_at)-Date.now():0;
    if(wait>0){await new Promise(r=>setTimeout(r,Math.min(wait,1000)));continue}
    busy=true;render();const data=await call('step',{id:job.id,rev:job.rev});apply(data);busy=false;render();
    await new Promise(r=>setTimeout(r,60));
   }
  }catch(error){notify(error.message,'error',{id:'translation-batch'});try{await refresh()}catch{}}
  finally{busy=false;driving=false;render()}
 }
 for(const button of root.querySelectorAll('[data-batch-action]'))button.addEventListener('click',async()=>{
  const action=button.dataset.batchAction;
  if(action==='pause'){driving=false;generation++}
  else if(busy||driving)return;
  const job=state.job;busy=true;render();
  try{
   const payload={action,id:job?.id||'',rev:job?.rev,modules:[...root.querySelectorAll('[name=batch-source]:checked')].map(n=>n.value),provider:root.querySelector('[data-batch-provider]').value};
   // Pause can race a completing step: refresh and retry the same job once, never create a replacement.
   let result;try{result=await call('action',payload)}catch(error){if(action!=='pause')throw error;await refresh();if(state.job?.id!==job.id)throw error;result=await call('action',{action,id:job.id})}
   apply(result);notify(action==='pause'?'已暂停后续调度':'操作已保存','success',{id:'translation-batch'});busy=false;
   if(action!=='pause')await drive();
  }catch(error){notify(error.message,'error',{id:'translation-batch'});try{await refresh()}catch{}}
  finally{busy=false;render()}
 });
 root.querySelector('[data-batch-refresh]').addEventListener('click',()=>refresh().catch(error=>notify(error.message,'error',{id:'translation-batch'})));
 window.addEventListener('pagehide',()=>{driving=false;generation++});
 render();
}
