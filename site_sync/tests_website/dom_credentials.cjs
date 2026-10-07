const {JSDOM}=require('jsdom');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const server=spawn(process.env.PYTHON||'python3',['-m','site_sync.tests_website.browser_fixture'],{stdio:['ignore','pipe','pipe']});let dom;
 try{
 const info=await new Promise((resolve,reject)=>{let b='';const timer=setTimeout(()=>reject(Error('start timeout')),10000);server.stdout.on('data',d=>{b+=d;if(b.includes('\n')){clearTimeout(timer);resolve(JSON.parse(b.split('\n')[0]));}});server.once('exit',()=>reject(Error('server exited')));});
 const origin='http://127.0.0.1:'+info.port,requests=[];
 const request=(url,options={})=>{requests.push([url,options.method||'GET']);return fetch(new URL(url,origin),{...options,headers:{...options.headers,cookie:info.session_cookie+'=test-token',origin}});};
 const html=await (await request('/admin/site-sync')).text();assert.ok(!html.includes('6a'.repeat(32)));
 const {time}=await import('../frontend/static/model.mjs');
 const script=fs.readFileSync('site_sync/frontend/static/credentials.mjs','utf8').replace("import {time} from './model.mjs';",'const time=window.formatTime;');
 function mount(){dom?.window.close();dom=new JSDOM(html,{url:origin+'/admin/site-sync',runScripts:'outside-only'});dom.window.fetch=request;dom.window.formatTime=time;dom.window.eval(script);}
 const el=s=>dom.window.document.querySelector(s),wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('timeout: '+el('[data-key-notice]').textContent);};
 const idle=()=>wait(()=>el('#sync-credentials').getAttribute('aria-busy')==='false');
 const fill=v=>{el('[name=sync_key]').value=v;el('[name=sync_key]').dispatchEvent(new dom.window.Event('input'));};
 const click=async s=>{el(s).click();await idle();};
 mount();await idle();assert.equal(el('[name=sync_key]').value,'');assert.ok(!requests.some(x=>x[0].endsWith('/reveal')));
 await click('[data-key-generate]');const draft=el('[name=sync_key]').value;assert.match(draft,/^[a-f0-9]{64}$/);assert.match(el('[data-key-notice]').textContent,/尚未保存/);
 let copied;Object.defineProperty(dom.window.navigator,'clipboard',{configurable:true,value:{writeText:async v=>{copied=v;}}});
 await click('[data-key-copy]');assert.equal(copied,draft);assert.equal((await (await request('/api/admin/site-sync/credentials')).json()).source,'environment');
 await click('[data-key-show]');assert.equal(el('[name=sync_key]').type,'text');await click('[data-key-show]');assert.equal(el('[name=sync_key]').type,'password');
 await click('#sync-credentials [type=submit]');assert.match(el('[data-key-notice]').textContent,/已保存并生效/);assert.equal(el('[name=sync_key]').value,'');
 mount();await idle();assert.equal(el('[name=sync_key]').value,'');assert.match(el('[data-key-status]').textContent,/后台密钥/);
 Object.defineProperty(dom.window.navigator,'clipboard',{configurable:true,value:{writeText:async v=>{copied=v;}}});
 await click('[data-key-copy]');assert.equal(copied,draft);assert.match(el('[data-key-notice]').textContent,/当前生效/);
 fill('invalid');await click('#sync-credentials [type=submit]');assert.match(el('[data-key-notice]').textContent,/64位/);
 fill('AB'.repeat(32));await click('#sync-credentials [type=submit]');
 Object.defineProperty(dom.window.navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}});
 await click('[data-key-copy]');assert.match(el('[data-key-notice]').textContent,/手动复制/);assert.equal(el('[name=sync_key]').value,'ab'.repeat(32));
 assert.equal(el('[name=sync_key]').selectionEnd-el('[name=sync_key]').selectionStart,64);
 // Failed save must retain the unsaved draft and must not claim success.
 const normal=dom.window.fetch;dom.window.fetch=async(u,o)=>o?.method==='POST'?new Response(JSON.stringify({error:'模拟故障'}),{status:503}):normal(u,o);
 fill('cd'.repeat(32));await click('#sync-credentials [type=submit]');assert.match(el('[data-key-notice]').textContent,/模拟故障/);assert.equal(el('[name=sync_key]').value,'cd'.repeat(32));
 console.log('PASS DOM + real HTTP: status, generation draft, copy, show/hide, save, reload, paste, invalid input, clipboard fallback, failed save retains draft; no real browser layout validation');
 }finally{dom?.window.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e);process.exitCode=1;});
