/* Synthetic load/error events test state management, not JPEG decoding. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const directory=path.resolve(__dirname,'../frontend/admin/static/js');
async function fixture({status=200,type='image/jpeg',length='100',src='/api/admin/media/test/content',cached=false,fetcher=null,retryAfter=null}={}){
 const dom=new JSDOM('<div data-media-preview><img data-media-large><div data-preview-error hidden></div></div>',{url:'http://localhost/admin/media_assets',runScripts:'outside-only'});
 const w=dom.window,document=w.document,img=document.querySelector('img'),requests=[],timers=new Map();let clock=0;
 img.src=src;
 Object.defineProperty(img,'complete',{get:()=>cached});Object.defineProperty(img,'naturalWidth',{get:()=>cached?12:0});
 w.setTimeout=(fn,delay)=>{timers.set(++clock,{fn,delay});return clock};w.clearTimeout=id=>timers.delete(id);
 const response=()=>({ok:status>=200&&status<300,status,type:'basic',headers:{get:name=>({'content-type':type,'content-length':length,'retry-after':retryAfter}[name]??null)}});
 w.fetch=async(input,options)=>{requests.push({input:String(input),options});return fetcher?fetcher(input,options):response()};
 const context=dom.getInternalVMContext();
 const access=new vm.SourceTextModule(fs.readFileSync(path.join(directory,'native-access.js'),'utf8'),{context});
 await access.link(()=>{throw Error('unexpected dependency')});
 const media=new vm.SourceTextModule(fs.readFileSync(path.join(directory,'native-media.js'),'utf8'),{context});
 await media.link(()=>access);await media.evaluate();
 return {w,document,img,requests,timers,api:media.namespace,response,
  error(){img.dispatchEvent(new w.Event('error'))},
  loaded(){img.dispatchEvent(new w.Event('load'))},
  runRetry(){const entry=[...timers].find(([,timer])=>timer.delay>=1000&&timer.delay<3000);assert.ok(entry,'retry timer exists');timers.delete(entry[0]);entry[1].fn()},
  close(){media.namespace.clearMediaPreviews(document);dom.window.close()}
 };
}
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setImmediate(resolve))}assert.ok(check(),'state not reached')}

test('cached image and idle lazy image do not cause diagnostic requests',async t=>{
 for(const cached of [true,false]){
  const r=await fixture({cached});t.after(()=>r.close());
  assert.equal(r.requests.length,0);assert.equal(r.timers.size,0);
  if(cached)assert.equal(r.img.dataset.previewState,'ready');
 }
});

test('503 retry is bounded to two GET reloads, then leaves manual recovery',async t=>{
 const r=await fixture({status:503});t.after(()=>r.close());
 for(let n=1;n<=3;n++){
  r.error();await until(()=>r.requests.length===n&&r.img.dataset.previewState===(n<3?'loading':'error'));
  if(n<3)r.runRetry();
 }
 assert.equal([...r.timers.values()].filter(timer=>timer.delay<3000).length,0);
 assert.match(r.document.querySelector('[data-preview-message]').textContent,/HTTP 503/);
 assert.equal(r.document.querySelector('[data-preview-retry]').disabled,false);
 assert.ok(r.requests.every(request=>request.options.method==='HEAD'));
 assert.equal(new URL(r.img.src).pathname,'/api/admin/media/test/content');
});

test('readable image retries once here, and successful load cancels pending work',async t=>{
 const r=await fixture();t.after(()=>r.close());r.error();
 await until(()=>r.img.dataset.previewState==='loading');r.runRetry();
 assert.ok(new URL(r.img.src).searchParams.has('preview_retry'));
 r.loaded();assert.equal(r.img.hidden,false);assert.equal(r.img.dataset.previewState,'ready');
 assert.equal(r.document.querySelector('[data-preview-feedback]').hidden,true);assert.equal(r.timers.size,0);
});

for(const status of [401,403,404,409,413,429])test('HTTP '+status+' is not automatically retried',async t=>{
 const r=await fixture({status});t.after(()=>r.close());r.error();
 await until(()=>r.requests.length===1&&r.document.querySelector('[data-preview-message]').textContent!=='预览失败，正在检查…');
 assert.equal(r.timers.size,0);assert.equal(r.img.dataset.previewState,'error');
});

test('empty, unsupported, redirected and Retry-After responses are not retried',async t=>{
 for(const options of [{length:'0'},{type:'text/html'},{status:307},{status:503,retryAfter:'120'}]){
  const r=await fixture(options);t.after(()=>r.close());r.error();
  await until(()=>r.requests.length===1&&r.document.querySelector('[data-preview-message]').textContent!=='预览失败，正在检查…');
  assert.equal(r.timers.size,0);
 }
});

test('external signed URL is neither diagnosed nor automatically rewritten',async t=>{
 const source='https://example.test/image.jpg?signature=preserve-me',r=await fixture({src:source});t.after(()=>r.close());
 r.error();await until(()=>r.document.querySelector('[data-preview-message]').textContent.includes('外部图片'));
 assert.equal(r.requests.length,0);assert.equal(r.timers.size,0);assert.equal(r.img.src,source);
 r.document.querySelector('[data-preview-retry]').click();assert.equal(r.img.src,source);
});

test('diagnostic burst never exceeds two concurrent HEAD requests',async t=>{
 let active=0,peak=0;const pending=[];
 const r=await fixture({fetcher:()=>new Promise(resolve=>{active++;peak=Math.max(peak,active);pending.push(()=>{active--;resolve({ok:false,status:404,headers:{get:()=>null}})})})});t.after(()=>r.close());
 const images=[r.img];
 for(let i=0;i<6;i++){
  const host=r.document.createElement('div'),img=r.document.createElement('img');img.src='/api/admin/media/item'+i+'/content';
  host.append(img);r.document.body.append(host);r.api.watchMediaPreview(img);images.push(img);
 }
 images.forEach(img=>img.dispatchEvent(new r.w.Event('error')));
 await until(()=>pending.length===2);assert.equal(active,2);
 for(let done=0;done<images.length;done++){
  await until(()=>pending.length>0);pending.shift()();
 }
 await until(()=>active===0);assert.equal(peak,2);assert.equal(r.requests.length,images.length);
});

test('dispose cancels retry and stale diagnosis cannot hide a recovered image',async t=>{
 let resolve;
 const r=await fixture({fetcher:()=>new Promise(done=>resolve=done)});t.after(()=>r.close());r.error();
 await until(()=>resolve);r.loaded();resolve(r.response());
 await new Promise(done=>setImmediate(done));assert.equal(r.img.dataset.previewState,'ready');
 assert.equal(r.timers.size,0);
 const second=await fixture({status:503});t.after(()=>second.close());second.error();
 await until(()=>second.img.dataset.previewState==='loading');second.api.clearMediaPreviews(second.document);
 assert.equal(second.timers.size,0);assert.equal(second.img.hasAttribute('data-preview-bound'),false);
});
