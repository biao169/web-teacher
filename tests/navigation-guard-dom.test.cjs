const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const code=fs.readFileSync(path.join(__dirname,'../frontend/shared/static/js/navigation-guard.js'),'utf8');
function setup(t){const d=new JSDOM('<a id="a" href="/en/projects">A</a><a id="b" href="/en/news">B</a>',{url:'https://site.test/en',runScripts:'outside-only'});t.after(()=>d.window.close());const w=d.window,timers=new Map();let id=0,started=0,cancelled=0;w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id};w.clearTimeout=id=>timers.delete(id);w.document.addEventListener('teacher:navigation-start',()=>started++);w.document.addEventListener('teacher:navigation-cancel',()=>cancelled++);w.eval(code);w.addEventListener('click',e=>e.preventDefault());return {w,timers,started:()=>started,cancelled:()=>cancelled,click:(n='a',opts={})=>{const e=new w.MouseEvent('click',{button:0,bubbles:true,cancelable:true,...opts});w.document.getElementById(n).dispatchEvent(e);return e},fire:()=>{for(const x of [...timers.values()]){assert.equal(x.ms,3000);x.fn();}}};}
test('first accepted, repeat blocked, timeout resumes and permits retry',t=>{const f=setup(t);f.click();f.click('b');assert.equal(f.started(),1);f.fire();assert.equal(f.cancelled(),1);f.click('b');assert.equal(f.started(),2);});
test('pagehide clears timer; pageshow allows another navigation',t=>{const f=setup(t);f.click();f.w.dispatchEvent(new f.w.Event('pagehide'));assert.equal(f.timers.size,0);f.w.dispatchEvent(new f.w.Event('pageshow'));f.click('b');assert.equal(f.started(),2);});
for(const attr of ['target="_blank"','download','data-auth-open','data-load-more','data-media-locations','data-bs-toggle="modal"'])test('excludes '+attr,t=>{const f=setup(t);f.w.document.getElementById('a').outerHTML='<a id="a" href="/en/projects" '+attr+'>A</a>';f.click();assert.equal(f.started(),0);});
test('modifiers, external, hashes and prevented component clicks are ignored',t=>{const f=setup(t);f.click('a',{ctrlKey:true});f.click('a',{button:1});const a=f.w.document.getElementById('a');a.href='https://other.test';f.click();a.href='#main';f.click();a.href='/en#main';f.click();a.href='/en/projects';a.addEventListener('click',e=>e.preventDefault());f.click();assert.equal(f.started(),0);});
test('admin read cancellation leaves writes running and allows reads after recovery',async t=>{
 const d=new JSDOM('',{url:'https://site.test/admin',runScripts:'outside-only'});t.after(()=>d.window.close());const w=d.window,requests=[];
 w.adminFetch=(url,options)=>new Promise((resolve,reject)=>{requests.push({url,options,resolve});options.signal.addEventListener('abort',()=>reject(new w.DOMException('Cancelled','AbortError')));});
 const http=fs.readFileSync(path.join(__dirname,'../frontend/admin/static/js/native-http.js'),'utf8').replace(/^import .*\n/,'').replace('export async function requestJSON','async function requestJSON');w.eval(http+'\nwindow.readJSON=requestJSON;');
 const read=w.readJSON('/read').catch(e=>e),write=w.readJSON('/write',{method:'POST'});
 w.document.dispatchEvent(new w.Event('teacher:navigation-start'));
 assert.ok(requests[0].options.signal.aborted);assert.equal(requests[1].options.signal.aborted,false);
 requests[1].resolve({ok:true,json:async()=>({ok:true})});assert.equal((await write).ok,true);await read;
 w.document.dispatchEvent(new w.Event('teacher:navigation-cancel'));const resumed=w.readJSON('/read');requests[2].resolve({ok:true,json:async()=>({ok:true})});assert.equal((await resumed).ok,true);
});
