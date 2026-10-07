const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const source=fs.readFileSync('frontend/admin/static/js/native-maintenance.js','utf8');
function markup(){const r=spawnSync(process.env.TEST_PYTHON||'python3',['-c',"import sys,tempfile;sys.path.insert(0,'tests');from list_fixture import client_at;from pathlib import Path\nwith tempfile.TemporaryDirectory() as root:\n c,r=client_at(Path(root));page=c.get('/admin/runtime-maintenance');assert page.status_code==200;print(page.text);c.close()"],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;}
const state={resources:{disks:{},process_bytes:1024,system_available:4096,database:{main:100},public_cache:{used:0,budget:1024},files:null},last:{},policy:{revision:0}};
const tick=()=>new Promise(r=>setTimeout(r,10));
test('real workspace preserves edits on error and requires preview/confirmation before cleanup',async t=>{
 const dom=new JSDOM(markup(),{runScripts:'outside-only',url:'http://testserver'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;let calls=[],rejectSave=true;
 w.fetch=async(url,options)=>{assert.equal(options.headers.Accept,'application/json');const data=options.body?JSON.parse(options.body):{};calls.push(data.action||'status');if(data.action==='save'&&rejectSave)return {ok:false,json:async()=>({error:'策略已变化'})};return {ok:true,json:async()=>data.action==='preview'||data.action==='run'?{at:'2026-09-28T00:00:00.000Z',mode:data.action==='run'?'apply':'preview',counts:{operation_logs:2},errors:[]}:data.action==='save'?{revision:1}:state};};
 w.eval(source);await tick();assert.match(d.querySelector('[data-metrics]').textContent,/进程内存/);
 const field=d.querySelector('[name=operation_days]');field.value='20';d.querySelector('[data-policy]').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(field.value,'20');assert.match(d.querySelector('[data-notice]').textContent,/策略已变化/);assert(!d.querySelector('[data-preview]').disabled);
 d.querySelector('[data-preview]').click();await tick();assert.equal(d.querySelector('[data-run]').hidden,false);assert.match(d.querySelector('[data-preview-result]').textContent,/后台操作记录/);
 w.confirm=()=>false;d.querySelector('[data-run]').click();await tick();assert(!calls.includes('run'));
 w.confirm=()=>true;d.querySelector('[data-run]').click();await tick();assert(calls.includes('run'));assert(d.querySelector('[data-run]').hidden);
});
