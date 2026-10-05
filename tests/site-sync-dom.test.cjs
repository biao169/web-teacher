const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const rawSource=fs.readFileSync('frontend/admin/static/js/native-site-sync.js','utf8').replace(/^import[^\n]+\n/gm,'');
// Existing action tests isolate the new, read-only background monitor traffic.
const source="const originalFetch=adminFetch;adminFetch=(url,opts)=>url.endsWith('/monitor')?Promise.resolve({ok:true,json:async()=>({jobs:[],server_time:'2026-01-01T00:00:00.000Z'})}):originalFetch(url,opts);\n"+rawSource;

function markup(){const r=spawnSync(process.env.TEST_PYTHON||'python3',['-B','-c',"import sys,tempfile;sys.path.insert(0,'tests');from list_fixture import client_at;from pathlib import Path\nwith tempfile.TemporaryDirectory() as root:\n c,r=client_at(Path(root));page=c.get('/admin/data-tools/sync');assert page.status_code==200;print(page.text);c.close()"],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.replace(/data-interval-ms="[0-9]+"/,'data-interval-ms="0"');}
const tick=()=>new Promise(r=>setTimeout(r,30));
test('preview UI selects dependencies and never exposes a business execute action',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 const items=[{id:'media:a',table:'media_assets',module_label:'媒体库',title:'旧图',action:'delete',fields:['名称'],dependencies:['news:n'],blocked:[],in_scope:true},{id:'news:n',table:'news',module_label:'新闻',title:'<img onerror=alert(1)>',action:'update',fields:['正文'],dependencies:[],blocked:[],in_scope:false}];
 w.adminFetch=async(url,options)=>{assert.equal(options.headers.Accept,'application/json');const op=url.split('/').pop(),data=JSON.parse(options.body);calls.push(op);let result={};if(op==='start')result={uid:'task',status:'reading'};if(op==='advance')result={uid:'task',status:'ready',direction:'pull',items,selection:{selected:[],automatic:[]}};if(op==='select')result=data.ids.length?{selected:['media:a','news:n'],automatic:['news:n'],blocked:{}}:{selected:[],automatic:[],blocked:{}};return {ok:true,json:async()=>result}};
 w.notify=()=>{};w.confirm=()=>true;w.eval(source);d.querySelector('[data-direction="pull"]').click();await tick();assert.equal(d.querySelector('#sync-result').hidden,false);assert.equal(d.querySelectorAll('#sync-rows tr').length,1);
 d.querySelector('#sync-all').click();await tick();assert.equal(d.querySelectorAll('#sync-rows tr').length,2);assert.equal(d.querySelectorAll('#sync-rows input:checked').length,2);assert.equal(d.querySelectorAll('#sync-rows input:disabled').length,1);assert.equal(d.querySelector('#sync-rows img'),null);
 d.querySelector('#sync-none').click();await tick();assert.equal(d.querySelectorAll('#sync-rows input:checked').length,0);assert.equal(d.querySelectorAll('#sync-rows tr').length,1);
 assert.match(d.querySelector('#sync-history option[value=task]').textContent,/ID: task/);
 assert.deepEqual(calls,['start','advance','select','select']);assert.match(d.querySelector('#sync-status').textContent,/没有执行/);
});

test('pull requires explicit confirmation, can pause and resumes persisted progress',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];let ticks=0;
 const items=[{id:'students:s',table:'students',module_label:'学生',title:'学生',action:'add',fields:['姓名'],dependencies:[],blocked:[],in_scope:true}];
 w.adminFetch=async(url,options)=>{const op=url.split('/').pop(),data=JSON.parse(options.body);calls.push(op);let result={};
 if(op==='start')result={uid:'task',status:'reading'};
 if(op==='advance')result={uid:'task',status:'ready',direction:'pull',items,selection:{selected:[],automatic:[]}};
 if(op==='select')result={selected:['students:s'],automatic:[],blocked:{}};
 if(op==='pull-begin'){assert.equal(data.confirmation,'从对端同步到本站');result={uid:'task',execution:{phase:'download',committed:false}}}
 if(op==='pull-tick'){ticks++;if(ticks===1)d.querySelector('#sync-pause').click();result={uid:'task',execution:{phase:ticks===1?'download':'done',committed:ticks>1,bytes:42}}}
 return {ok:true,json:async()=>result};};
 w.notify=()=>{};w.confirm=()=>true;w.eval(source);d.querySelector('[data-direction="pull"]').click();await tick();d.querySelector('#sync-all').click();await tick();assert(!calls.includes('pull-begin'));
 d.querySelector('#sync-confirm').value='从对端同步到本站';d.querySelector('#sync-begin').click();await tick();assert.equal(ticks,1);assert.match(d.querySelector('#sync-status').textContent,/暂停/);assert(d.querySelector('#sync-confirm').disabled);assert(d.querySelector('#sync-all').disabled);assert(!d.querySelector('#sync-continue').disabled);
 d.querySelector('#sync-continue').click();await tick();assert.equal(ticks,2);assert.match(d.querySelector('#sync-progress').textContent,/同步完成/);assert(d.querySelector('#sync-continue').disabled);assert(d.querySelector('#sync-begin').disabled);
});

