import {adminFetch} from './native-access.js?v=0.15.28';
/** Bounded scan and explicit preflight/commit. A failed batch reports partial success and stops. */
import {observeActionColumn} from './native-table-layout.js';
const root=document.querySelector('#media-audit');
if(root){
 const feedback=root.querySelector('[data-audit-feedback]'),progress=root.querySelector('[data-audit-progress]'),scan=root.querySelector('[data-audit-scan]'),pause=root.querySelector('[data-audit-pause]'),dialog=root.querySelector('[data-audit-dialog]'),confirm=root.querySelector('[data-audit-confirm]'),cancel=root.querySelector('[data-audit-cancel]'),confirmFeedback=root.querySelector('[data-audit-confirm-feedback]');let busy=false,stopping=false,plans=[],kind='';
 root.querySelectorAll('table').forEach(observeActionColumn);
 async function api(action,values={}){
  const response=await adminFetch('/api/admin/media-audit/actions/run',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':root.dataset.csrf},body:JSON.stringify({action,report:root.dataset.report,...values})});
  let result;try{result=await response.json()}catch{throw Error('服务器未返回有效结果，请刷新核对状态')}
  if(!response.ok)throw Error(result.error||'操作未完成');return result;
 }
 function state(s){root.dataset.report=s.id;root.dataset.version=s.version;root.dataset.phase=s.phase;progress.textContent=`${s.phase==='done'?'扫描完成':'扫描中'} · 已检查登记 ${s.registry_checked} 条，目录条目 ${s.objects_checked} 项`}
 async function ensureReport(){if(!root.dataset.report)state(await api('start'))}
 // While scanning, each request is a bounded batch. Pause/close does not roll back finished batches.
 scan.addEventListener('click',async()=>{
  if(busy)return;busy=true;stopping=false;scan.disabled=true;pause.hidden=false;feedback.textContent='正在扫描，可暂停后查看已完成的报告。';
  try{await ensureReport();while(root.dataset.phase!=='done'&&!stopping)state(await api('step',{version:Number(root.dataset.version)}));location.reload()}
  catch(error){feedback.textContent=error.message+'；可刷新查看已保存进度。'}finally{busy=false;scan.disabled=false;pause.hidden=true}
 });
 pause.addEventListener('click',()=>{stopping=true;feedback.textContent='本批结束后暂停…'});
 root.querySelector('[data-audit-clear]')?.addEventListener('click',async()=>{
  if(busy||!window.confirm('清除当前报告及其预检缓存？媒体文件和登记保持不变。'))return;busy=true;
  try{let result;do{result=await api('clear')}while(!result.done);location.reload()}catch(error){feedback.textContent=error.message}finally{busy=false}
 });
 root.querySelectorAll('[data-audit-select-all]').forEach(control=>control.addEventListener('change',()=>{root.querySelectorAll(`[data-audit-select="${control.dataset.auditSelectAll}"]`).forEach(box=>box.checked=control.checked)}));
 root.querySelectorAll('[data-audit-recheck]').forEach(button=>button.addEventListener('click',async()=>{
  if(busy)return;busy=true;button.disabled=true;const row=button.closest('tr');
  try{const result=await api('recheck',{page:Number(row.dataset.reportPage),index:Number(row.dataset.reportIndex)});const labels={matched:'已匹配',missing:'登记但缺失',unregistered:'存在但未收录',changed:'大小有变化',unsupported:'无法处理',pending:'清理待重试'};row.querySelector('[data-audit-row-state]').textContent='最新核对：'+labels[result.category];feedback.textContent=result.note||'复核完成；分类统计仍对应原扫描报告。'}catch(error){feedback.textContent=error.message}finally{busy=false;button.disabled=false}
 }));
 root.querySelectorAll('[data-audit-prepare]').forEach(button=>button.addEventListener('click',async()=>{
  if(busy)return;kind=button.dataset.auditPrepare;const selected=[...root.querySelectorAll(`[data-audit-select="${kind}"]:checked`)].map(box=>box.closest('tr'));
  if(!selected.length||selected.length>10){feedback.textContent='请选择1至10项进行预检。';return}
  busy=true;button.disabled=true;plans=[];feedback.textContent='正在预检；尚未更改媒体。';
  try{
   await ensureReport();for(const row of selected)plans.push(await api('prepare_'+kind,kind==='import'?{page:Number(row.dataset.reportPage),index:Number(row.dataset.reportIndex)}:{uid:row.dataset.uid,stamp:row.dataset.stamp}));
   root.querySelector('[data-audit-plans]').replaceChildren(...plans.map(p=>{const item=document.createElement('li');item.textContent=kind==='import'?(p.mode==='copy'?`${p.source} → ${p.target}：创建规范名称副本并登记，原文件保留`:`${p.source}：原地登记，不移动文件`):`${p.source}：${p.mode}`;return item}));
   root.querySelector('[data-audit-warning]').textContent=kind==='purge'?'永久删除后无法恢复。提交时再次检查引用、保留期和文件版本；遇到失败立即停止。':'确认后将这些文件加入媒体库。提交时重新验证文件内容、权限和容量。';
   confirm.textContent=kind==='purge'?'确认永久删除 '+plans.length+' 项':'确认收录 '+plans.length+' 项';confirm.className='btn btn-sm '+(kind==='purge'?'btn-danger':'btn-primary');confirm.disabled=false;confirmFeedback.textContent='';cancel.textContent='取消';dialog.showModal();cancel.focus();feedback.textContent='预检完成，请核对操作内容。';
  }catch(error){feedback.textContent='预检未全部通过，未提交任何更改：'+error.message}finally{busy=false;button.disabled=false}
 }));
 cancel.addEventListener('click',()=>{if(!busy)dialog.close()});dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
 confirm.addEventListener('click',async()=>{
  if(busy)return;busy=true;confirm.disabled=true;cancel.disabled=true;let completed=0;
  try{for(const p of plans){await api('commit_'+kind,{token:p.token});completed++;confirmFeedback.textContent=`已完成 ${completed} / ${plans.length} 项`};location.reload()}
  catch(error){confirmFeedback.textContent=`已完成 ${completed} / ${plans.length} 项，后续已停止：${error.message}。关闭后刷新页面，再预检重试。`;feedback.textContent=confirmFeedback.textContent;cancel.textContent='关闭'}finally{busy=false;cancel.disabled=false}
 });
}
