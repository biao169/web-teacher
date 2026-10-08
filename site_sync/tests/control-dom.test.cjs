const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
test('global control confirms state, sends CSRF and respects emergency override',async()=>{
 const dom=new JSDOM('<meta name="csrf-token" content="csrf"><section id="sync-control"><p data-sync-control-status></p><button data-sync-pause></button><button data-sync-resume></button><button data-sync-control-refresh></button></section>',{runScripts:'outside-only'});
 const w=dom.window,calls=[];let state={paused:false,saved_paused:false,environment_paused:false,active_leases:0};
 w.fetch=async(url,o)=>{calls.push({url,o});if(o.body){state.paused=state.saved_paused=JSON.parse(o.body).paused;}return {ok:true,json:async()=>state};};
 vm.runInContext(fs.readFileSync('site_sync/frontend/static/control.mjs','utf8'),dom.getInternalVMContext());await new Promise(r=>setImmediate(r));
 const pause=w.document.querySelector('[data-sync-pause]'),resume=w.document.querySelector('[data-sync-resume]'),refresh=w.document.querySelector('[data-sync-control-refresh]');
 assert.equal(pause.disabled,false);await pause.onclick();assert.equal(resume.disabled,false);assert.equal(calls.at(-1).o.headers['x-csrf-token'],'csrf');
 await resume.onclick();assert.equal(resume.disabled,true);
 state={paused:true,saved_paused:true,environment_paused:true,active_leases:1};await refresh.onclick();assert.equal(resume.disabled,true);assert.match(w.document.querySelector('p').textContent,/TEACHER_SYNC_PAUSED/);
 w.fetch=async()=>{throw Error('<img src=x>');};await refresh.onclick();assert.equal(pause.disabled,true);assert.equal(refresh.disabled,false);assert.equal(w.document.querySelector('img'),null);dom.window.close();
});