test('incoming proposal refreshes differences and requires the approval-specific action',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://b.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 const item={id:'students:s',table:'students',module_label:'学生',title:'最新姓名',action:'add',fields:['姓名'],dependencies:[],blocked:[],in_scope:true};
 w.adminFetch=async(url,options)=>{const op=url.split('/').pop(),data=JSON.parse(options.body);calls.push(op);let result={};
 if(op==='proposal-inbox')result={proposal:{request_id:'request',sequence:7,status:'pending',requested_count:1,received_at:'2026-10-01'}};
 if(op==='proposal-review'){assert.equal(data.request_id,'request');result={uid:'review',status:'reading'}};
 if(op==='advance')result={uid:'review',status:'ready',direction:'pull',items:[item],selection:{selected:[item.id],automatic:[]},approval:{request_id:'request',sequence:7,ready:true,skipped:0}};
 if(op==='proposal-approve'){assert.equal(data.confirmation,'同意对端推送');result={uid:'review',execution:{phase:'done',committed:true}}}
 return {ok:true,json:async()=>result};};
 w.notify=()=>{};w.confirm=()=>true;w.eval(source);d.querySelector('#sync-inbox-refresh').click();await tick();assert.match(d.querySelector('#sync-inbox-info').textContent,/第 7 版/);
 d.querySelector('#sync-review').click();await tick();assert.match(d.querySelector('#sync-rows').textContent,/最新姓名/);assert(!calls.includes('proposal-approve'));
 assert.equal(d.querySelector('#sync-confirm').placeholder,'输入：同意对端推送');d.querySelector('#sync-confirm').value='同意对端推送';d.querySelector('#sync-begin').click();await tick();
 assert(calls.includes('proposal-approve'));assert(!calls.includes('pull-begin'));assert.match(d.querySelector('#sync-progress').textContent,/同步完成/);
});

test('background policy has independent scope and explicit deletion consent',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 w.adminFetch=async(url,options)=>{const op=url.split('/').pop(),data=JSON.parse(options.body);calls.push(op);
 if(op==='schedule-save'){assert.equal(data.confirmation,'允许定时拉取并同步增删');assert.deepEqual(data.scopes,['students']);assert.equal(data.interval,15);assert.equal(data.enabled,true);assert.equal(data.auto_pull,true)}
 return {ok:true,json:async()=>({enabled:true,auto_pull:true,revision:'new',state:{message:'<script>not markup</script>',task_uid:'job'}})};};
 w.notify=()=>{};w.confirm=()=>true;w.eval(source);const form=d.querySelector('#sync-schedule');assert(!form.querySelector('[name=enabled]').checked);assert.equal(calls.length,0);
 form.querySelector('[name=enabled]').checked=true;form.querySelector('[name=auto_pull]').checked=true;form.querySelector('[value=students]').checked=true;d.querySelector('#sync-interval').value='15';d.querySelector('#sync-schedule-confirm').value='允许定时拉取并同步增删';
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.deepEqual(calls,['schedule-save']);assert.equal(d.querySelector('#sync-schedule-status script'),null);assert.match(d.querySelector('#sync-schedule-status').textContent,/定时策略已开启/);
 d.querySelector('#sync-schedule-refresh').click();await tick();assert.deepEqual(calls,['schedule-save','schedule-status']);assert.equal(d.querySelector('#sync-schedule-confirm').value,'');
});

test('transport failure uses shared top notice and keeps on-page error',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,notices=[];
 w.notify=(message,state,options)=>notices.push({message,state,options});
 w.adminFetch=async()=>({ok:false,status:502,json:async()=>({error:'对端证书验证失败；诊断编号：abc',code:'sync_certificate'})});
 w.confirm=()=>true;w.eval(source);d.querySelector('#sync-test').click();await tick();
 const last=notices.at(-1);assert.equal(last.state,'error');assert.equal(last.options.id,'site-sync');assert.match(last.message,/诊断编号/);assert.match(d.querySelector('#sync-status').textContent,/证书验证失败/);
});

for(const sample of [
 {status:502,body:{detail:'Upstream timed out'},want:/Upstream timed out/},
 {status:403,body:{title:'Access denied',detail:'Cloudflare blocked',error_code:1010,instance:'abc-EWR'},want:/1010.*abc-EWR/},
 {status:422,body:{detail:[{msg:'missing',input:'must-not-display'}]},want:/请求参数校验失败/},
 {status:500,body:{error:{message:'服务端诊断编号：sample'}},want:/服务端诊断编号：sample/},
 {status:502,body:null,want:/未提供错误详情/},
 {status:502,invalid:true,want:/不是有效JSON/}
])test('sync error retains HTTP and safe details '+JSON.stringify(sample),async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 w.notify=()=>{};
 w.adminFetch=async()=>({ok:false,status:sample.status,headers:{get:()=>null},json:async()=>{if(sample.invalid)throw Error('HTML');return sample.body;}});
 w.confirm=()=>true;w.eval(source);d.querySelector('#sync-test').click();await tick();
 const text=d.querySelector('#sync-status').textContent;
 assert.match(text,new RegExp('HTTP '+sample.status));assert.match(text,/阶段：test/);assert.match(text,sample.want);assert(!text.includes('must-not-display'));
});

test('successful connection clearly excludes business data validation',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 w.notify=()=>{};w.adminFetch=async url=>{calls.push(url.split('/').pop());return {ok:true,json:async()=>({protocol:2,data_check:1,site_id:'peer'})};};
 w.confirm=()=>true;w.eval(source);d.querySelector('#sync-test').click();await tick();
 assert.deepEqual(calls,['test']);assert.match(d.querySelector('#sync-status').textContent,/尚未读取或校验业务数据/);
});

