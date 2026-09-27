/* Actual embedded HTML and management controller; no iframe, standalone shell or live data. */
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom'),project=path.resolve(__dirname,'..');
const html=execFileSync(process.env.TEST_PYTHON||'python3',['-B','-c',`
import sys,tempfile
from pathlib import Path
sys.path.insert(0,'tests')
from list_fixture import client_at
with tempfile.TemporaryDirectory() as folder:
 c,r=client_at(Path(folder))
 print(c.get('/admin/transfer').text)
 c.close()
`],{cwd:project,encoding:'utf8'});
async function setup(){
 const dom=new JSDOM(html,{url:'http://127.0.0.1:8765/admin/transfer#transfer-tasks'}),d=dom.window.document,calls=[],intervals=[];
 const scope=d.querySelector('[data-transfer-admin]');scope.dataset.csrf='correct-csrf';const unrelated=d.createElement('div');unrelated.dataset.csrf='wrong-csrf';d.body.prepend(unrelated);
 const usage=Object.fromEntries(['daily','weekly','monthly'].map(k=>[k,{charged_and_reserved:0,limit:null,remaining:null}]));
 const ctx=vm.createContext({document:d,window:dom.window,navigator:dom.window.navigator,location:dom.window.location,history:dom.window.history,URL,URLSearchParams,Intl,FormData:dom.window.FormData,AbortController:dom.window.AbortController,setTimeout,clearTimeout,setInterval:fn=>{intervals.push(fn)},confirm:()=>true,sessionStorage:dom.window.sessionStorage,fetch:async(url,options={})=>{
  calls.push({url,options});let value={};
  if(url.includes('/api/admin/usage'))value={total:usage,identity:usage,scope:'anonymous',timeZone:'UTC'};
  else if(url.includes('/api/tasks?'))value={html:d.querySelector('#task-panel').innerHTML,page:1,pages:1,size:20,total:0};
  else if(url.endsWith('/api/settings'))value={revision:1};
  return {ok:true,json:async()=>value};
 }});
 const cache=new Map();function linker(spec){const name=spec.split('?')[0];if(!cache.has(name)){const file=name.startsWith('/assets/admin/js/')?path.join(project,'frontend/admin/static/js',path.basename(name)):path.join(project,'transfer/frontend/native',name.replace('./',''));cache.set(name,new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context:ctx,identifier:name}))}return cache.get(name)}
 const module=linker('./native.js');await module.link(linker);await module.evaluate();await new Promise(r=>setImmediate(r));return {dom,d,calls,intervals};
}
test('embedded controller saves with its own CSRF and task refresh preserves drafts and shell',async t=>{
 const r=await setup();t.after(()=>r.dom.window.close());const {d,calls}=r,sidebar=d.querySelector('.workspace-sidebar'),settings=d.querySelector('#transfer-controls');
 assert.equal(d.querySelectorAll('main').length,1);assert.equal(d.querySelector('iframe'),null);assert.equal(d.querySelector('#send'),null);
 d.querySelector('#totalWeeklyBytes').value='12345';d.querySelector('#refresh-tasks').click();await new Promise(r=>setTimeout(r,15));
 assert.equal(d.querySelector('#totalWeeklyBytes').value,'12345');assert.equal(d.querySelector('#transfer-controls'),settings);assert.equal(d.querySelector('.workspace-sidebar'),sidebar);assert.equal(r.dom.window.location.pathname,'/admin/transfer');assert.equal(r.dom.window.location.hash,'#transfer-tasks');
 d.querySelector('#save-settings').click();await new Promise(r=>setTimeout(r,15));const request=calls.find(c=>c.url==='/transfer/api/settings');assert(request);const body=JSON.parse(request.options.body);assert.equal(body._csrf,'correct-csrf');assert.equal(body.totalWeeklyBytes,'12345');assert.equal(d.querySelector('#save-settings').dataset.revision,'1');
 assert(calls.every(c=>c.url.startsWith('/transfer/api/')));assert.equal(r.intervals.length,1);
});
