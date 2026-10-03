const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const source=fs.readFileSync('frontend/admin/static/js/native-site-sync.js','utf8').replace(/^import[^\n]+\n/gm,'');
function markup(){const r=spawnSync(process.env.TEST_PYTHON||'python3',['-B','-c',"import sys,tempfile;sys.path.insert(0,'tests');from list_fixture import client_at;from pathlib import Path\nwith tempfile.TemporaryDirectory() as root:\n c,r=client_at(Path(root));page=c.get('/admin/data-tools/sync');assert page.status_code==200;print(page.text);c.close()"],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.replace(/data-interval-ms="[0-9]+"/,'data-interval-ms="0"');}
const tick=()=>new Promise(r=>setTimeout(r,30));
test('preview UI selects dependencies and never exposes a business execute action',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 const items=[{id:'media:a',table:'media_assets',module_label:'媒体库',title:'旧图',action:'delete',fields:['名称'],dependencies:['news:n'],blocked:[],in_scope:true},{id:'news:n',table:'news',module_label:'新闻',title:'<img onerror=alert(1)>',action:'update',fields:['正文'],dependencies:[],blocked:[],in_scope:false}];
 w.adminFetch=async(url,options)=>{assert.equal(options.headers.Accept,'application/json');const op=url.split('/').pop(),data=JSON.parse(options.body);calls.push(op);let result={};if(op==='start')result={uid:'task',status:'reading'};if(op==='advance')result={uid:'task',status:'ready',direction:'pull',items,selection:{selected:[],automatic:[]}};if(op==='select')result=data.ids.length?{selected:['media:a','news:n'],automatic:['news:n'],blocked:{}}:{selected:[],automatic:[],blocked:{}};return {ok:true,json:async()=>result}};
 w.notify=()=>{};w.eval(source);d.querySelector('[data-direction="pull"]').click();await tick();assert.equal(d.querySelector('#sync-result').hidden,false);assert.equal(d.querySelectorAll('#sync-rows tr').length,1);
 d.querySelector('#sync-all').click();await tick();assert.equal(d.querySelectorAll('#sync-rows tr').length,2);assert.equal(d.querySelectorAll('#sync-rows input:checked').length,2);assert.equal(d.querySelectorAll('#sync-rows input:disabled').length,1);assert.equal(d.querySelector('#sync-rows img'),null);
 d.querySelector('#sync-none').click();await tick();assert.equal(d.querySelectorAll('#sync-rows input:checked').length,0);assert.equal(d.querySelectorAll('#sync-rows tr').length,1);
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
 w.notify=()=>{};w.eval(source);d.querySelector('[data-direction="pull"]').click();await tick();d.querySelector('#sync-all').click();await tick();assert(!calls.includes('pull-begin'));
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
 w.notify=()=>{};w.eval(source);d.querySelector('#sync-inbox-refresh').click();await tick();assert.match(d.querySelector('#sync-inbox-info').textContent,/第 7 版/);
 d.querySelector('#sync-review').click();await tick();assert.match(d.querySelector('#sync-rows').textContent,/最新姓名/);assert(!calls.includes('proposal-approve'));
 assert.equal(d.querySelector('#sync-confirm').placeholder,'输入：同意对端推送');d.querySelector('#sync-confirm').value='同意对端推送';d.querySelector('#sync-begin').click();await tick();
 assert(calls.includes('proposal-approve'));assert(!calls.includes('pull-begin'));assert.match(d.querySelector('#sync-progress').textContent,/同步完成/);
});

test('background policy has independent scope and explicit deletion consent',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 w.adminFetch=async(url,options)=>{const op=url.split('/').pop(),data=JSON.parse(options.body);calls.push(op);
 if(op==='schedule-save'){assert.equal(data.confirmation,'允许定时拉取并同步增删');assert.deepEqual(data.scopes,['students']);assert.equal(data.interval,15);assert.equal(data.enabled,true);assert.equal(data.auto_pull,true)}
 return {ok:true,json:async()=>({enabled:true,auto_pull:true,revision:'new',state:{message:'<script>not markup</script>',task_uid:'job'}})};};
 w.notify=()=>{};w.eval(source);const form=d.querySelector('#sync-schedule');assert(!form.querySelector('[name=enabled]').checked);assert.equal(calls.length,0);
 form.querySelector('[name=enabled]').checked=true;form.querySelector('[name=auto_pull]').checked=true;form.querySelector('[value=students]').checked=true;d.querySelector('#sync-interval').value='15';d.querySelector('#sync-schedule-confirm').value='允许定时拉取并同步增删';
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.deepEqual(calls,['schedule-save']);assert.equal(d.querySelector('#sync-schedule-status script'),null);assert.match(d.querySelector('#sync-schedule-status').textContent,/后台已开启/);
 d.querySelector('#sync-schedule-refresh').click();await tick();assert.deepEqual(calls,['schedule-save','schedule-status']);assert.equal(d.querySelector('#sync-schedule-confirm').value,'');
});

test('transport failure uses shared top notice and keeps on-page error',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,notices=[];
 w.notify=(message,state,options)=>notices.push({message,state,options});
 w.adminFetch=async()=>({ok:false,status:502,json:async()=>({error:'对端证书验证失败；诊断编号：abc',code:'sync_certificate'})});
 w.eval(source);d.querySelector('#sync-test').click();await tick();
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
 w.eval(source);d.querySelector('#sync-test').click();await tick();
 const text=d.querySelector('#sync-status').textContent;
 assert.match(text,new RegExp('HTTP '+sample.status));assert.match(text,/阶段：test/);assert.match(text,sample.want);assert(!text.includes('must-not-display'));
});

test('successful connection clearly excludes business data validation',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'https://a.example.org'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,calls=[];
 w.notify=()=>{};w.adminFetch=async url=>{calls.push(url.split('/').pop());return {ok:true,json:async()=>({protocol:2,data_check:1,site_id:'peer'})};};
 w.eval(source);d.querySelector('#sync-test').click();await tick();
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
 w.eval(source);d.querySelector('[data-direction="'+direction+'"]').click();await tick();
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
 w.eval(source);d.querySelector('[data-direction="pull"]').click();await tick();
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
 w.notify=()=>{};w.eval(source);d.querySelector('[data-direction="pull"]').click();await tick();
 if(scenario==='pause'){d.querySelector('#sync-pause').click();await new Promise(r=>setTimeout(r,200));assert.equal(attempts,1)}
 else if(scenario==='transient'){for(let i=0;i<20&&attempts<4;i++)await tick();assert.equal(attempts,4);assert.equal(calls.filter(x=>x==='get').length,3);await tick();assert.equal(attempts,4)}
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
 w.eval(source);d.querySelector('[data-direction="pull"]').click();await tick();
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
 w.eval(source);d.querySelector('[data-direction="pull"]').click();await tick();
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
 return {ok:true,json:async()=>value};};w.eval(source);
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
 return {ok:true,json:async()=>value};};w.eval(source);
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
 return {ok:true,json:async()=>result};};w.eval(source);
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
 return {ok:true,json:async()=>result};};w.eval(source);
 d.querySelector('[data-direction=push]').click();await tick();d.querySelector('#sync-send').click();await tick();
 assert.equal(calls.filter(c=>c.op==='proposal-send').length,1);assert.equal(d.querySelector('#sync-history').value,'child');assert.match(d.querySelector('#sync-status').textContent,/再次确认/);
});