for(const direction of ['pull','push'])test(direction+' verification pauses before mutation and resumes from the same action',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;let checks=0;
 const item={id:'students:s',table:'students',module_label:'学生',title:'学生',action:'add',fields:['姓名'],dependencies:[],blocked:[],in_scope:true};
 const opWanted=direction==='pull'?'pull-begin':'proposal-send',button=direction==='pull'?'#sync-begin':'#sync-send';
 w.notify=()=>{};w.adminFetch=async(url,options)=>{
  const op=url.split('/').pop(),data=JSON.parse(options.body);let result={};
  if(op==='start')result={uid:'task',status:'reading'};
  if(op==='advance')result={uid:'task',status:'ready',direction,items:[item],selection:{selected:[item.id],automatic:[]}};
  if(op===opWanted){checks++;assert.equal(data.uid,'task');if(direction==='pull')assert.equal(data.confirmation,'从对端同步到本站');
   if(checks===1){d.querySelector('#sync-pause').click();result={checking:true}}
   else if(checks===2)result={checking:true};
   else result=direction==='pull'?{execution:{phase:'done',committed:true}}:{outgoing:{status:'pending',sequence:1}};
  }
  return {ok:true,json:async()=>result};
 };
 w.confirm=()=>true;w.eval(source);d.querySelector('[data-direction="'+direction+'"]').click();await tick();
 d.querySelector('#sync-confirm').value='从对端同步到本站';d.querySelector(button).click();await tick();
 assert.equal(checks,1);assert.match(d.querySelector('#sync-status').textContent,/复核已暂停/);assert(!d.querySelector(button).disabled);
 d.querySelector(button).click();await tick();assert.equal(checks,3);assert.doesNotMatch(d.querySelector('#sync-status').textContent,/复核已暂停/);
});

test('low-load pacing waits between requests and pause prevents the next batch',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 d.querySelector('#site-sync').dataset.intervalMs='1000';let advances=0,waiting;
 w.setTimeout=fn=>{waiting=fn;return 1};w.notify=()=>{};
 w.adminFetch=async url=>{
  const op=url.split('/').pop();let result={uid:'task',status:'reading'};
  if(op==='advance'){advances++;result={...result,phase:'content',count:5,work:{phase:'content',completed_steps:1,count:5,completed_at:'saved'}}}
  return {ok:true,json:async()=>result};
 };
 w.confirm=()=>true;w.eval(source);d.querySelector('[data-direction="pull"]').click();await tick();
 assert.equal(advances,1);assert.equal(typeof waiting,'function');assert.match(d.querySelector('#sync-checkpoint').textContent,/已保存步骤 1/);
 d.querySelector('#sync-pause').click();waiting();await tick();
 assert.equal(advances,1);assert.match(d.querySelector('#sync-status').textContent,/已暂停/);
});

for(const scenario of ['transient','permanent','pause'])test('bounded recovery: '+scenario,async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());
 const w=dom.window,d=w.document,calls=[];let attempts=0;
 d.querySelector('#site-sync').dataset.retrySeconds=JSON.stringify(scenario==='pause'?[.15,.15,.15]:[.001,.002,.003]);
 w.adminFetch=async(url)=>{const op=url.split('/').pop();calls.push(op);
  if(op==='start')return {ok:true,json:async()=>({uid:'retry-task',status:'reading'})};
  if(op==='get')return {ok:true,json:async()=>({uid:'retry-task',status:'reading',work:{status:'saved',completed_steps:2}})};
  if(op==='advance'){attempts++;return {ok:false,status:scenario==='permanent'?403:503,json:async()=>({error:'test failure'})}};
  throw Error('unexpected '+op);
 };
 w.notify=()=>{};w.confirm=()=>true;w.eval(source);d.querySelector('[data-direction="pull"]').click();await tick();
 if(scenario==='pause'){d.querySelector('#sync-pause').click();await new Promise(r=>setTimeout(r,200));assert.equal(attempts,1)}
 else if(scenario==='transient'){for(let i=0;i<20&&attempts<9;i++)await tick();assert.equal(attempts,9);assert.equal(calls.filter(x=>x==='get').length,9);await tick();assert.equal(attempts,9)}
 else{assert.equal(attempts,1);assert(!calls.includes('get'))}
 assert.match(d.querySelector('#sync-status').textContent,scenario==='pause'?/暂停/:/HTTP/);
});

test('restart creates fresh preview without silently confirming it',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());
 const w=dom.window,d=w.document,calls=[];
 w.confirm=()=>true;w.notify=()=>{};
 w.adminFetch=async(url,options)=>{const op=url.split('/').pop(),data=JSON.parse(options.body);calls.push(op);
  if(op==='start')return {ok:true,json:async()=>({uid:'old',status:'reading'})};
  if(op==='restart'){assert.equal(data.uid,'old');return {ok:true,json:async()=>({uid:'new',status:'reading'})}}
  if(op==='get'||op==='advance')return {ok:true,json:async()=>({uid:data.uid,status:'ready',direction:'pull',items:[],selection:{selected:[],automatic:[]}})};
  throw Error('unexpected '+op);
 };
 w.confirm=()=>true;w.eval(source);d.querySelector('[data-direction="pull"]').click();await tick();
 d.querySelector('#sync-restart').click();await tick();
 assert.equal(d.querySelector('#sync-history').value,'new');assert(calls.includes('restart'));assert(!calls.includes('pull-begin'));assert.equal(d.querySelector('#sync-confirm').value,'');
});

