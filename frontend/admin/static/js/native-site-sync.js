import {adminFetch} from './native-access.js?v=0.15.28';
import {notify} from './native-notifications.js';
const root=document.querySelector('#site-sync');
if(root){
 const q=s=>root.querySelector(s),status=q('#sync-status'),labels={add:'新增',update:'更新',delete:'删除'};
 let uid='',items=[],selected=new Set(),requested=new Set(),automatic=new Set(),page=1,busy=false,pause=false,execution=null,direction='',approval=null,outgoing=null,pending=null;
 const intervalMs=Number(root.dataset.intervalMs)||0;let nextBatchAt=0;
 const paced=new Set(['advance','pull-begin','proposal-approve','pull-tick','proposal-send']);
 function checkpoint(value){const target=q('#sync-checkpoint'),w=value?.work;if(!target||!w)return;target.textContent=`阶段：${w.phase||w.operation||'准备'} · 已保存步骤 ${w.completed_steps||0} · 已读 ${w.count||0} 条${w.completed_at?' · 最近保存 '+w.completed_at:''}${w.status==='running'?' · 上次步骤尚未确认完成；可稍后打开原任务继续':''}${w.error?' · '+w.error:''}`;}
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
  checkpoint(result);return result;
 }
 const retrySeconds=JSON.parse(root.dataset.retrySeconds||'[2,5,15]');
 const retryCodes=new Set(JSON.parse(root.dataset.retryCodes||'[]'));
 async function waitFor(ms){const end=Date.now()+ms;while(Date.now()<end){if(pause)throw new DOMException('已暂停后续批次；进度已保存。','AbortError');await new Promise(resolve=>setTimeout(resolve,Math.min(250,end-Date.now())))}}
 async function api(action,data={}){
  for(let attempt=0;;attempt++){
   try{return await request(action,data)}catch(e){
    const retryable=e instanceof TypeError||retryCodes.has(e.code)||(!e.code&&[429,502,503,504].includes(e.httpStatus));
    if(!paced.has(action)||!retryable||attempt>=retrySeconds.length||pause)throw e;
    const delay=retrySeconds[attempt]*1000;
    status.textContent=`${e.message}；${retrySeconds[attempt]}秒后重试 ${attempt+1}/${retrySeconds.length}，可点击暂停。`;
    notify(status.textContent,'info',{id:'site-sync'});await waitFor(delay);
    // A lost response may already have committed. Read the persisted state before replaying.
    if(data.uid){const saved=await request('get',{uid:data.uid});checkpoint(saved);if(saved.execution)report(saved)}
   }
  }
 }
 async function run(fn){if(busy)return;busy=true;notify('正在处理同步操作…','progress',{id:'site-sync'});root.querySelectorAll('button').forEach(b=>b.disabled=true);q('#sync-pause').disabled=false;try{await fn();notify(status.textContent,/完成|通过|已保存|已送达|已拒绝/.test(status.textContent)?'success':'info',{id:'site-sync'})}catch(e){const message=e instanceof TypeError?'浏览器无法连接本站接口；请检查网络并刷新任务核对进度。':e.message;status.textContent=message;notify(message,e.name==='AbortError'?'info':'error',{id:'site-sync'});status.scrollIntoView?.({block:'nearest',behavior:'smooth'})}finally{busy=false;root.querySelectorAll('button').forEach(b=>b.disabled=false);q('#sync-pause').disabled=true;draw()}}
 function filtered(){const term=q('#sync-search').value.trim().toLowerCase(),action=q('#sync-action').value,sort=q('#sync-sort').value,field=sort.replace('-','');return items.filter(x=>(x.in_scope||selected.has(x.id))&&(!action||x.action===action)&&(!term||[x.title,x.table,x.module_label,x.uid].join(' ').toLowerCase().includes(term))).sort((a,b)=>String(a[field]).localeCompare(String(b[field]))*(sort.startsWith('-')?-1:1))}
 function cell(row,value){const td=document.createElement('td');td.textContent=value;row.append(td);return td}
 function draw(){
  const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/20));page=Math.min(page,pages);q('#sync-rows').replaceChildren();
  for(const item of rows.slice((page-1)*20,page*20)){
   const tr=document.createElement('tr'),td=cell(tr,''),box=document.createElement('input');box.type='checkbox';box.checked=selected.has(item.id);box.disabled=busy||!!execution||automatic.has(item.id);box.setAttribute('aria-label','选择 '+item.title);box.addEventListener('change',()=>run(async()=>{box.checked?requested.add(item.id):requested.delete(item.id);await choose()}));td.append(box);
   cell(tr,item.module_label+' / '+item.title);cell(tr,labels[item.action]);cell(tr,item.fields.join('、'));
   cell(tr,[automatic.has(item.id)?'自动选择的前置依赖':'',...item.dependencies.map(d=>'依赖 '+(items.find(x=>x.id===d)?.title||d)),...item.blocked,...(item.media_check?['媒体原文件待传输阶段校验']:[])].filter(Boolean).join('；'));q('#sync-rows').append(tr);
  }
  q('#sync-page').textContent=`${page} / ${pages} · ${rows.length} 项`;q('#sync-prev').disabled=busy||page===1;q('#sync-next').disabled=busy||page===pages;
  q('#sync-all').disabled=busy||!!execution;q('#sync-none').disabled=busy||!!execution;
  q('#sync-begin').disabled=busy||!!execution||(!selected.size&&(!approval||items.length>0));q('#sync-confirm').disabled=!!execution;
  const active=execution&&!['done','cancelled'].includes(execution.phase);q('#sync-restart').disabled=busy||!uid||!!approval;q('#sync-continue').disabled=busy||!active;q('#sync-cancel').disabled=busy||!active;
  q('#sync-send').disabled=busy||!selected.size;q('#sync-receipt').disabled=busy||!outgoing;
  q('#sync-review').disabled=busy||pending?.status!=='pending';q('#sync-reject').disabled=busy||pending?.status!=='pending';
 }
 async function choose(){const s=await api('select',{uid,ids:[...requested]});selected=new Set(s.selected);automatic=new Set(s.automatic);q('#sync-selection').textContent=`已选择 ${selected.size} 项，其中依赖 ${automatic.size} 项；存在阻止原因 ${Object.keys(s.blocked).length} 项。仅保存预览。`;draw()}
 function show(result){approval=result.approval||null;outgoing=result.outgoing||null;execution=result.execution||null;direction=result.direction;items=result.items||[];const s=result.selection||{};selected=new Set(s.selected||[]);automatic=new Set(s.automatic||[]);requested=new Set([...selected].filter(k=>!automatic.has(k)));q('#sync-result').hidden=false;q('#sync-direction').textContent=result.direction==='pull'?'对端 → 本站：差异清单':'本站 → 对端：差异清单';q('#sync-selection').textContent=`已保存选择 ${selected.size} 项；依赖 ${automatic.size} 项。`;status.textContent=execution?'已打开保存的实际同步任务。':'完整预览已生成；没有执行业务数据或媒体增删。';q('#sync-execution').hidden=direction!=='pull';q('#sync-outgoing').hidden=direction!=='push';q('#sync-confirm').placeholder=approval?'输入：同意对端推送':'输入：从对端同步到本站';q('#sync-confirm').value='';q('#sync-begin').textContent=approval?'同意并执行最新差异':'确认并开始拉取';if(approval&&!execution)status.textContent='已重新读取最新差异，请核对后批准。已无差异或不再适用的原选择：'+(approval.skipped||0)+' 项。';outgoingView(outgoing);report(result);draw()}
 async function read(){pause=false;let result;do{result=await api('advance',{uid});status.textContent=`${({baseline:'建立版本基准',content:'读取内容',verify:'复核版本',done:'准备分析',references:'分批分析引用',compare:'分批比较差异',dependencies:'分批整理依赖',publish:'发布预览'})[result.phase]||'正在分批读取'} ${result.side||''} ${result.table||''}，已读取 ${result.count||0} 条${result.analyzed!==undefined?'，已分析 '+result.analyzed+' 项':''}`;if(pause&&result.status==='reading'){status.textContent='已暂停，稍后可打开最近预览继续。';return}}while(result.status==='reading');if(result.status==='ready')show(result.items?result:await api('get',{uid}));else throw Error('预览已失效，请重新生成。')}

 function report(result){
  execution=result.execution||execution;if(!execution){q('#sync-progress').textContent='尚未执行。';return}
  const phases={'prepare-rows':'分批准备内容','validate-rows':'分批校验引用',download:'下载与校验媒体','verify-commit':'分批复核提交前版本',commit:'提交内容及引用',cleanup:'清理分片暂存',done:'同步完成',cancelled:'任务已取消，已完成内容保留'};
  q('#sync-progress').textContent=`${phases[execution.phase]||execution.phase} · 已下载 ${Math.round((execution.bytes||0)/1024)} KB · ${execution.committed?'数据库已提交':'数据库尚未提交'}${execution.error?' · '+execution.error:''}${execution.retained_files?.length?' · 保留了 '+execution.retained_files.length+' 个已变化文件，请到媒体目录核对':''}`;
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
  pause=false;let result;
  do{result=await api(approval?'proposal-approve':'pull-begin',{uid,confirmation:q('#sync-confirm').value});
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
  q('#sync-history').prepend(new Option('重新开始 · '+new Date().toLocaleString(),uid));q('#sync-history').value=uid;
  q('#sync-result').hidden=true;await read();
 })};
 q('#sync-config').addEventListener('submit',e=>{e.preventDefault();run(async()=>{const f=new FormData(e.target);await api('save',{origin:f.get('origin'),secret:f.get('secret'),enabled:f.has('enabled'),allow_proposals:f.has('allow_proposals')});q('#sync-secret').value='';q('#sync-secret').type='password';q('#sync-result').hidden=true;q('#sync-execution').hidden=true;q('#sync-outgoing').hidden=true;execution=null;approval=null;outgoing=null;selected.clear();requested.clear();items=[];status.textContent='连接已保存；请在另一站填写相同密钥，再测试连接。'})});
 q('#sync-generate').onclick=()=>run(async()=>{const bytes=crypto.getRandomValues(new Uint8Array(32)),value=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');q('#sync-secret').value=value;try{await navigator.clipboard.writeText(value);status.textContent='新密钥已复制，请在两站分别保存。'}catch{q('#sync-secret').type='text';q('#sync-secret').select();status.textContent='请手动复制选中的密钥，保存后将恢复隐藏。'}});
 q('#sync-test').onclick=()=>run(async()=>{await api('test');status.textContent='连接、签名、同步协议和站点身份检查通过；尚未读取或校验业务数据，开始预览时再检查。'});
 root.querySelectorAll('[data-direction]').forEach(b=>b.onclick=()=>run(async()=>{q('#sync-result').hidden=true;q('#sync-execution').hidden=true;q('#sync-outgoing').hidden=true;approval=null;outgoing=null;execution=null;items=[];const result=await api('start',{direction:b.dataset.direction,scopes:[...root.querySelectorAll('[name=sync-scope]:checked')].map(c=>c.value)});uid=result.uid;const option=new Option('当前预览 · '+new Date().toLocaleString(),uid);q('#sync-history').prepend(option);q('#sync-history').value=uid;await read()}));
 q('#sync-pause').onclick=()=>{pause=true};q('#sync-resume').onclick=()=>run(async()=>{uid=q('#sync-history').value;if(!uid)throw Error('请选择预览');const result=await api('get',{uid});if(result.status==='reading'){pause=false;await api('resume',{uid});await read();}else if(result.status==='ready')show(result);else throw Error('预览已失效，请重新生成。')});
 for(const id of ['#sync-search','#sync-action','#sync-sort'])q(id).addEventListener('input',()=>{page=1;draw()});
 q('#sync-all').onclick=()=>run(async()=>{for(const x of filtered())requested.add(x.id);await choose()});q('#sync-none').onclick=()=>run(async()=>{requested.clear();await choose()});

 const proposalLabels={pending:'待接收方批准',approved:'已批准',rejected:'已拒绝',superseded:'已由新提案替换',superseded_or_unknown:'已替换或回执不在保留范围',unconfirmed:'发送结果待确认'};
 function outgoingView(value){if(value)outgoing=value;q('#sync-outgoing-info').textContent=outgoing?`第 ${outgoing.sequence||'?'} 版 · ${proposalLabels[outgoing.status]||outgoing.status}${outgoing.phase?' · 执行阶段 '+outgoing.phase:''}`:'尚未发送。'}
 function inboxView(value){pending=value?.proposal||null;q('#sync-inbox-info').textContent=pending?`第 ${pending.sequence} 版 · ${proposalLabels[pending.status]||pending.status} · 原选择 ${pending.requested_count} 项 · 接收于 ${pending.received_at}${pending.phase?' · 执行阶段 '+pending.phase:''}`:'暂无推送提案。';draw()}
 q('#sync-inbox-refresh').onclick=()=>run(async()=>inboxView(await api('proposal-inbox')));
 q('#sync-send').onclick=()=>run(async()=>{
  pause=false;let result;
  do{result=await api('proposal-send',{uid});if(result.checking){status.textContent='正在分批复核推送版本；尚未发送提案。';if(pause){status.textContent='推送复核已暂停；再次点击发送可继续。';return}}}while(result.checking);
  outgoingView(result.outgoing);status.textContent=outgoing?.status==='pending'?'提案已送达，等待对端重新预览并批准。':'已取得对端回执，状态见下方。';
 });
 q('#sync-receipt').onclick=()=>run(async()=>outgoingView((await api('proposal-status',{uid})).outgoing));
 q('#sync-review').onclick=()=>run(async()=>{const job=await api('proposal-review',{request_id:pending.request_id});uid=job.uid;q('#sync-history').prepend(new Option('审批预览 · '+new Date().toLocaleString(),uid));q('#sync-history').value=uid;q('#sync-result').hidden=true;q('#sync-execution').hidden=true;q('#sync-outgoing').hidden=true;execution=null;items=[];await read()});
 q('#sync-reject').onclick=()=>{if(confirm('拒绝当前提案？不会修改两站业务数据。'))run(async()=>{await api('proposal-reject',{request_id:pending.request_id});inboxView(await api('proposal-inbox'));status.textContent='提案已拒绝；旧提案重发不会恢复审批，来源需提交新版提案。'})};
 const scheduleForm=q('#sync-schedule');let scheduleRevision=null;
 let lastScheduleError='';
 function scheduleView(value){const currentError=value.state?.error||'';if(currentError&&currentError!==lastScheduleError)notify('后台同步暂停：'+currentError,'error',{id:'site-sync-background'});lastScheduleError=currentError;scheduleRevision=value.revision||null;const s=value.state||{};q('#sync-schedule-status').textContent=`${value.enabled?'后台已开启':'后台已关闭'} · ${value.auto_pull?'自动拉取':'仅推进已确认任务'}${s.message?' · '+s.message:''}${s.next_due?' · 下次拉取检查 '+s.next_due:''}${s.updated_at?' · 最近检查 '+s.updated_at:''}${s.task_uid?' · 任务 '+s.task_uid:''}${s.error?' · '+s.error:''}`;}
 scheduleForm.addEventListener('submit',e=>{e.preventDefault();run(async()=>{const f=new FormData(scheduleForm);scheduleView(await api('schedule-save',{revision:scheduleRevision,enabled:f.has('enabled'),auto_pull:f.has('auto_pull'),interval:Number(f.get('interval')),scopes:f.getAll('schedule-scope'),confirmation:f.get('confirmation')}));q('#sync-schedule-confirm').value='';status.textContent='后台策略已保存。';})});
 q('#sync-schedule-refresh').onclick=()=>run(async()=>scheduleView(await api('schedule-status')));
 scheduleView(JSON.parse(scheduleForm.dataset.value));
 inboxView(JSON.parse(q('#sync-inbox').dataset.value));
 q('#sync-prev').onclick=()=>{page--;draw()};q('#sync-next').onclick=()=>{page++;draw()};
}
