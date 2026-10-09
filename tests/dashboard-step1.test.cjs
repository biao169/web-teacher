const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const source=fs.readFileSync(path.join(__dirname,'../frontend/admin/static/js/native-dashboard.js'),'utf8').replace(/^import .*;\n/m,'');
const markup='<div data-dashboard-counts><p data-dashboard-status></p><button data-dashboard-retry hidden>重试</button><a href="/admin/profiles"><strong data-dashboard-count="profiles">—</strong></a><strong data-dashboard-count="students">—</strong></div>';
const settle=()=>new Promise(r=>setTimeout(r,0));
function setup(t,html=markup){
 const dom=new JSDOM(html,{url:'https://site.example/admin',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window,calls=[];
 w.adminFetch=(url,options)=>new Promise((resolve,reject)=>{calls.push({url,options,resolve});options.signal.addEventListener('abort',()=>reject(new w.DOMException('aborted','AbortError')));});
 w.eval(source);return {w,calls,$:s=>w.document.querySelector(s)};
}
test('one request fills all cards including zero; repeated triggers never fan out',async t=>{
 const f=setup(t);f.$('[data-dashboard-retry]').click();assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].url,'/api/admin/dashboard-counts');assert.equal(f.calls[0].options.cache,'no-store');
 f.calls[0].resolve({ok:true,json:async()=>({counts:{profiles:3,students:0}})});await settle();
 assert.equal(f.$('[data-dashboard-count="profiles"]').textContent,'3');assert.equal(f.$('[data-dashboard-count="students"]').textContent,'0');
 f.w.dispatchEvent(new f.w.Event('pageshow'));assert.equal(f.calls.length,1);
});
test('503 preserves card links and only explicit retry issues another request',async t=>{
 const f=setup(t);f.calls[0].resolve({ok:false,status:503,json:async()=>({error:'暂时不可用'})});await settle();
 assert.match(f.$('[data-dashboard-status]').textContent,/503/);assert.equal(f.$('a').getAttribute('href'),'/admin/profiles');assert.equal(f.$('strong').textContent,'—');assert.equal(f.calls.length,1);
 assert.equal(f.$('[data-dashboard-retry]').hidden,false);f.$('[data-dashboard-retry]').click();assert.equal(f.calls.length,2);
 f.calls[1].resolve({ok:true,json:async()=>({counts:{profiles:1,students:2}})});await settle();assert.equal(f.$('strong').textContent,'1');
});
test('incomplete or invalid counts cannot partially paint cards',async t=>{
 const f=setup(t);f.calls[0].resolve({ok:true,json:async()=>({counts:{profiles:9,students:-1}})});await settle();assert.equal(f.$('strong').textContent,'—');assert.equal(f.$('[data-dashboard-retry]').hidden,false);
});
test('pagehide aborts; restored page resumes one pending read',async t=>{
 const f=setup(t);f.w.dispatchEvent(new f.w.Event('pagehide'));assert.equal(f.calls[0].options.signal.aborted,true);await settle();
 f.w.dispatchEvent(new f.w.Event('pageshow'));assert.equal(f.calls.length,2);f.calls[1].resolve({ok:true,json:async()=>({counts:{profiles:1,students:1}})});await settle();
});
test('other admin pages do not fetch statistics',t=>{const f=setup(t,'<h1>Editor</h1>');assert.equal(f.calls.length,0);});
test('empty permissions dashboard does not request counts',t=>{const f=setup(t,'<div data-dashboard-counts><p data-dashboard-status></p><button data-dashboard-retry></button></div>');assert.equal(f.calls.length,0);});