test('brief preview pages on server, preserves cross-page choices and only prepares after clicking',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];let chosen=[];
 const item=i=>({id:'students:'+i,uid:String(i),table:'students',module_label:'学生',title:'Candidate '+i,action:'update',fields:[],dependencies:[],blocked:[],in_scope:true,candidate:true});
 w.notify=()=>{};w.adminFetch=async(url,options)=>{
  const op=url.split('/').pop(),data=JSON.parse(options.body);calls.push({op,data});let result={};
  if(op==='start')result={uid:'brief',status:'reading'};
  if(op==='advance')result=data.uid==='brief'?{uid:'brief',status:'ready',direction:'pull',lightweight:true,items:[item(1)],next:['@candidate:students','1'],candidate_count:2,selection:{selected:[],automatic:[]}}:{uid:'prepared',status:'ready',direction:'pull',lightweight:true,prepared:true,incremental:true,items:[item(1),item(2)],selection:{selected:chosen,automatic:[]}};
  if(op==='get'){assert.equal(data.uid,'brief');const second=!!data.after?.[0];result={lightweight:true,items:[item(second?2:1)],next:second?null:['@candidate:students','1'],candidate_count:2}}
  if(op==='select'){chosen=data.ids;result={selected:chosen,automatic:[],blocked:{}}}
  if(op==='prepare-preview')result={uid:'prepared',status:'reading'};
  if(op==='pull-begin'){assert.equal(data.confirmation,'从对端同步到本站');result={uid:'prepared',execution:{phase:'done',committed:true,applied:2}}}
  return {ok:true,json:async()=>result};
 };
 w.confirm=()=>true;w.eval(source);d.querySelector('[data-direction="pull"]').click();await tick();
 assert.equal(d.querySelectorAll('#sync-rows tr').length,1);assert.match(d.querySelector('#sync-rows').textContent,/覆盖候选/);
 assert(d.querySelector('#sync-execution').hidden);assert(d.querySelector('#sync-sort').disabled);
 d.querySelector('#sync-rows input').click();await tick();d.querySelector('#sync-next').click();await tick();
 assert.match(d.querySelector('#sync-rows').textContent,/Candidate 2/);d.querySelector('#sync-rows input').click();await tick();
 assert.deepEqual(chosen,['students:1','students:2']);assert(!calls.some(x=>x.op==='pull-begin'||x.op==='prepare-preview'));
 d.querySelector('#sync-prepare').click();await tick();
 assert(calls.some(x=>x.op==='prepare-preview'));assert(!calls.some(x=>x.op==='pull-begin'));
 assert.equal(d.querySelector('#sync-execution').hidden,false);assert(d.querySelector('#sync-prepare').hidden);
 assert(d.querySelector('#sync-all').disabled);assert([...d.querySelectorAll('#sync-rows input')].every(x=>x.disabled));
 d.querySelector('#sync-confirm').value='从对端同步到本站';d.querySelector('#sync-begin').click();await tick();
 assert.equal(calls.filter(x=>x.op==='pull-begin').length,1);assert.match(d.querySelector('#sync-progress').textContent,/已逐条提交 2 条/);
});

test('prepared incremental approval allows subset selection and displays step time',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://b.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 const items=['one','two'].map(k=>({id:'students:'+k,uid:k,table:'students',module_label:'学生',title:k,action:'add',fields:[],dependencies:[],blocked:[],in_scope:true}));
 w.notify=()=>{};w.adminFetch=async(url,options)=>{const op=url.split('/').pop(),data=JSON.parse(options.body);calls.push({op,data});let value={};
 if(op==='proposal-inbox')value={proposal:{request_id:'request',status:'pending',requested_count:2}};
 if(op==='proposal-review')value={uid:'review',status:'reading'};
 if(op==='advance')value={uid:'review',status:'ready',direction:'pull',lightweight:true,prepared:true,incremental:true,approval:{ready:true,skipped:0},items,selection:{selected:items.map(x=>x.id),automatic:[]},work:{phase:'complete',elapsed_ms:12}};
 if(op==='select')value={selected:data.ids,automatic:[],blocked:{}};
 return {ok:true,json:async()=>value};};w.confirm=()=>true;w.eval(source);
 d.querySelector('#sync-inbox-refresh').click();await tick();d.querySelector('#sync-review').click();await tick();
 const boxes=d.querySelectorAll('#sync-rows input[type=checkbox]');assert.equal(boxes.length,2);assert.equal(boxes[0].disabled,false);assert.equal(d.querySelector('#sync-prepare').hidden,true);
 assert.match(d.querySelector('#sync-checkpoint').textContent,/12 ms/);
 boxes[0].checked=false;boxes[0].dispatchEvent(new w.Event('change'));await tick();
 assert.deepEqual(calls.filter(c=>c.op==='select').at(-1).data.ids,['students:two']);assert(!calls.some(c=>c.op==='proposal-approve'));
 assert.equal(d.querySelector('#sync-confirm').placeholder,'输入：同意对端推送');
});

for(const stopped of ['pause','failure'])test('preparation '+stopped+' cannot enable proposal send',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 const item={id:'students:one',uid:'one',table:'students',module_label:'学生',title:'one',action:'add',fields:[],dependencies:[],blocked:[],in_scope:true};
 w.notify=()=>{};w.adminFetch=async(url,options)=>{const op=url.split('/').pop(),data=JSON.parse(options.body);calls.push(op);let value={};
 if(op==='start')value={uid:'parent',status:'reading'};
 if(op==='advance'&&data.uid==='parent')value={uid:'parent',status:'ready',direction:'push',lightweight:true,items:[item],selection:{selected:[item.id],automatic:[]}};
 if(op==='prepare-preview')value={uid:'child',status:'reading'};
 if(op==='advance'&&data.uid==='child'){
  if(stopped==='failure')return {ok:false,status:409,json:async()=>({error:'来源变化',code:'sync_conflict'})};
  d.querySelector('#sync-pause').click();value={uid:'child',status:'reading',phase:'selected-load'};
 }
 return {ok:true,json:async()=>value};};w.confirm=()=>true;w.eval(source);
 d.querySelector('[data-direction=push]').click();await tick();d.querySelector('#sync-prepare').click();await tick();
 assert.equal(d.querySelector('#sync-send').disabled,true);assert.equal(d.querySelector('#sync-outgoing').hidden,true);
 d.querySelector('#sync-send').click();await tick();assert(!calls.includes('proposal-send'));
});

