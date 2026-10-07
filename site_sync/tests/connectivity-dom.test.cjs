const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
test('probe sends CSRF, uses text rendering and restores button after failure',async()=>{
 const dom=new JSDOM('<meta name="csrf-token" content="csrf"><button data-sync-probe></button><pre data-sync-probe-result></pre>',{runScripts:'outside-only'});
 const w=dom.window;let call;
 w.fetch=async(url,options)=>{call={url,options};return {ok:true,json:async()=>({ok:false,message:'<img src=x onerror=alert(1)>',steps:[]})};};
 vm.runInContext(fs.readFileSync('site_sync/frontend/static/connection.mjs','utf8'),dom.getInternalVMContext());
 const button=w.document.querySelector('button');await button.onclick();
 assert.equal(call.url,'/api/admin/site-sync/connectivity');assert.equal(call.options.headers['x-csrf-token'],'csrf');assert.equal(call.options.body,'{}');assert.equal(button.disabled,false);assert.equal(w.document.querySelector('img'),null);
 w.fetch=async()=>({ok:false,status:503,text:async()=>'<html>Error 1102 resource limit</html>',headers:new Headers({'cf-ray':'test-ray'})});await button.onclick();assert.match(w.document.querySelector('pre').textContent,/1102.*test-ray/);assert.equal(button.disabled,false);
 w.fetch=async()=>{throw Error('Network failure');};await button.onclick();assert.equal(button.disabled,false);assert.match(w.document.querySelector('pre').textContent,/Network failure/);dom.window.close();
});
