/** One controller for every native list, including newly rendered panels after a mutation. */
import {mountListHeaders} from './native-table-headers.js?v=0.15.113';
import {mountTableSelection} from './native-table-selection.js?v=0.15.113';
import {requestJSON} from './native-http.js?v=0.16.076';
import {notify,rememberNotice} from './native-notifications.js';

const mounted=new WeakMap();
const listActionControls='[data-order-field],[data-order-save],[data-translate-entry],[data-media-purge],[data-bulk-purge],[data-delete],[data-toggle-field],[data-media-status],[data-bulk-delete],[data-bulk-media],[data-bulk-message],[data-message-bulk-status],[data-media-upload],[data-select-all],[data-select-row],[data-page-size]';

export function mountList(root,transient=null,orderDrafts=new Map()){
 if(!root)return;
 if(mounted.has(root))return mounted.get(root);
 const table=root.querySelector('table'),listeners=new AbortController();
 const on=(node,type,handler)=>node?.addEventListener(type,handler,{signal:listeners.signal});
 const headers=mountListHeaders(root),cleanups=[];
 let columns={snapshot:()=>transient,dispose(){}},disposed=false;
 let busy=false,stale=false,refreshing=false,writeFocus=null;
 const mutationSelector='[data-order-field],[data-order-save],[data-translate-entry],[data-media-purge],[data-bulk-purge],[data-delete],[data-toggle-field],[data-media-status],[data-bulk-delete],[data-bulk-media],[data-bulk-message],[data-message-bulk-status],[data-media-upload]';
 const selected=mountTableSelection(root),chosen=selected.chosen,selection=selected.paint;cleanups.push(selected.dispose);
 on(root.querySelector('[data-page-size]'),'change',event=>{const url=new URL(location.href);url.searchParams.set('size',event.target.value);url.searchParams.delete('page');location.assign(url)});

 function dispose(){
  // Remove document listeners and observers owned by a replaced panel before mounting another.
  if(disposed)return;disposed=true;mounted.delete(root);
  headers.dispose();listeners.abort();columns.dispose();
  for(const cleanup of cleanups)try{cleanup()}catch(error){console.error('列表附加功能清理失败',error)}
 }
 async function refresh(){
  // Read the same URL through the shared template; only the panel, never the workspace, is replaced.
  if(refreshing||!root.isConnected)return false;refreshing=true;root.dataset.mediaUsageStopped='true';root.dispatchEvent(new Event('native-list-loading'));
  const expectedURL=location.href,host=document.querySelector('[data-notifications]');
  try{
   const result=await requestJSON(expectedURL,{headers:{'X-Native-List':'1'}});
   if(location.href!==expectedURL||!root.isConnected)return false;
   if(result.owner!==host.dataset.owner||result.session!==host.dataset.session)throw Error('登录身份已变化，请重新打开后台');
   const template=document.createElement('template');template.innerHTML=result.html;
   const next=template.content.firstElementChild,url=new URL(result.url,location.origin);
   if(next?.dataset.table!==root.dataset.table||next.dataset.nav!==root.dataset.nav||url.origin!==location.origin)throw Error('列表返回内容不一致，请重新打开该入口');
   const scroll=root.querySelector('.native-table-scroll'),main=root.closest('.workspace-content');
   const x=scroll.scrollLeft,y=main.scrollTop,selected=new Set(chosen().map(row=>row.dataset.uid));
   const preference=columns.snapshot(),draft=root.querySelector('#search').value;
   const focused=document.activeElement===document.body&&writeFocus?writeFocus:document.activeElement,focusUid=focused?.closest('tr[data-uid]')?.dataset.uid;
   const focusKind=focused?.matches?.('[data-order-field],[data-order-save]')?'[data-order-field]':focused?.matches?.('[data-toggle-field]')?'[data-toggle-field="'+focused.dataset.toggleField+'"]':focused?.matches?.('[data-delete]')?'[data-delete]':focused?.matches?.('[data-media-status]')?'[data-media-status]':null;
   history.replaceState(history.state,'',url.pathname+url.search+location.hash);
   dispose();root.replaceWith(next);mountList(next,preference,orderDrafts);
   next.querySelector('#search').value=draft;
   for(const row of next.querySelectorAll('tr[data-uid]'))row.querySelector('[data-select-row]').checked=selected.has(row.dataset.uid);
   next.querySelector('[data-select-row]')?.dispatchEvent(new Event('change'));
   // Focus only follows controls from the replaced panel, leaving sidebar/notice readers undisturbed.
   if(root.contains(focused)){
    const row=[...next.querySelectorAll('tr[data-uid]')].find(item=>item.dataset.uid===focusUid);
    (focusKind&&row?.querySelector(focusKind)||next.querySelector('#search')).focus({preventScroll:true});
   }
   main.scrollTop=y;next.querySelector('.native-table-scroll').scrollLeft=x;
   next.dispatchEvent(new CustomEvent('native-list-refreshed',{bubbles:true}));return true;
  }finally{refreshing=false}
 }
 function failedRefresh(summary,error){
  // A successful write must not be labelled failed or retried when only the follow-up read failed.
  stale=true;root.dataset.listStale='true';root.querySelectorAll(mutationSelector).forEach(button=>button.disabled=true);
  notify(summary+'；列表未能刷新：'+error.message+'。请刷新列表核对，写操作不会自动重试。','warning',{id:'list-operation',duration:0,action:{label:'刷新列表',title:'只重新读取列表，不重复保存、删除或上传',run:async()=>{
   try{if(await refresh())notify('列表已刷新，请核对操作结果','info',{id:'list-operation'})}catch(next){failedRefresh(summary,next)}
  }}});
 }
 async function finish(summary,state='success'){
  // Deletes, filtered/sorted toggles, uploads and batches refresh pagination and totals together.
  try{if(await refresh())notify(summary,state,{id:'list-operation'})}catch(error){failedRefresh(summary,error)}
 }
 function patch(row,saved){
  // Use server-confirmed values and raw timestamps for the next CAS; display uses its shared formatter.
  if(!saved||saved.uid!==row.dataset.uid||!['0','1'].includes(String(saved.value)))return false;
  const button=[...row.querySelectorAll('[data-toggle-field]')].find(item=>item.dataset.toggleField===saved.field);
  if(!button)return false;
  const enabled=Number(saved.value)===1;row.dataset.stamp=saved.updated_at;
  button.dataset.value=enabled?'0':'1';button.setAttribute('aria-pressed',String(enabled));
  button.textContent=enabled?'✓ 开':'○ 关';button.title=saved.label+'：点击'+(enabled?'关闭':'开启');
  const date=row.querySelector('[data-column="updated_at"] .native-cell');
  if(date){date.textContent=saved.updated_at_display;date.title=saved.updated_at_display}
  return true;
 }
 async function mutate(row,data){
  // All modules keep using the existing per-record CSRF, scope, navigation and timestamp checks.
  return requestJSON(`/api/admin/${root.dataset.table}/${encodeURIComponent(row.dataset.uid)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_csrf:root.dataset.csrf,stamp:row.dataset.stamp,nav:root.dataset.nav,nav_stamp:root.dataset.navStamp,...data})});
 }
 async function perform(work){
  // Serialize list writes and restore each pre-existing disabled state when a request is rejected.
  if(busy||stale)return;busy=true;writeFocus=document.activeElement;root.setAttribute('aria-busy','true');
  const buttons=[...root.querySelectorAll(mutationSelector+', [data-select-row], [data-select-all]')].map(button=>[button,button.disabled]);
  buttons.forEach(([button])=>button.disabled=true);
  try{await work()}catch(error){
   if(error.uncertain)await finish('请求结果不确定，请核对列表后再决定是否重试：'+error.message,'warning');
   else notify(error.message,'error',{id:'list-operation'});
  }finally{
   busy=false;root.removeAttribute('aria-busy');
   buttons.forEach(([button,disabled])=>{if(!stale||!button.matches(mutationSelector))button.disabled=disabled});
   if(!stale&&writeFocus?.isConnected&&document.activeElement===document.body)writeFocus.focus({preventScroll:true});
   writeFocus=null;
  }
 }
 function orderKey(input){return input.closest('tr').dataset.uid+':'+input.dataset.orderField;}
 function orderChanged(input){return !/^-?[0-9]+$/.test(input.value)||Number(input.value)!==Number(input.dataset.orderSaved);}
 function paintOrder(input){input.closest('.native-order-cell').querySelector('[data-order-save]').hidden=!orderChanged(input);}
 on(root,'input',event=>{
  const input=event.target.closest('[data-order-field]');if(!input)return;
  paintOrder(input);const key=orderKey(input);
  if(orderChanged(input))orderDrafts.set(key,{value:input.value,saved:input.dataset.orderSaved,stamp:input.dataset.orderStamp||input.closest('tr').dataset.stamp});
  else{orderDrafts.delete(key);delete input.dataset.orderStamp;}
 });
 function saveOrder(input){
  if(busy||stale||!orderChanged(input))return;
  if(!/^-?[0-9]+$/.test(input.value)||!Number.isSafeInteger(Number(input.value))||!input.reportValidity()){
   notify('排序值必须为允许范围内的整数','error',{id:'list-operation'});input.focus();return;
  }
  const row=input.closest('tr'),value=input.value,key=orderKey(input),draft=orderDrafts.get(key);
  perform(async()=>{
   notify('正在保存排序…','progress',{id:'list-operation'});
   const result=await mutate(row,{action:'order',field:input.dataset.orderField,value,stamp:draft?.stamp||row.dataset.stamp});
   // A confirmed write must never be retried because its following list read failed.
   if(result.row){row.dataset.stamp=result.row.updated_at;input.value=String(result.row.value);input.dataset.orderSaved=input.value;}
   orderDrafts.delete(key);paintOrder(input);
   await finish('排序已保存'+(root.dataset.table==='navigation_items'?'；导航栏在完整刷新页面后同步':''));
   if(!root.isConnected&&![...document.querySelectorAll('.native-list tr[data-uid]')].some(item=>item.dataset.uid===row.dataset.uid))notify('排序已保存；该条目已移出当前页或不再符合当前筛选','success',{id:'list-operation'});
  });
 }
 on(root,'keydown',event=>{
  const input=event.target.closest('[data-order-field]');if(!input||busy||stale||event.isComposing)return;
  if(event.key==='Enter'){event.preventDefault();saveOrder(input);}
  if(event.key==='Escape'){event.preventDefault();input.value=input.dataset.orderSaved;orderDrafts.delete(orderKey(input));delete input.dataset.orderStamp;paintOrder(input);}
 });
 on(root,'click',event=>{const button=event.target.closest('[data-order-save]');if(button)saveOrder(button.closest('.native-order-cell').querySelector('[data-order-field]'));});
 on(root,'click',event=>{
  const button=event.target.closest('[data-translate-entry],[data-media-purge],[data-bulk-purge],[data-delete],[data-toggle-field],[data-media-status]');if(!button||busy||stale)return;
  if(button.hasAttribute('data-translate-entry')){
   if(!confirm('翻译当前词条？优先复用有效译文；需要联网时会把此条已保存原文发送给默认翻译服务，不覆盖人工译文。'))return;
   perform(async()=>{notify('正在翻译当前词条…','progress',{id:'list-operation'});const row=button.closest('tr');const result=await requestJSON('/api/assistance/translation-groups/'+encodeURIComponent(row.dataset.uid)+'/translate'+location.search,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_csrf:root.dataset.csrf,target_uid:button.dataset.translationUid,stamp:button.dataset.translationStamp,nav_stamp:root.dataset.navStamp})},120000);await finish(result.status==='success'?(result.reused?'已复用有效译文':'当前词条翻译完成'):'翻译未成功，请进入编辑查看原因',result.status==='success'?'success':'warning')});return;
  }
  if(button.hasAttribute('data-media-purge')){purge([button.closest('tr')]);return}
  if(button.hasAttribute('data-bulk-purge'))return;
  const data=button.hasAttribute('data-delete')?{action:'delete'}:button.dataset.mediaStatus?{action:'status',value:button.dataset.mediaStatus}:{action:'toggle',field:button.dataset.toggleField,value:Number(button.dataset.value)};
  if(data.action==='delete'&&!confirm(root.dataset.deleteConfirm||'确认删除此条目？'))return;
  perform(async()=>{
   notify(data.action==='delete'?'正在删除…':'正在保存…','progress',{id:'list-operation'});
   const row=button.closest('tr'),result=await mutate(row,data),summary=data.action==='delete'?'已删除':data.action==='status'?(data.value==='trash'?'已移入回收站':'已恢复'):'已保存';
   if(result.redirect||result.reload){rememberNotice(summary,'success',result.redirect||location.href);location.assign(result.redirect||location.href);return}
   const query=new URL(location.href).searchParams;
   // Re-read when query ordering/range might change; a plain toggle keeps the exact existing row DOM.
   const affectsQuery=[...query.keys()].some(key=>key==='q'||key==='sort'||key.startsWith('f.')||key.startsWith('c.'))||!!root.dataset.nav;
   if(data.action==='toggle'&&patch(row,result.row)&&!affectsQuery)notify(summary,'success',{id:'list-operation'});
   else await finish(summary);
  });
 });
 async function purge(rows){
  if(!rows.length){notify('请先选择条目','info',{id:'list-operation'});return}
  await perform(async()=>{
   const plans=[];
   for(const row of rows){
    notify(`正在预检 ${plans.length+1}/${rows.length} 项…`,'progress',{id:'list-operation'});
    plans.push(await mutate(row,{action:'purge-prepare'}));
   }
   const detail=plans.map(p=>`${p.name} — ${p.mode}（${(p.size/1024).toFixed(3)} KB）`).join('\n');
   if(!confirm(`永久删除 ${plans.length} 项？此操作不可撤销。手动删除不受保留期限制。\n${detail}`)){notify('已取消永久删除','info',{id:'list-operation'});return}
   let completed=0,failure=null;
   for(let i=0;i<rows.length;i++){
    notify(`正在永久删除 ${i+1}/${rows.length} 项…`,'progress',{id:'list-operation'});
    try{await mutate(rows[i],{action:'purge',token:plans[i].token});completed++;rows[i].querySelector('[data-select-row]').checked=false}
    catch(error){failure=error;break}
   }
   selection();
   await finish(`永久删除成功 ${completed} 项 · ${failure?.uncertain?'待核对':'失败'} ${failure?1:0} 项 · 未处理 ${rows.length-completed-(failure?1:0)} 项`+(failure?'；'+failure.message:''),failure?'warning':'success');
  });
 }
 on(root.querySelector('[data-bulk-purge]'),'click',()=>purge(chosen()));
 async function batch(button){
  // Process sequentially, stop at the first failed attempt, and report successes plus untouched records.
  if(busy||stale)return;const rows=chosen(),message=button.hasAttribute('data-bulk-message'),status=message?root.querySelector('[data-message-bulk-status]').value:button.dataset.bulkMedia;
  if(!rows.length){notify('请先选择条目','info',{id:'list-operation'});return}
  if(message&&!confirm(`将已选 ${rows.length} 条留言标记为“${root.querySelector('[data-message-bulk-status]').selectedOptions[0].textContent}”？不会发送邮件。`))return;
  if(!message&&(!status||status==='trash')&&!confirm(`${status?'回收':'删除'}已选 ${rows.length} 条？${!status&&root.dataset.deleteConfirm?'\n'+root.dataset.deleteConfirm:''}`))return;
  await perform(async()=>{
   let completed=0,failure=null;
   for(const row of rows){
    notify(`正在处理 ${completed+1}/${rows.length} 项…`,'progress',{id:'list-operation'});
    try{await mutate(row,message?{action:'message-status',value:status}:status?{action:'status',value:status}:{action:'delete'});completed++;row.querySelector('[data-select-row]').checked=false}
    catch(error){failure=error;break}
   }
   selection();const failed=failure?1:0;
   const summary=`成功 ${completed} 项 · ${failure?.uncertain?'结果待核对':'失败'} ${failed} 项 · 未处理 ${rows.length-completed-failed} 项`+(failure?'；'+failure.message:'');
   await finish(summary,failure?'error':'success');
  });
 }
 on(root.querySelector('[data-bulk-delete]'),'click',event=>batch(event.currentTarget));
 on(root.querySelector('[data-bulk-message]'),'click',event=>batch(event.currentTarget));
 on(root.querySelector('[data-bulk-media]'),'click',event=>batch(event.currentTarget));
 on(root.querySelector('[data-media-upload]'),'click',()=>{
  const file=root.querySelector('[data-media-file]').files[0];
  if(!file){notify('请先选择要上传的文件','info',{id:'list-operation'});return}
  perform(async()=>{
   notify('正在上传…','progress',{id:'list-operation'});
   await requestJSON('/api/admin/media/upload/file',{method:'POST',headers:{'X-CSRF-Token':root.dataset.csrf,'X-Filename':encodeURIComponent(file.name)},body:file},60000);
   await finish('文件已上传');
  });
 });
 selection();mounted.set(root,dispose);root.dataset.listReady='true';
 root.querySelectorAll(listActionControls).forEach(control=>control.disabled=false);
 for(const input of root.querySelectorAll('[data-order-field]')){const draft=orderDrafts.get(orderKey(input));if(draft){input.value=draft.value;input.dataset.orderStamp=draft.stamp;}paintOrder(input);}
 const status=root.querySelector('[data-list-load-status]');if(status)status.hidden=true;
 const groupExport=root.querySelector('[data-export-groups]');if(groupExport)groupExport.disabled=true;
 // Optional enhancements load separately and only for their own markup. No rejection
 // propagates into the action controller; late results cannot mount onto a removed panel.
 const enhancements=[
  ['列设置','./native-columns.js?v=0.15.113','[data-column-controls]',m=>{columns=m.setupColumns(root,table,transient)}],
  ['操作列布局','./native-table-layout.js','.native-actions',m=>m.observeActionColumn(table)],
  ['媒体使用位置','./native-media-locations.js?v=0.16.076','[data-media-locations]',m=>m.setupMediaLocations(root)],
  ['媒体预览','./native-media.js?v=0.15.113','[data-media-thumb],[data-media-large]',m=>{m.setupMediaPreviews(root);return ()=>m.clearMediaPreviews(root)}],
  ['翻译组导出','./native-translation-groups.js?v=0.15.29','[data-export-groups]',m=>{const cleanup=m.setupTranslationGroups(root);root.querySelector('[data-export-groups]').disabled=false;return cleanup}],
  ['日志导出','./native-message-logs.js','[data-log-export]',m=>m.setupLogExport(root)]
 ];
 (async()=>{
  for(const [label,file,selector,mount] of enhancements){
   if(disposed||!root.isConnected)return;
   if(!root.querySelector(selector))continue;
   try{const module=await import(file);if(disposed||!root.isConnected)return;const cleanup=mount(module);if(typeof cleanup==='function')cleanups.push(cleanup)}
   catch(error){
    if(disposed||!root.isConnected)return;
    const note=document.createElement('p');note.className='native-feedback';note.dataset.listFeatureFailure=label;note.setAttribute('role','alert');
    note.textContent=label+'未能加载；表头筛选、排序和普通搜索仍可使用。重新打开页面可再次加载。';
    (root.querySelector('[data-list-load-status]')||root.querySelector('.native-title')).after(note);
    console.error(label+'加载失败',error);
   }
  }
 })();
 return dispose;
}