test('opening original preview follows prepared child without sending',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 const item={id:'students:one',uid:'one',table:'students',module_label:'学生',title:'one',action:'add',fields:[],dependencies:[],blocked:[],in_scope:true};
 w.notify=()=>{};w.adminFetch=async(url,options)=>{const op=url.split('/').pop(),data=JSON.parse(options.body);calls.push({op,data});let result={};
 if(op==='get')result=data.uid==='parent'?{uid:'parent',status:'ready',prepared_uid:'child'}:{uid:'child',status:'ready',direction:'push',lightweight:true,prepared:true,items:[item],selection:{selected:[item.id],automatic:[]}};
 if(op==='proposal-send')result={outgoing:{status:'pending'}};
 return {ok:true,json:async()=>result};};w.confirm=()=>true;w.eval(source);
 const history=d.querySelector('#sync-history');history.append(new w.Option('Original','parent'));history.value='parent';d.querySelector('#sync-resume').click();await tick();
 assert.equal(history.value,'child');assert(!calls.some(c=>c.op==='proposal-send'));assert.equal(d.querySelector('#sync-send').disabled,false);
 d.querySelector('#sync-send').click();await tick();assert.equal(calls.find(c=>c.op==='proposal-send').data.uid,'child');
});

test('stale send preparation error opens child and requires another explicit click',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 const item={id:'students:one',uid:'one',table:'students',module_label:'学生',title:'one',action:'add',fields:[],dependencies:[],blocked:[],in_scope:true};
 w.notify=()=>{};w.adminFetch=async(url,options)=>{const op=url.split('/').pop(),data=JSON.parse(options.body);calls.push({op,data});let result={};
 if(op==='start')result={uid:'parent',status:'reading'};
 if(op==='advance')result={uid:'parent',status:'ready',direction:'push',items:[item],selection:{selected:[item.id],automatic:[]}};
 if(op==='proposal-send'&&data.uid==='parent')return {ok:false,status:409,json:async()=>({error:'请先准备所选内容',code:'sync_prepare_required'})};
 if(op==='get')result=data.uid==='parent'?{uid:'parent',status:'ready',prepared_uid:'child'}:{uid:'child',status:'ready',direction:'push',lightweight:true,prepared:true,items:[item],selection:{selected:[item.id],automatic:[]}};
 return {ok:true,json:async()=>result};};w.confirm=()=>true;w.eval(source);
 d.querySelector('[data-direction=push]').click();await tick();d.querySelector('#sync-send').click();await tick();
 assert.equal(calls.filter(c=>c.op==='proposal-send').length,1);assert.equal(d.querySelector('#sync-history').value,'child');assert.match(d.querySelector('#sync-status').textContent,/再次确认/);
});

for(const action of ['pull','push','schedule'])test('dialog cancel prevents '+action+' and no typed confirmation is visible',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 const item={id:'students:one',uid:'one',table:'students',module_label:'学生',title:'one',action:'add',fields:[],dependencies:[],blocked:[],in_scope:true};
 w.notify=()=>{};w.adminFetch=async(url,options)=>{const op=url.split('/').pop();calls.push(op);let value={};if(op==='start')value={uid:'ready',status:'reading'};if(op==='advance')value={uid:'ready',status:'ready',direction:action,items:[item],selection:{selected:[item.id],automatic:[]}};return {ok:true,json:async()=>value}};
 w.eval(source);let dialogs=0;w.confirm=()=>{dialogs++;return false};
 assert.equal(d.querySelector('#sync-confirm').type,'hidden');assert.equal(d.querySelector('#sync-schedule-confirm').type,'hidden');
 if(action==='schedule'){const form=d.querySelector('#sync-schedule');form.querySelector('[name=enabled]').checked=true;form.querySelector('[name=auto_pull]').checked=true;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}))}
 else{d.querySelector('[data-direction='+action+']').click();await tick();d.querySelector(action==='pull'?'#sync-begin':'#sync-send').click()}
 await tick();assert.equal(dialogs,1);assert(!calls.some(x=>['pull-begin','proposal-send','schedule-save'].includes(x)));
});

test('history deletion is confirmed and drains bounded steps',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];let dialogs=0;
 w.notify=()=>{};w.confirm=()=>{dialogs++;return true};w.adminFetch=async(url,options)=>{const data=JSON.parse(options.body);calls.push({op:url.split('/').pop(),data});return {ok:true,json:async()=>({more:calls.length<2,deleted:calls.length===2,jobs:[]})}};
 w.eval(source);const select=d.querySelector('#sync-history');select.append(new w.Option('Old','old'));select.value='old';d.querySelector('#sync-history-delete').click();await tick();
 assert.equal(dialogs,1);assert.equal(calls.length,2);assert(calls.every(x=>x.op==='history-delete'&&x.data.uid==='old'&&x.data.confirmed===true));assert.match(d.querySelector('#sync-status').textContent,/历史记录已删除/);
});


test('monitor displays checkpoints safely and viewing does not advance',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 w.notify=()=>{};w.adminFetch=async(url,options)=>{const op=url.split('/').pop();calls.push(op);return {ok:true,json:async()=>op==='monitor'?{jobs:[{uid:'job',status:'reading',direction:'pull',phase:'latest',work_status:'paused',retryable:true,retry_after:'2099-01-01T00:00:00.000Z',error:'<img src=x onerror=alert(1)>',steps:3,count:4}],server_time:'2026-01-01T00:00:00.000Z'}:{uid:'job',status:'reading',direction:'pull',lightweight:true,items:[],selection:{selected:[],automatic:[]}}}};
 w.eval(rawSource);await tick();assert.match(d.querySelector('#sync-monitor-rows').textContent,/等待重试/);assert.equal(d.querySelector('#sync-monitor-rows img'),null);
 d.querySelector('#sync-monitor-rows button').click();await tick();assert.deepEqual(calls,['monitor','get']);assert.match(d.querySelector('#sync-status').textContent,/尚未推进/);
});
test('monitor failure keeps automatic refresh and preserves task UI',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 w.notify=()=>{};w.adminFetch=async()=>({ok:false,status:503,json:async()=>({error:'temporary failure'})});w.eval(rawSource);await tick();
 assert.equal(d.querySelector('#sync-monitor-auto').checked,true);assert.match(d.querySelector('#sync-monitor-info').textContent,/60秒后自动重试/);
 assert.equal(d.querySelector('#sync-result').hidden,true);
});
test('monitor page cursor is forwarded without loading full tasks',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,seen=[];
 w.notify=()=>{};w.adminFetch=async(url,options)=>{assert(url.endsWith('/monitor'));const data=JSON.parse(options.body);seen.push(data);return {ok:true,json:async()=>({jobs:[],next:seen.length===1?['stamp','uid']:null,server_time:'2026-01-01T00:00:00.000Z'})}};w.eval(rawSource);await tick();d.querySelector('#sync-monitor-next').click();await tick();
 assert.deepEqual(seen.map(v=>v.after),[null,['stamp','uid']]);assert.match(d.querySelector('#sync-monitor-page').textContent,/第2页/);
});

