import {adminFetch} from './native-access.js?v=0.15.28';
import {notify} from './native-notifications.js';
const root=document.querySelector('#site-sync');
if(root){
 const q=s=>root.querySelector(s),status=q('#sync-status'),labels={add:'新增',update:'更新',delete:'删除'};
 // One explicit display zone for every sync view; persisted deadlines stay UTC.
 let displayZone='Asia/Shanghai';
 try{const saved=localStorage.getItem('teacher-admin-timezone-v1');if(saved){new Intl.DateTimeFormat('zh-CN',{timeZone:saved}).format();displayZone=saved}}catch{}
 const timeFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:displayZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'});
 function localTime(value){if(!value||!Number.isFinite(Date.parse(value)))return '—';const p=Object.fromEntries(timeFormat.formatToParts(new Date(value)).map(v=>[v.type,v.value]));return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName} [${displayZone}]`;}
 for(const option of q('#sync-history').options)if(option.dataset.createdAt)option.textContent=localTime(option.dataset.createdAt)+' · '+option.dataset.status+' · ID: '+option.value;

 let uid='',items=[],selected=new Set(),requested=new Set(),automatic=new Set(),page=1,busy=false,pause=false,execution=null,direction='',approval=null,outgoing=null,pending=null;
 let manualActive=false;
 let taskReady=false,lightweight=false,prepared=false,nextCursor=null,cursors=[['','']],candidateCount=0;
 const intervalMs=Number(root.dataset.intervalMs)||0;let nextBatchAt=0;
 const paced=new Set(['advance','pull-begin','proposal-approve','pull-tick','proposal-send','history-delete']);
 function checkpoint(value){const target=q('#sync-checkpoint'),w=value?.work;if(!target||!w)return;target.textContent=`任务 ID: ${value.uid||uid||'—'} · 阶段：${w.phase||w.operation||'准备'} · 已保存步骤 ${w.completed_steps||0} · 已读 ${w.count||0} 条${w.resource_level?' · 资源降速 '+w.resource_level+' 档':''}${Number.isFinite(w.elapsed_ms)?' · 最近步骤耗时 '+w.elapsed_ms+' ms':''}${w.completed_at?' · 最近保存 '+localTime(w.completed_at):''}${w.status==='running'?' · 上次步骤尚未确认完成；可稍后打开原任务继续':''}${w.retry_after?' · 下次可重试 '+localTime(w.retry_after):''}${w.error?' · '+w.error:''}`;}
 function rayText(response,value={}){
  const ray=response.headers?.get?.('cf-ray')||value.ray_id||value.instance||'';
  return typeof ray==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(ray)?'；本站响应Ray ID：'+ray:'';
 }
 async function request(action,data={}){
  if(paced.has(action)){const wait=Math.max(0,nextBatchAt-Date.now());if(wait)await waitFor(wait);if(pause)throw new DOMException('已暂停后续批次；进度已保存，可继续原任务。','AbortError');}
  const response=await adminFetch('/api/admin/site-sync/'+action,{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json','X-CSRF-Token':root.dataset.csrf},body:JSON.stringify(data)});
  if(paced.has(action))nextBatchAt=Date.now()+intervalMs;
  let result;try{result=await response.json()}catch{throw Object.assign(Error('本站接口 HTTP '+response.status+'；阶段：'+action+'；响应不是有效JSON，请检查本站服务或代理日志。'+rayText(response)),{httpStatus:response.status})}
  if(!response.ok){
   const value=result&&typeof result==='object'?result:{};
   const messages=[value.error?.message,value.error,value.title,value.detail?.message,value.detail,value.message]
    .filter(v=>typeof v==='string'&&v.trim()).map(v=>v.slice(0,800));
   if(Array.isArray(value.detail))messages.push('请求参数校验失败，请刷新页面后重试');
   const code=value.code||value.error_code;
   throw Object.assign(Error('本站接口 HTTP '+response.status+'；阶段：'+action+'；'+([...new Set(messages)].join('；')||'未提供错误详情，请检查本站日志')+
    (typeof code==='string'||typeof code==='number'?'；错误码：'+String(code).slice(0,80):'')+rayText(response,value)),{httpStatus:response.status,code});
  }
  if(paced.has(action)&&Number.isFinite(result.request_interval_ms))nextBatchAt=Date.now()+Math.max(intervalMs,Math.min(60000,result.request_interval_ms));
  checkpoint(result);return result;
 }
 const retrySeconds=JSON.parse(root.dataset.retrySeconds||'[60,180,600]');
 const retryLimit=Number(root.dataset.retryLimit)||retrySeconds.length;
 const retryCodes=new Set(JSON.parse(root.dataset.retryCodes||'[]'));
 async function waitFor(ms){const end=Date.now()+ms;while(Date.now()<end){if(pause)throw new DOMException('已暂停后续批次；进度已保存。','AbortError');await new Promise(resolve=>setTimeout(resolve,Math.min(250,end-Date.now())))}}
 async function api(action,data={}){
  let stalled=0,lastCheckpoint=null;
  for(let attempt=0;;attempt++){
   try{return await request(action,data)}catch(e){
    const retryable=e instanceof TypeError||retryCodes.has(e.code)||['1101','1102'].includes(String(e.code))||e.code==='sync_retry_wait'||(!e.code&&[429,502,503,504].includes(e.httpStatus));
    if(!paced.has(action)||!retryable||pause)throw e;
    let delay=retrySeconds[Math.min(stalled,retrySeconds.length-1)]*1000,limit=retryLimit;
    let progressed=false;
    // Read once, then wait locally. Do not poll the server during its cooldown.
    if(data.uid){
     const saved=await request('get',{uid:data.uid});checkpoint(saved);if(saved.execution)report(saved);
     const w=saved.work||{};
     if(Number.isInteger(saved.policy?.no_progress_retry_limit))limit=saved.policy.no_progress_retry_limit;
     if(w.checkpoint){progressed=lastCheckpoint!==null?lastCheckpoint!==w.checkpoint:(w.status==='paused'&&w.retry_count===0&&w.last_outcome==='progress_after_error');lastCheckpoint=w.checkpoint;}
     if(w.status==='paused'&&w.retryable===false)throw e;
     if(progressed)delay=retrySeconds[0]*1000;
     const deadline=Date.parse(w.status==='running'?w.recover_after:w.retry_after);
     if(Number.isFinite(deadline))delay=Math.max(delay,deadline-Date.now());
    }
    stalled=progressed?0:stalled+1;
    if(stalled>limit){if(manualActive)throw new Error(e.message+'；浏览器重试已暂停，本任务后台将按保存进度继续低频重试。');throw e;}
    status.textContent=`${e.message}；${Math.ceil(delay/1000)}秒后恢复尝试 ${attempt+1}（连续无进展 ${stalled}/${limit}），可点击暂停。`;
    notify(status.textContent,'info',{id:'site-sync'});await waitFor(delay);
   }
  }
 }
 async function run(fn){if(busy)return;busy=true;notify('正在处理同步操作…','progress',{id:'site-sync'});root.querySelectorAll('button').forEach(b=>b.disabled=true);q('#sync-pause').disabled=false;try{await fn();notify(status.textContent,/完成|通过|已保存|已送达|已拒绝/.test(status.textContent)?'success':'info',{id:'site-sync'})}catch(e){const message=e instanceof TypeError?'浏览器无法连接本站接口；请检查网络并刷新任务核对进度。':e.message;status.textContent=message;notify(message,e.name==='AbortError'?'info':'error',{id:'site-sync'});status.scrollIntoView?.({block:'nearest',behavior:'smooth'})}finally{busy=false;root.querySelectorAll('button').forEach(b=>b.disabled=false);q('#sync-pause').disabled=!manualActive;draw();monitorControls()}}
 function filtered(){if(lightweight)return items;const term=q('#sync-search').value.trim().toLowerCase(),action=q('#sync-action').value,sort=q('#sync-sort').value,field=sort.replace('-','');return items.filter(x=>(x.in_scope||selected.has(x.id))&&(!action||x.action===action)&&(!term||[x.title,x.table,x.module_label,x.uid].join(' ').toLowerCase().includes(term))).sort((a,b)=>String(a[field]).localeCompare(String(b[field]))*(sort.startsWith('-')?-1:1))}
 function cell(row,value){const td=document.createElement('td');td.textContent=value;row.append(td);return td}
 function draw(){
  const rows=filtered(),pages=lightweight?page+(nextCursor?1:0):Math.max(1,Math.ceil(rows.length/20));page=Math.min(page,pages);q('#sync-rows').replaceChildren();
  for(const item of (lightweight?rows:rows.slice((page-1)*20,page*20))){
   const tr=document.createElement('tr'),td=cell(tr,''),box=document.createElement('input');box.type='checkbox';box.checked=selected.has(item.id);box.disabled=busy||(prepared&&!approval)||!!execution||automatic.has(item.id);box.setAttribute('aria-label','选择 '+item.title);box.addEventListener('change',()=>run(async()=>{box.checked?requested.add(item.id):requested.delete(item.id);await choose()}));td.append(box);
   cell(tr,item.module_label+' / '+item.title);cell(tr,lightweight&&item.action==='update'?'覆盖候选':labels[item.action]);cell(tr,prepared?'按已准备版本覆盖':lightweight?'准备时再读取正文':item.fields.join('、'));
   cell(tr,[automatic.has(item.id)?'自动选择的前置依赖':'',...item.dependencies.map(d=>'依赖 '+(items.find(x=>x.id===d)?.title||d)),...item.blocked,...(item.media_check?['媒体原文件待传输阶段校验']:[])].filter(Boolean).join('；'));q('#sync-rows').append(tr);
  }
  q('#sync-page').textContent=lightweight?`第 ${page} 页 · 本页 ${rows.length} 项 · 未筛选候选总数 ${candidateCount}`:`${page} / ${pages} · ${rows.length} 项`;q('#sync-prev').disabled=busy||page===1;q('#sync-next').disabled=busy||page===pages;
  q('#sync-all').disabled=busy||(prepared&&!approval)||!!execution;q('#sync-none').disabled=busy||(prepared&&!approval)||!!execution;
  q('#sync-begin').disabled=busy||!taskReady||(lightweight&&!prepared)||!!execution||(!selected.size&&(!approval||items.length>0));q('#sync-confirm').disabled=!!execution;
  const active=execution&&!['done','cancelled'].includes(execution.phase);q('#sync-restart').disabled=busy||!uid||!!approval;q('#sync-continue').disabled=busy||!active;q('#sync-cancel').disabled=busy||!active;
  q('#sync-send').disabled=busy||!taskReady||(lightweight&&!prepared)||!selected.size;q('#sync-prepare').hidden=!lightweight||prepared;q('#sync-prepare').disabled=busy||!selected.size;q('#sync-sort').disabled=busy||lightweight;q('#sync-receipt').disabled=busy||!outgoing;
  q('#sync-review').disabled=busy||pending?.status!=='pending';q('#sync-reject').disabled=busy||pending?.status!=='pending';
 }
 async function choose(){const s=await api('select',{uid,ids:[...requested]});selected=new Set(s.selected);automatic=new Set(s.automatic);q('#sync-selection').textContent=`已选择 ${selected.size} 项，其中依赖 ${automatic.size} 项；存在阻止原因 ${Object.keys(s.blocked).length} 项。仅保存预览。`;draw()}
 function show(result){manualActive=!!result.continuation?.enabled;taskReady=result.status==='ready';lightweight=!!result.lightweight;prepared=!!result.prepared;if(lightweight){q('#sync-sort').value='table';q('#sync-search').value='';q('#sync-action').value=''}nextCursor=result.next||null;candidateCount=result.candidate_count||0;cursors=[['','']];page=1;approval=result.approval||null;outgoing=result.outgoing||null;execution=result.execution||null;direction=result.direction;items=result.items||[];const s=result.selection||{};selected=new Set(s.selected||[]);automatic=new Set(s.automatic||[]);requested=new Set([...selected].filter(k=>!automatic.has(k)));q('#sync-result').hidden=false;q('#sync-direction').textContent=result.direction==='pull'?'对端 → 本站：差异清单':'本站 → 对端：差异清单';q('#sync-selection').textContent=`已保存选择 ${selected.size} 项；依赖 ${automatic.size} 项。`;status.textContent=execution?'已打开保存的实际同步任务。':prepared?'所选记录及依赖已准备。相同内容也会覆盖；请核对后确认逐条执行，已完成条目不会整体回滚。':lightweight?'简要候选已生成：相同编号列为覆盖候选，未比较正文。请选择条目，再准备执行数据；此过程不写入业务内容。':'执行数据准备完成，请核对实际差异及自动加入的依赖，然后确认；没有执行业务数据或媒体增删。';q('#sync-execution').hidden=(lightweight&&!prepared)||direction!=='pull';q('#sync-outgoing').hidden=(lightweight&&!prepared)||direction!=='push';q('#sync-confirm').placeholder=approval?'输入：同意对端推送':'输入：从对端同步到本站';q('#sync-confirm').value='';q('#sync-begin').textContent=approval?'同意并执行最新差异':'确认并开始拉取';if(approval&&!execution)status.textContent=prepared?'提案条目及依赖已逐条准备，可勾选后批准。相同内容也会覆盖；已不存在或不再适用的原选择：'+(approval.skipped||0)+' 项。':'已重新读取最新差异，请核对后批准。已无差异或不再适用的原选择：'+(approval.skipped||0)+' 项。';outgoingView(outgoing);report(result);draw()}
 async function read(){taskReady=false;q('#sync-execution').hidden=true;q('#sync-outgoing').hidden=true;pause=false;let result;do{result=await api('advance',{uid});status.textContent=`${({'selected-load':'按需读取所选条目及引用','selected-check':'核对所选依赖',brief:'读取简要信息',candidates:'整理候选',baseline:'建立版本基准',content:'读取内容',verify:'复核版本',done:'准备分析',references:'分批分析引用',compare:'分批比较差异',dependencies:'分批整理依赖',publish:'发布预览'})[result.phase]||'正在分批读取'} ${result.side||''} ${result.table||''}，已读取 ${result.count||0} 条${result.analyzed!==undefined?'，已分析 '+result.analyzed+' 项':''}`;if(pause&&result.status==='reading'){status.textContent='已暂停，稍后可打开最近预览继续。';return}}while(result.status==='reading');if(result.status==='ready')show(result.items?result:await api('get',{uid}));else throw Error('预览已失效，请重新生成。')}

 function report(result){
  execution=result.execution||execution;if(!execution){q('#sync-progress').textContent='尚未执行。';return}
  const phases={'write-record':'逐条写入并保存进度','prepare-rows':'分批准备内容','validate-rows':'分批校验引用',download:'下载与校验媒体','verify-commit':'分批复核提交前版本',commit:'提交内容及引用',cleanup:'清理分片暂存',done:'同步完成',cancelled:'任务已取消，已完成内容保留'};
  q('#sync-progress').textContent=`任务 ID: ${result.uid||uid||'—'} · ${phases[execution.phase]||execution.phase} · 已下载 ${Math.round((execution.bytes||0)/1024)} KB · ${Number.isInteger(execution.applied)?'已逐条提交 '+execution.applied+' 条（已完成内容保留）':execution.committed?'数据库已提交':'数据库尚未提交'}${execution.error?' · '+execution.error:''}${execution.retained_files?.length?' · 保留了 '+execution.retained_files.length+' 个已变化文件，请到媒体目录核对':''}`;
  if(execution.error)notify(q('#sync-progress').textContent,'error',{id:'site-sync-task'});
 }
 async function execute(){
  pause=false;
  try{while(execution&&!['done','cancelled'].includes(execution.phase)){
   report(await api('pull-tick',{uid}));
   if(pause){status.textContent='已暂停后续步骤，进度已保存。';return}
  }status.textContent=execution?.phase==='done'?'同步完成。来源网站保持不变。':'取消及暂存清理完成；已提交的内容未回滚。'}
  catch(e){try{report(await api('get',{uid}))}catch{}throw e}
 }
 q('#sync-begin').onclick=()=>run(async()=>{
  if(!confirm((approval?'批准对端提案并写入本站':'从对端同步到本站')+'？将执行已选新增、覆盖、删除及必要依赖；已完成条目不会整体回滚。'))return;
  q('#sync-confirm').value=approval?'同意对端推送':'从对端同步到本站';
  pause=false;let result;
  do{result=await confirmedAction(approval?'proposal-approve':'pull-begin',{uid,confirmation:q('#sync-confirm').value});if(!result)return;
   if(result.checking){status.textContent=result.phase==='prepare-selection'?'正在分批整理所选内容及媒体；尚未启动执行。':'正在分批复核确认内容；尚未启动执行。';if(pause){status.textContent='确认复核已暂停；再次点击确认可继续。';return}}
  }while(result.checking);
  report(result);await execute();
 });
 q('#sync-continue').onclick=()=>run(async()=>{pause=false;await api('resume',{uid});await execute()});
 q('#sync-cancel').onclick=()=>{if(confirm('取消尚未完成的步骤并清理暂存？已提交的内容不会回滚，旧媒体保留。'))run(async()=>{report(await api('pull-cancel',{uid}));await execute()})};
 q('#sync-restart').onclick=()=>{if(confirm('重新开始会先清理旧任务暂存，再按原方向和模块建立新预览。已提交的内容不回滚；新预览需重新勾选并确认。'))run(async()=>{
  pause=false;const saved=await api('get',{uid});report(saved);
  if(saved.execution&&!['done','cancelled'].includes(saved.execution.phase)){
   report(await api('pull-cancel',{uid}));await execute();
   if(pause||!['done','cancelled'].includes(execution.phase))return;
  }
  const next=await api('restart',{uid});uid=next.uid;execution=null;approval=null;items=[];selected.clear();requested.clear();automatic.clear();
  q('#sync-history').prepend(new Option('重新开始 · '+localTime(new Date().toISOString())+' · ID: '+uid,uid));q('#sync-history').value=uid;
  q('#sync-result').hidden=true;await read();
 })};
 q('#sync-config').addEventListener('submit',e=>{e.preventDefault();run(async()=>{const f=new FormData(e.target);await api('save',{origin:f.get('origin'),secret:f.get('secret'),enabled:f.has('enabled'),allow_proposals:f.has('allow_proposals')});q('#sync-secret').value='';q('#sync-secret').type='password';q('#sync-result').hidden=true;q('#sync-execution').hidden=true;q('#sync-outgoing').hidden=true;execution=null;approval=null;outgoing=null;selected.clear();requested.clear();items=[];status.textContent='连接已保存；请在另一站填写相同密钥，再测试连接。'})});
 q('#sync-generate').onclick=()=>run(async()=>{const bytes=crypto.getRandomValues(new Uint8Array(32)),value=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');q('#sync-secret').value=value;try{await navigator.clipboard.writeText(value);status.textContent='新密钥已复制，请在两站分别保存。'}catch{q('#sync-secret').type='text';q('#sync-secret').select();status.textContent='请手动复制选中的密钥，保存后将恢复隐藏。'}});
 q('#sync-test').onclick=()=>run(async()=>{await api('test');status.textContent='连接、签名、同步协议和站点身份检查通过；尚未读取或校验业务数据，开始预览时再检查。'});
 root.querySelectorAll('[data-direction]').forEach(b=>b.onclick=()=>run(async()=>{q('#sync-result').hidden=true;q('#sync-execution').hidden=true;q('#sync-outgoing').hidden=true;approval=null;outgoing=null;execution=null;items=[];const result=await api('start',{direction:b.dataset.direction,scopes:[...root.querySelectorAll('[name=sync-scope]:checked')].map(c=>c.value)});uid=result.uid;const option=new Option('当前预览 · '+localTime(new Date().toISOString())+' · ID: '+uid,uid);q('#sync-history').prepend(option);q('#sync-history').value=uid;await read()}));
 q('#sync-pause').onclick=()=>{pause=true;if(uid)request('manual-pause',{uid}).then(()=>{manualActive=false;if(!busy)q('#sync-pause').disabled=true;status.textContent='本任务浏览器及后台续跑已暂停；已开始的步骤可能完成，进度会保留。'}).catch(e=>{status.textContent='浏览器已暂停，但后台暂停未确认：'+e.message;notify(status.textContent,'error')})};q('#sync-resume').onclick=()=>run(async()=>{uid=q('#sync-history').value;if(!uid)throw Error('请选择预览');await openSaved()});
 async function openSaved(advance=true){
  taskReady=false;let result=await api('get',{uid});
  if(result.prepared_uid){
   uid=result.prepared_uid;
   if(![...q('#sync-history').options].some(v=>v.value===uid))q('#sync-history').prepend(new Option('执行准备 · ID: '+uid,uid));
   q('#sync-history').value=uid;result=await api('get',{uid});
  }
  if(result.status==='reading'){if(advance){pause=false;await api('resume',{uid});await read()}else{show(result);status.textContent='已打开保存的检查点，尚未推进；需要继续读取时使用“打开 / 继续读取”。'}}
  else if(result.status==='ready')show(result);
  else throw Error('预览已失效，请重新生成。');
 }
 async function confirmedAction(action,data){
  try{return await api(action,data)}catch(e){
   if(e.httpStatus!==409||(e.code!=='sync_prepare_required'&&!e.message.includes('请先准备所选内容')))throw e;
   await openSaved();
   status.textContent=taskReady&&prepared?'已打开准备完成的任务，请核对条目及依赖后再次确认；尚未发送或执行。':'当前任务尚未准备完成，请点击“准备所选内容及依赖”或继续原准备任务；尚未发送或执行。';
   return null;
  }
 }
 function listOptions(after=['','']){return {uid,after,search:q('#sync-search').value.trim(),action:q('#sync-action').value}}
 async function loadPage(after){const value=await api('get',listOptions(after));items=value.items;nextCursor=value.next;candidateCount=value.candidate_count;draw()}
 for(const id of ['#sync-search','#sync-action','#sync-sort'])q(id).addEventListener('change',()=>{if(lightweight)run(async()=>{page=1;cursors=[['','']];await loadPage(cursors[0])});else{page=1;draw()}});
 q('#sync-prepare').onclick=()=>run(async()=>{pause=false;const job=await api('prepare-preview',{uid});uid=job.uid;taskReady=false;lightweight=true;prepared=false;q('#sync-history').prepend(new Option('执行准备 · '+localTime(new Date().toISOString())+' · ID: '+uid,uid));q('#sync-history').value=uid;q('#sync-result').hidden=true;await read()});
 q('#sync-all').onclick=()=>run(async()=>{
  pause=false;const ids=new Set(requested),filters=listOptions();if(lightweight){let after=['',''];do{const value=await api('get',{...filters,after});for(const x of value.items)ids.add(x.id);if(ids.size>500)throw Error('筛选结果超过500项，请缩小筛选范围；原选择保持不变');after=value.next;if(after)await waitFor(intervalMs)}while(after)}else for(const x of filtered())ids.add(x.id);
  requested=ids;await choose()
 });q('#sync-none').onclick=()=>run(async()=>{requested.clear();await choose()});

 q('#sync-history-delete').onclick=()=>run(async()=>{
  const target=q('#sync-history').value;if(!target)throw Error('请选择需要删除的历史记录');
  if(!confirm('删除这条同步历史及关联准备记录？不删除网站内容和正式媒体；正在执行或待批准的任务不能删除。'))return;
  pause=false;let value;
  do{value=await api('history-delete',{uid:target,confirmed:true});status.textContent='正在分批清理历史明细…';if(pause){status.textContent='历史清理已暂停，后台将继续处理已标记记录。';return}}while(value.more);
  const history=q('#sync-history');history.replaceChildren(new Option('选择保存的预览',''));
  for(const job of value.jobs||[])history.append(new Option(localTime(job.created_at)+' · '+(job.execution_phase||job.status)+' · ID: '+job.uid,job.uid));
  uid='';taskReady=false;execution=null;items=[];selected.clear();requested.clear();automatic.clear();
  q('#sync-result').hidden=true;q('#sync-execution').hidden=true;q('#sync-outgoing').hidden=true;
  status.textContent='历史记录已删除，网站内容和正式媒体未删除。';
 });
 const proposalLabels={pending:'待接收方批准',approved:'已批准',rejected:'已拒绝',superseded:'已由新提案替换',superseded_or_unknown:'已替换或回执不在保留范围',unconfirmed:'发送结果待确认'};
 function outgoingView(value){if(value)outgoing=value;q('#sync-outgoing-info').textContent=outgoing?`任务 ID: ${uid||'—'} · 提案 ID: ${outgoing.request_id||outgoing.payload?.request_id||'—'} · 第 ${outgoing.sequence||'?'} 版 · ${proposalLabels[outgoing.status]||outgoing.status}${outgoing.phase?' · 执行阶段 '+outgoing.phase:''}`:'尚未发送。'}
 function inboxView(value){pending=value?.proposal||null;q('#sync-inbox-info').textContent=pending?`提案 ID: ${pending.request_id}${pending.task_uid?' · 执行任务 ID: '+pending.task_uid:''}${pending.review_uid?' · 审批任务 ID: '+pending.review_uid:''} · 第 ${pending.sequence} 版 · ${proposalLabels[pending.status]||pending.status} · 原选择 ${pending.requested_count} 项 · 接收于 ${localTime(pending.received_at)}${pending.phase?' · 执行阶段 '+pending.phase:''}`:'暂无推送提案。';draw()}
 q('#sync-inbox-refresh').onclick=()=>run(async()=>inboxView(await api('proposal-inbox')));
 q('#sync-send').onclick=()=>run(async()=>{
  if(!confirm('将所选内容提交到对端等待批准？此操作不会直接写入对端网站。'))return;
  pause=false;let result;
  do{result=await confirmedAction('proposal-send',{uid});if(!result)return;if(result.checking){status.textContent='正在分批复核推送版本；尚未发送提案。';if(pause){status.textContent='推送复核已暂停；再次点击发送可继续。';return}}}while(result.checking);
  outgoingView(result.outgoing);status.textContent=outgoing?.status==='pending'?'提案已送达，等待对端重新预览并批准。':'已取得对端回执，状态见下方。';
 });
 q('#sync-receipt').onclick=()=>run(async()=>outgoingView((await api('proposal-status',{uid})).outgoing));
 q('#sync-review').onclick=()=>run(async()=>{const job=await api('proposal-review',{request_id:pending.request_id});uid=job.uid;q('#sync-history').prepend(new Option('审批预览 · '+localTime(new Date().toISOString())+' · ID: '+uid,uid));q('#sync-history').value=uid;q('#sync-result').hidden=true;q('#sync-execution').hidden=true;q('#sync-outgoing').hidden=true;execution=null;items=[];await read()});
 q('#sync-reject').onclick=()=>{if(confirm('拒绝当前提案？不会修改两站业务数据。'))run(async()=>{await api('proposal-reject',{request_id:pending.request_id});inboxView(await api('proposal-inbox'));status.textContent='提案已拒绝；旧提案重发不会恢复审批，来源需提交新版提案。'})};
 const scheduleForm=q('#sync-schedule');let scheduleRevision=null;
 let lastScheduleError='';
 const waitLabels={lease_wait:'等待其他执行请求或遗留租约到期',disabled:'后台已关闭',next_cycle:'等待下一轮拉取',waiting_confirmation:'等待人工确认或批准',receipt_wait:'等待回执恢复窗口',retry_wait:'等待冷却后重试',needs_attention:'需要人工处理',missing:'任务记录缺失，需检查',linked:'下一轮衔接子任务',reconcile:'等待后台核对未确认步骤',ready:'等待下一轮后台推进',complete:'执行已结束，等待后台登记完成'};
 function scheduleView(value){
  const s=value.state||{},current=value.current_task||{},currentError=current.error||s.error||'';
  if(currentError&&currentError!==lastScheduleError)notify('后台同步状态：'+currentError,'error',{id:'site-sync-background'});
  lastScheduleError=currentError;scheduleRevision=value.revision||null;
  q('#sync-schedule-status').textContent=`${value.enabled?'定时策略已开启':'定时策略已关闭（手动任务按独立授权续跑）'} · ${value.auto_pull?'自动拉取':'仅推进已确认任务'}${value.wait_reason?' · '+(waitLabels[value.wait_reason]||value.wait_reason):''}${s.message?' · '+s.message:''}${s.next_due&&(!value.wait_reason||value.wait_reason==='next_cycle')?' · 下次拉取检查 '+localTime(s.next_due):''}${s.updated_at?' · 最近后台记录 '+localTime(s.updated_at):''}${s.preview_uid?' · 预览任务 ID: '+s.preview_uid:''}${s.task_uid?' · 后台任务 ID: '+s.task_uid:''}${current.uid?' · 当前推进任务 ID: '+current.uid:''}${current.parent_uid?' · 父任务 ID: '+current.parent_uid:''}${current.prepared_uid?' · 准备子任务 ID: '+current.prepared_uid:''}${s.last_task_uid?' · 最近结束任务 ID: '+s.last_task_uid:''}${value.next_attempt_at?' · 最早恢复时间 '+localTime(value.next_attempt_at)+'（到期后下一轮调度）':!value.wait_reason&&s.retry_after?' · 等待至 '+localTime(s.retry_after):''}${currentError?' · '+currentError:''}`;
 }

 scheduleForm.addEventListener('submit',e=>{e.preventDefault();run(async()=>{const f=new FormData(scheduleForm);if(!confirm(f.has('enabled')?(f.has('auto_pull')?'启用本站作为接收端定时拉取？包含所选模块及依赖的新增、覆盖和删除。请确保对端未同时启用定时拉取。':'开启后台推进已确认任务？未批准的提案不会自动批准。'):'关闭定时策略？手动任务仍按独立授权运行，已完成内容不会回滚。'))return;f.set('confirmation','允许定时拉取并同步增删');scheduleView(await api('schedule-save',{revision:scheduleRevision,enabled:f.has('enabled'),auto_pull:f.has('auto_pull'),interval:Number(f.get('interval')),scopes:f.getAll('schedule-scope'),confirmation:f.get('confirmation')}));q('#sync-schedule-confirm').value='';status.textContent='后台策略已保存。';})});
 q('#sync-schedule-refresh').onclick=()=>run(async()=>scheduleView(await api('schedule-status')));
 scheduleView(JSON.parse(scheduleForm.dataset.value));
 inboxView(JSON.parse(q('#sync-inbox').dataset.value));
 q('#sync-prev').onclick=()=>{if(lightweight)run(async()=>{page--;await loadPage(cursors[page-1])});else{page--;draw()}};q('#sync-next').onclick=()=>{if(lightweight)run(async()=>{cursors[page]=nextCursor;page++;await loadPage(cursors[page-1])});else{page++;draw()}};
 // Metadata-only task monitor: one request at a time, no peer traffic or retries.
 let monitorBusy=false,monitorTimer=null,monitorNext=null,monitorPage=0,monitorRenderedPage=0,monitorCursors=[null];
 const monitorRows=q('#sync-monitor-rows'),monitorInfo=q('#sync-monitor-info');
 const phaseNames={latest:'读取最新候选',brief:'读取摘要',candidates:'整理候选','selected-load':'准备条目及依赖','selected-check':'核对依赖',complete:'准备完成',download:'传输媒体','write-record':'逐条写入','prepare-rows':'准备写入',commit:'提交内容',cleanup:'清理暂存',done:'完成',cancelled:'已取消',baseline:'读取版本',content:'读取内容',confirm:'等待确认','proposal-check':'核对推送提案','approval-review':'核对审批',selection:'保存选择'};
 const operationNames={advance:'推进预览',begin:'确认执行',execute:'推进执行','pull-tick':'推进传输',tick:'推进传输',select:'保存选择','proposal-send':'发送提案','review-finish':'完成审批核对'};
 const ageText=(stamp,now)=>{const seconds=Math.max(0,Math.floor((now-Date.parse(stamp))/1000));return !Number.isFinite(seconds)?'':seconds<60?seconds+'秒':seconds<3600?Math.floor(seconds/60)+'分钟':Math.floor(seconds/3600)+'小时'};
 function monitorState(job,now){
  const phase=job.execution_phase;
  if(job.status==='expired')return ['已失效','secondary'];
  if(job.work_status==='running'){const due=Date.parse(job.recover_after);return [!Number.isFinite(due)||due<=now?'回执逾期 · 待核对':'等待完成回执','warning'];}
  if(phase==='done')return ['已完成','success'];
  if(phase==='cancelled')return ['已取消','secondary'];
  if(job.restart_uid)return ['已重新开始','secondary'];
  if(job.work_status==='paused'){
   if(job.slow_retry&&job.retryable)return ['后台低频重试','warning'];
   if(job.retryable&&job.retry_after)return [Date.parse(job.retry_after)>now?'等待重试':'重试时间已到','warning'];
   return ['已暂停 · 需人工处理','danger'];
  }
  if(job.prepared_uid&&!job.execution_phase)return ['已转入准备子任务','secondary'];
  return [job.execution_phase?'待推进下一步':job.status==='reading'?'待继续读取':'待确认 / 待审批','info'];
 }
 function monitorControls(){
  q('#sync-monitor-prev').disabled=busy||monitorBusy||!monitorPage;
  q('#sync-monitor-next').disabled=busy||monitorBusy||!monitorNext;
  q('#sync-monitor-latest').disabled=busy||monitorBusy;
  q('#sync-monitor-refresh').disabled=busy||monitorBusy;
  q('#sync-monitor-active').disabled=busy||monitorBusy;
  monitorRows.querySelectorAll('button').forEach(button=>button.disabled=busy||button.dataset.unavailable==='true');
 }
 function monitorRender(value){
  monitorRows.replaceChildren();monitorNext=value.next||null;monitorRenderedPage=monitorPage;
  const now=Date.parse(value.server_time)||Date.now(),counts=new Map();
  for(const job of value.jobs||[]){
   if(job.uid===uid){manualActive=!!job.manual_enabled;if(!busy)q('#sync-pause').disabled=!manualActive;}
   const row=document.createElement('tr'),phase=job.execution_phase||job.work_phase||job.phase;
   const deadline=job.work_status==='running'?job.recover_after:job.retry_after;
   const [label,tone]=monitorState(job,now);counts.set(label,(counts.get(label)||0)+1);
   const identity=document.createElement('td');identity.textContent='任务 ID: '+job.uid+' · '+(job.direction==='push'?'本站 → 对端':'对端 → 本站')+(job.latest_only||job.auto_latest?' · 最新500项':'');
   for(const [key,title] of [['parent_uid','父任务'],['prepared_uid','准备子任务'],['restart_uid','重新开始的任务']])if(job[key]){const note=document.createElement('div');note.className='small text-muted';note.textContent=title+'：'+job[key];identity.append(note)}
   row.append(identity);
   const state=document.createElement('td'),badge=document.createElement('span');badge.className='badge text-bg-'+tone;badge.textContent=label;state.append(badge);
   const stage=document.createElement('div');stage.textContent=(phaseNames[phase]||phase||'准备')+(job.operation?' · '+(operationNames[job.operation]||job.operation):'');state.append(stage);
   if(job.advance_mode){const note=document.createElement('div');note.className='small text-muted';note.textContent=({background:'由后台自动推进',queued:'等待前一任务，后台排队',manual:'需人工确认或继续',disabled:'后台未开启',needs_attention:'需检查后手动恢复',complete:'已结束'})[job.advance_mode]||job.advance_mode;if(job.manual_mode)note.textContent+=' · 本次手动任务'+(job.manual_paused?'（已暂停）':'')+(job.manual_message?' · '+job.manual_message:'');if(job.advance_mode!=='complete')note.textContent+=' · '+(waitLabels[job.wait_reason]||job.wait_reason||'');state.append(note)}
   const scheduler=job.scheduler||{};
   if(scheduler.started_at){const note=document.createElement('div');note.className='small text-muted';note.textContent='后台调度：'+({reconcile:'正在核对回执',initialize:'已核对，初始化业务步骤',finished:'本轮已结束'}[scheduler.stage]||scheduler.stage)+' · 最近启动 '+localTime(scheduler.started_at)+(scheduler.finished_at?' · 最近返回 '+localTime(scheduler.finished_at):' · 尚无调度完成回执')+(scheduler.error?' · '+scheduler.error:'')+(scheduler.error_code?'（'+scheduler.error_code+'）':'')+(scheduler.retry_after?' · 最早再检查 '+localTime(scheduler.retry_after):'');state.append(note)}
   row.append(state);
   const savedAge=ageText(job.completed_at,now);
   const cells=[`已完成请求 ${job.steps||0} 次 · 已读 ${job.count||0} 条 · 候选 ${job.candidates||0} 项`+(job.applied!=null?' · 已提交 '+job.applied+' 条':'')+(job.load_index!=null?' · 已准备 '+job.load_index+' 条':'')+(job.media_count!=null?` · 媒体 ${Math.min(job.file_index||0,job.media_count)}/${job.media_count} · ${Math.round((job.bytes||0)/1024)} KB`:'')+(job.resource_level?' · 资源降速 '+job.resource_level+' 档':'')+(job.chunk_bytes?' · 分片 '+job.chunk_bytes/1024+' KiB':'')+(job.checkpoint_version?` · 有效进展 ${job.progress_events||0} 次 · 累计请求异常 ${job.total_failures||0} 次 · 异常但有进展 ${job.failures_with_progress||0} 次 · 其中未确认 ${job.uncertain_attempts||0} 次 · 连续无进展 ${job.stalled_attempts||0} 次`:' · 尚未建立进度检查点'),
    (job.next_attempt_at?'后台最早恢复 '+localTime(job.next_attempt_at)+'（到期后下一轮调度） · ':'')+'创建 '+localTime(job.created_at)+(job.last_progress_at?' · 最近有效进展 '+localTime(job.last_progress_at):'')+(job.completed_at?' · 最近保存 '+localTime(job.completed_at)+(savedAge?'（'+savedAge+'前）':''):' · 尚无步骤完成记录')+(job.reconciled_at?' · 最近中断核对 '+localTime(job.reconciled_at):'')+(job.started_at?' · 最近启动 '+localTime(job.started_at):'')+(job.failed_at?' · 最近失败 '+localTime(job.failed_at):'')+(deadline?' · '+(job.work_status==='running'?'回执恢复等待至 ':'重试等待至 ')+localTime(deadline):'')+(job.retry_count?' · 连续无进展失败 '+job.retry_count+' 次':'')+(job.elapsed_ms!=null?' · 上一步耗时 '+job.elapsed_ms+' ms':'')+(job.error_code?' · 错误码 '+job.error_code:'')+(job.error?' · '+job.error:'')];
   for(const text of cells){const td=document.createElement('td');td.textContent=text;row.append(td)}
   const td=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='btn btn-outline-secondary btn-sm';button.textContent='查看';button.dataset.unavailable=String(job.status==='expired');button.disabled=busy||job.status==='expired';
   button.onclick=()=>run(async()=>{uid=job.uid;if(![...q('#sync-history').options].some(v=>v.value===uid))q('#sync-history').prepend(new Option('任务 · ID: '+uid,uid));q('#sync-history').value=uid;await openSaved(false)});td.append(button);if(job.manual_mode&&!job.manual_finished){const control=document.createElement('button');control.type='button';control.className='btn btn-outline-secondary btn-sm';const continuing=job.manual_enabled&&job.scheduler?.retryable!==false;control.textContent=continuing?'暂停后台':'恢复后台';control.onclick=()=>run(async()=>{await request(continuing?'manual-pause':'resume',{uid:job.uid});status.textContent=continuing?'本任务后台续跑已暂停。':'已请求恢复本任务后台续跑。'}).then(refreshMonitor);td.append(control)}row.append(td);monitorRows.append(row);
  }
  monitorInfo.textContent='状态读取于 '+localTime(value.server_time)+' · 本页 '+(value.jobs||[]).length+' 项'+(!(value.jobs||[]).length?'；当前筛选范围没有任务':'')+(monitorPage?' · 当前为历史分页，查看新任务请点击“回到最新任务”':'');
  const health=value.schedule?.scheduler||{};monitorInfo.textContent+=health.arrived_at?' · 最近后台调度到达 '+localTime(health.arrived_at)+(health.skipped?' · 调度等待原因 '+(waitLabels[health.skipped]||({'interval':'尚未到恢复时间','busy':'执行锁仍有效','recovery-backoff':'核对失败后退避','needs-attention':'需要人工处理'})[health.skipped]||health.skipped):''):' · 尚无后台调度到达记录';
  if(health.error)monitorInfo.textContent+=' · '+health.error+(health.gate_retry_after?' · 最早再检查 '+localTime(health.gate_retry_after):'');
  if(health.attempt?.error)monitorInfo.textContent+=' · 调度错误：'+health.attempt.error;
  q('#sync-monitor-summary').textContent=[...counts].map(([label,count])=>label+' '+count+' 项').join(' · ');
  q('#sync-monitor-page').textContent='第'+(monitorPage+1)+'页';
  if(value.schedule)scheduleView(value.schedule);
 }
 async function refreshMonitor(){
  if(monitorBusy||busy)return;
  monitorBusy=true;monitorControls();
  try{monitorRender(await request('monitor',{active:q('#sync-monitor-active').checked,after:monitorCursors[monitorPage]}))}
  catch(e){monitorPage=monitorRenderedPage;monitorInfo.textContent='状态刷新失败，已停止自动刷新：'+e.message;q('#sync-monitor-auto').checked=false}
  finally{monitorBusy=false;monitorControls()}
 }
 function monitorLater(){clearTimeout(monitorTimer);monitorTimer=setTimeout(async()=>{if(!document.hidden&&q('#sync-monitor-auto').checked)await refreshMonitor();monitorLater()},60000)}
 q('#sync-monitor-refresh').onclick=refreshMonitor;
 q('#sync-monitor-latest').onclick=()=>{monitorPage=0;monitorCursors=[null];refreshMonitor()};
 q('#sync-monitor-active').onchange=()=>{monitorPage=0;monitorCursors=[null];refreshMonitor()};
 q('#sync-monitor-prev').onclick=()=>{if(!busy&&!monitorBusy&&monitorPage){monitorPage--;refreshMonitor()}};
 q('#sync-monitor-next').onclick=()=>{if(!busy&&!monitorBusy&&monitorNext){monitorCursors[++monitorPage]=monitorNext;refreshMonitor()}};
 refreshMonitor();monitorLater();window.addEventListener('pagehide',()=>clearTimeout(monitorTimer),{once:true});

}
