const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const source=fs.readFileSync('frontend/admin/static/js/native-site-sync.js','utf8').replace(/^import[^\n]+\n/gm,'');
function markup(){const r=spawnSync(process.env.TEST_PYTHON||'python3',['-B','-c',"import sys,tempfile;sys.path.insert(0,'tests');from list_fixture import client_at;from pathlib import Path\nwith tempfile.TemporaryDirectory() as root:\n c,r=client_at(Path(root));page=c.get('/admin/data-tools/sync');assert page.status_code==200;print(page.text);c.close()"],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;}
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