test('monitor distinguishes retry, uncertain receipts and terminal states with parent links',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 const jobs=[
  {uid:'running',work_status:'running',recover_after:'2026-01-01T00:05:00Z'},
  {uid:'overdue',work_status:'running',recover_after:'2025-12-31T23:59:00Z'},
  {uid:'retry',work_status:'paused',retryable:true,retry_after:'2026-01-01T00:05:00Z'},
  {uid:'due',work_status:'paused',retryable:true,retry_after:'2025-12-31T23:59:00Z'},
  {uid:'paused',work_status:'paused',retryable:false},
  {uid:'done',execution_phase:'done',work_status:'saved'},
  {uid:'child',parent_uid:'parent',operation:'advance',work_phase:'selected-load',completed_at:'2025-12-31T23:58:00Z'},
  {uid:'expired',status:'expired'},
  {uid:'preview-done',status:'ready',phase:'done'}
 ].map(j=>({status:'reading',direction:'pull',...j}));
 w.notify=()=>{};w.adminFetch=async()=>({ok:true,json:async()=>({jobs,server_time:'2026-01-01T00:00:00Z'})});w.eval(rawSource);await tick();
 const rows=[...d.querySelectorAll('#sync-monitor-rows tr')];
 ['等待完成回执','回执逾期','等待重试','重试时间已到','需人工处理','已完成','父任务：parent','已失效','待确认 / 待审批'].forEach((label,i)=>assert(rows[i].textContent.includes(label)));
 assert.match(rows[6].textContent,/准备条目及依赖.*推进预览/);assert.match(rows[6].textContent,/2分钟前/);
 assert.match(d.querySelector('#sync-monitor-summary').textContent,/已完成 1 项/);
 // A subsequent unrelated UI action must not re-enable expired task links.
 d.querySelector('#sync-test').click();await tick();assert(rows[7].querySelector('button').disabled);
});

test('latest tasks button resets history cursor and monitor serializes refreshes',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,seen=[];let release;
 w.notify=()=>{};w.adminFetch=async(url,options)=>{assert(url.endsWith('/monitor'));seen.push(JSON.parse(options.body));if(seen.length===2)await new Promise(r=>release=r);return {ok:true,json:async()=>({jobs:[],next:['stamp','uid'],server_time:'2026-01-01T00:00:00Z'})}};
 w.eval(rawSource);await tick();d.querySelector('#sync-monitor-next').click();await tick();d.querySelector('#sync-monitor-refresh').click();assert.equal(seen.length,2);release();await tick();
 assert.match(d.querySelector('#sync-monitor-info').textContent,/历史分页/);d.querySelector('#sync-monitor-latest').click();await tick();
 assert.deepEqual(seen.map(v=>v.after),[null,['stamp','uid'],null]);assert.match(d.querySelector('#sync-monitor-page').textContent,/第1页/);
});

test('failed history page load keeps the displayed page cursor for retry',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,seen=[];
 w.notify=()=>{};w.adminFetch=async(url,options)=>{seen.push(JSON.parse(options.body));return seen.length===2?{ok:false,status:503,json:async()=>({error:'offline'})}:{ok:true,json:async()=>({jobs:[],next:['stamp','uid'],server_time:'2026-01-01T00:00:00Z'})}};
 w.eval(rawSource);await tick();d.querySelector('#sync-monitor-next').click();await tick();assert.match(d.querySelector('#sync-monitor-page').textContent,/第1页/);
 d.querySelector('#sync-monitor-refresh').click();await tick();assert.deepEqual(seen.map(v=>v.after),[null,['stamp','uid'],null]);
});

test('all sync views use the same explicit timezone and complete task IDs',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 const stamp='2026-01-01T20:00:00Z';w.localStorage.setItem('teacher-admin-timezone-v1','Asia/Shanghai');
 const option=d.createElement('option');option.value='history-full-id';option.dataset.createdAt=stamp;option.dataset.status='reading';d.querySelector('#sync-history').append(option);
 d.querySelector('#sync-schedule').dataset.value=JSON.stringify({state:{updated_at:stamp,next_due:stamp,preview_uid:'preview-full-id',task_uid:'execute-full-id'}});
 d.querySelector('#sync-inbox').dataset.value=JSON.stringify({proposal:{request_id:'proposal-full-id',review_uid:'review-full-id',task_uid:'execute-full-id',received_at:stamp,status:'pending'}});
 w.adminFetch=async()=>({ok:true,json:async()=>({jobs:[{uid:'history-full-id',status:'reading',created_at:stamp,checkpoint_version:1,progress_events:2,total_failures:3,stalled_attempts:1}],server_time:stamp})});w.notify=()=>{};w.eval(rawSource);await tick();
 for(const text of [option.textContent,d.querySelector('#sync-schedule-status').textContent,d.querySelector('#sync-inbox-info').textContent,d.querySelector('#sync-monitor-rows').textContent]){
  assert.match(text,/2026\/01\/02 04:00:00 GMT\+08:00 \[Asia\/Shanghai\]/);assert.match(text,/ID:/);
 }
 assert.match(d.querySelector('#sync-schedule-status').textContent,/preview-full-id.*execute-full-id/);
 assert.match(d.querySelector('#sync-monitor-rows').textContent,/有效进展 2 次.*累计请求异常 3 次.*连续无进展 1 次/);
});

