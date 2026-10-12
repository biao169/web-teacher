const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const script=fs.readFileSync(path.join(__dirname,'../frontend/admin/static/js/native-public-cache.js'),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
function fixture(t){
 const dom=new JSDOM('<section data-maintenance data-csrf="CSRF"><section data-public-cache><button data-public-cache-module="profiles">Clear</button><button data-public-cache-module="home">Clear home</button><p data-public-cache-result></p></section></section>',{url:'https://site.test/admin/runtime-maintenance',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window,requests=[],timers=[];w.confirm=()=>true;w.setTimeout=fn=>{timers.push(fn);return timers.length;};w.clearTimeout=()=>{};
 w.fetch=(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}));w.eval(script);
 return {w,requests,timers,buttons:w.document.querySelectorAll('button'),output:w.document.querySelector('[data-public-cache-result]')};
}
test('explicit confirmation sends exactly one module with CSRF, never warms or retries',async t=>{
 const f=fixture(t);assert.equal(f.requests.length,0);f.w.confirm=()=>false;f.buttons[0].click();assert.equal(f.requests.length,0);
 f.w.confirm=()=>true;f.buttons[0].click();f.buttons[0].click();assert.equal(f.requests.length,1);assert.equal(f.buttons[1].disabled,true);
 const request=f.requests[0];assert.equal(request.url,'/api/admin/public-cache/reset');assert.equal(request.options.method,'POST');assert.deepEqual(JSON.parse(request.options.body),{module:'profiles',_csrf:'CSRF'});assert.equal(request.options.cache,'no-store');
 request.resolve({ok:true,json:async()=>({module:'profiles',page_cache:'accepted',data_cache:'accepted',request_id:'<script>not html</script>'})});await tick();
 assert.match(f.output.textContent,/已接受/);assert.equal(f.w.document.querySelector('script'),null);assert.equal(f.requests.length,1);assert.equal(f.buttons[1].disabled,false);
});
test('partial outcome is displayed independently; incomplete acceptance is not a success',async t=>{
 const f=fixture(t);f.buttons[0].click();f.requests[0].resolve({ok:false,json:async()=>({module:'profiles',page_cache:'accepted',data_cache:'unknown',request_id:'id'})});await tick();
 assert.match(f.output.textContent,/未全部确认/);assert.match(f.output.textContent,/页面缓存：已接受/);assert.match(f.output.textContent,/数据缓存：结果未确认/);assert.equal(f.requests.length,1);
});
test('home data is explicitly not applicable',async t=>{
 const f=fixture(t);f.buttons[1].click();f.requests[0].resolve({ok:true,json:async()=>({module:'home',page_cache:'accepted',data_cache:'not_applicable'})});await tick();assert.match(f.output.textContent,/数据缓存：不适用/);assert.equal(f.requests.length,1);
});
test('timeout or malformed response remains unknown without replay',async t=>{
 const f=fixture(t);f.buttons[0].click();f.timers[0]();assert.equal(f.requests[0].options.signal.aborted,true);f.requests[0].reject(Error('timeout'));await tick();assert.match(f.output.textContent,/结果未确认/);assert.equal(f.buttons[0].disabled,false);assert.equal(f.requests.length,1);
 f.buttons[0].click();f.requests[1].resolve({ok:true,json:async()=>{throw Error('bad JSON')}});await tick();assert.match(f.output.textContent,/结果未确认/);assert.equal(f.requests.length,2);
});