test('monitor explains automatic cooldown and manual work without advancing either',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 const deadline='2026-01-01T20:00:00Z';
 w.adminFetch=async url=>{calls.push(url);return {ok:true,json:async()=>({server_time:'2026-01-01T19:00:00Z',jobs:[
  {uid:'auto-child',parent_uid:'auto-parent',status:'ready',execution_phase:'download',work_status:'paused',retryable:true,retry_after:deadline,advance_mode:'background',wait_reason:'retry_wait',next_attempt_at:deadline},
  {uid:'manual-preview',status:'ready',advance_mode:'manual',wait_reason:'ready'}
 ],schedule:{enabled:true,auto_pull:true,wait_reason:'retry_wait',next_attempt_at:deadline,current_task:{uid:'auto-child',parent_uid:'auto-parent'},state:{preview_uid:'auto-parent',task_uid:'auto-child'}}})}};
 w.notify=()=>{};w.eval(rawSource);await tick();
 const rows=[...d.querySelectorAll('#sync-monitor-rows tr')];
 assert.match(rows[0].textContent,/由后台自动推进.*等待冷却后重试/);
 assert.match(rows[0].textContent,/后台最早恢复 2026\/01\/02 04:00:00 GMT\+08:00 \[Asia\/Shanghai\]/);
 assert.match(rows[1].textContent,/需人工确认或继续/);
 const schedule=d.querySelector('#sync-schedule-status').textContent;
 assert.match(schedule,/当前推进任务 ID: auto-child.*父任务 ID: auto-parent/);
 assert.match(schedule,/最早恢复时间.*到期后下一轮调度/);
 assert(calls.every(url=>url.endsWith('/monitor')));
});

test('manual task monitor pauses and resumes independent background grant',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];let enabled=true;
 w.notify=()=>{};w.adminFetch=async(url,opts)=>{
  const op=url.split('/').pop();calls.push(op);
  if(op==='manual-pause')enabled=false;
  if(op==='resume')enabled=true;
  return {ok:true,json:async()=>op==='monitor'?{jobs:[{uid:'manual-id',status:'reading',work_status:'saved',manual_mode:'read',manual_enabled:enabled,advance_mode:enabled?'background':'manual'}],server_time:'2026-01-01T00:00:00Z'}:{uid:'manual-id'}};
 };
 w.eval(rawSource);await tick();
 let buttons=d.querySelectorAll('#sync-monitor-rows button');assert.equal(buttons[1].textContent,'暂停后台');buttons[1].click();await tick();
 buttons=d.querySelectorAll('#sync-monitor-rows button');assert.equal(buttons[1].textContent,'恢复后台');buttons[1].click();await tick();
 assert(calls.includes('manual-pause')&&calls.includes('resume'));assert(!calls.includes('pull-tick')&&!calls.includes('schedule-save'));
});

test('overdue work receipt and scheduler failure are both visible',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 const stamp='2026-01-01T00:00:00Z';w.notify=()=>{};
 w.adminFetch=async()=>({ok:true,json:async()=>({server_time:stamp,jobs:[
  {uid:'stuck',status:'reading',work_status:'running',recover_after:'2025-12-31T00:00:00Z',scheduler:{stage:'initialize',started_at:stamp,error:'后台初始化失败',error_code:'1102',retry_after:'2026-01-01T00:10:00Z'}},
  {uid:'slow',status:'reading',work_status:'paused',retryable:true,slow_retry:true,retry_after:'2026-01-01T01:00:00Z'}
 ],schedule:{scheduler:{arrived_at:stamp},state:{}}})});
 w.eval(rawSource);await tick();const rows=[...d.querySelectorAll('#sync-monitor-rows tr')];
 assert.match(rows[0].textContent,/回执逾期.*后台初始化失败.*1102.*最早再检查/);
 assert.match(rows[1].textContent,/后台低频重试/);
 assert.match(d.querySelector('#sync-monitor-info').textContent,/最近后台调度到达/);
});

test('initialization timeline separates missing receipts, elapsed time and previous round',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 const stamp='2026-01-01T00:00:00Z';w.notify=()=>{};w.localStorage.setItem('teacher-admin-timezone-v1','Asia/Shanghai');
 w.adminFetch=async url=>{calls.push(url);return {ok:true,json:async()=>({server_time:stamp,jobs:[{uid:'task-phase',status:'reading',work_status:'running',scheduler:{initialization:{version:1,stages:[
  {phase:'resource_modules',status:'completed',started_at:stamp,finished_at:stamp,elapsed_ms:12.5,module_cached:false},
  {phase:'authorization',status:'running',started_at:stamp}
 ]},previous_initialization:{last_stage:{phase:'resource_factory',status:'failed',started_at:stamp,exception_type:'<img src=x onerror=alert(1)>'}}}}]})}};
 w.eval(rawSource);await tick();const details=d.querySelector('#sync-monitor-rows details');assert(details);
 assert.match(details.querySelector('summary').textContent,/核实授权.*未收到阶段完成记录/);
 assert.match(details.textContent,/12.5 ms.*模块首次加载/);
 assert.match(details.textContent,/2026\/01\/01 08:00:00 GMT\+08:00 \[Asia\/Shanghai\]/);
 assert.match(details.textContent,/不是 CPU 用时/);assert.match(details.textContent,/上一轮最后阶段：创建同步最小资源对象/);
 assert(!details.querySelector('img'));assert(calls.every(url=>url.endsWith('/monitor')));
});

test('latest-preview minimal initialization route has clear monitor labels',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 const stamp='2026-01-01T00:00:00Z';w.notify=()=>{};
 w.adminFetch=async()=>({ok:true,json:async()=>({server_time:stamp,jobs:[{uid:'latest-task',status:'reading',scheduler:{initialization:{stages:['latest_gate','latest_modules','latest_resources'].map(phase=>({phase,status:'completed',started_at:stamp,finished_at:stamp,elapsed_ms:1}))}}}]})});
 w.eval(rawSource);await tick();const text=d.querySelector('#sync-monitor-rows details').textContent;
 assert.match(text,/检查候选读取专用路径/);assert.match(text,/加载候选读取组件/);assert.match(text,/创建候选读取最小上下文/);
});

test('monitor failure retains automatic retries instead of disabling the checkbox',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 w.notify=()=>{};w.adminFetch=async()=>({ok:false,status:503,json:async()=>({code:'worker_request_failed',error:'temporary'})});
 w.eval(rawSource);await tick();
 assert(d.querySelector('#sync-monitor-auto').checked);
 assert.match(d.querySelector('#sync-monitor-info').textContent,/60秒后自动重试/);
});

test('stale worker scheduler wakes only once and renders Cron and missing phase information',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 Object.defineProperty(d,'hidden',{value:false,configurable:true});w.notify=()=>{};
 w.adminFetch=async url=>{calls.push(url);return {ok:true,json:async()=>url.endsWith('/wake')?{status:'ok'}:{browser_wake_available:true,runtime_version:'0.15.174',server_time:'2026-10-05T05:00:00Z',cron:{arrived_at:'2026-10-05T04:00:00Z',status:'failed',error_type:'RuntimeError'},schedule:{scheduler:{arrived_at:'2026-10-05T04:00:00Z'}},jobs:[{uid:'task',status:'reading',advance_mode:'background',preparation_stage:'normalize',scheduler:{started_at:'2026-10-05T04:00:00Z'}}]}}};
 w.eval(rawSource);await tick();
 assert.equal(calls.filter(x=>x.endsWith('/wake')).length,1);
 assert.match(d.querySelector('#sync-monitor-info').textContent,/服务端版本 0.15.174.*最近 Cron 到达.*超过3分钟/);
 assert.match(d.querySelector('#sync-monitor-rows').textContent,/此轮未记录阶段明细/);
 assert.match(d.querySelector('#sync-monitor-rows').textContent,/准备写入字段/);
 d.querySelector('#sync-monitor-refresh').click();await tick();
 assert.equal(calls.filter(x=>x.endsWith('/wake')).length,1);
});

test('monitor never wakes paused tasks or a healthy scheduler',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 Object.defineProperty(d,'hidden',{value:false,configurable:true});w.notify=()=>{};
 let active=false;
 w.adminFetch=async url=>{calls.push(url);return {ok:true,json:async()=>({browser_wake_available:true,runtime_version:'0.15.174',server_time:'2026-10-05T05:00:00Z',schedule:{scheduler:{arrived_at:active?'2026-10-05T05:00:00Z':'2026-10-05T04:00:00Z'}},jobs:[{uid:'task',status:'reading',advance_mode:active?'background':'manual'}]})}};
 w.eval(rawSource);await tick();active=true;d.querySelector('#sync-monitor-refresh').click();await tick();
 assert(calls.every(x=>x.endsWith('/monitor')));
});

test('Cron preflight is shown as waiting for a separate business round',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 w.notify=()=>{};w.adminFetch=async()=>({ok:true,json:async()=>({runtime_version:'0.15.175',server_time:'2026-10-05T06:00:00Z',jobs:[{uid:'preflight',status:'reading',advance_mode:'background',scheduler:{stage:'finished',result:'prepared',started_at:'2026-10-05T05:59:00Z',finished_at:'2026-10-05T05:59:01Z'}}]})});
 w.eval(rawSource);await tick();
 assert.match(d.querySelector('#sync-monitor-rows').textContent,/预检查完成，等待下一轮业务推进/);
 assert.match(d.querySelector('#sync-monitor-info').textContent,/服务端版本 0.15.175/);
});

test('long field checkpoint shows saved character offset without field contents',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 w.notify=()=>{};w.adminFetch=async()=>({ok:true,json:async()=>({runtime_version:'0.15.176',server_time:'2026-10-05T06:00:00Z',jobs:[{uid:'fields',status:'reading',field_stage:'chunks',field_name:'content',field_offset:512,field_total:6002}]})});
 w.eval(rawSource);await tick();
 assert.match(d.querySelector('#sync-monitor-rows').textContent,/长字段分片：content · 512 \/ 6002 JSON 字符 · 读取并保存/);
});

test('media verification renders durable offset and per-step budget',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 w.notify=()=>{};w.adminFetch=async()=>({ok:true,json:async()=>({runtime_version:'0.15.177',server_time:'2026-10-05T06:00:00Z',jobs:[{uid:'media',status:'ready',media_stage:'verify-assembled',media_verify_offset:8192,media_verify_size:21000,media_verify_block:1024}]})});
 w.eval(rawSource);await tick();
 assert.match(d.querySelector('#sync-monitor-rows').textContent,/媒体恢复步骤：校验暂存文件 · 已校验 8192 \/ 21000 字节 · 校验每步最多 1024 字节/);
});

test('three hour patrol has separate health and never hides stale minute cron',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 w.notify=()=>{};w.adminFetch=async()=>({ok:true,json:async()=>({runtime_version:'0.15.178',server_time:'2026-10-05T06:00:00Z',jobs:[],cron:{arrived_at:'2026-10-05T05:00:00Z',status:'finished'},watchdog:{arrived_at:'2026-10-05T06:00:00Z',status:'finished',result:'prepared'},schedule:{scheduler:{arrived_at:'2026-10-05T06:00:00Z',source:'worker-watchdog'}}})});
 w.eval(rawSource);await tick();const text=d.querySelector('#sync-monitor-info').textContent;
 assert.match(text,/最近三小时恢复巡检.*预检查完成/);
 assert.match(text,/分钟 Cron 超过3分钟未到达/);
 assert.match(text,/（三小时巡检）/);
});
