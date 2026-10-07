const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const source=fs.readFileSync(path.join(__dirname,'../frontend/shared/static/js/news-reader.js'),'utf8');
const markup=(id='a',pub=true)=>`<span data-inline-pdf ${pub?'data-pdf-public data-pdf-lang="en" data-pdf-watermark="Team &lt;b&gt;literal&lt;/b&gt;"':''} data-pdf-url="/media/${id}"><span class="pdf-inline-tools"><button data-pdf-start hidden>View PDF</button><button data-pdf-collapse hidden>Collapse</button></span><span class="pdf-inline-status"></span><span class="pdf-inline-pages"></span><button data-pdf-next hidden>Next page</button></span>`;
function fixture(t,html=markup()){
 const dom=new JSDOM(html,{url:'https://site.test/en/news/a',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,options=[],observers=[],docs=[];
 w.requestAnimationFrame=()=>0;w.innerHeight=800;
 Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get:()=>400});
 w.HTMLElement.prototype.getBoundingClientRect=function(){return this.classList.contains('pdf-inline-sentinel')?{top:2000,bottom:2001}:{top:0,bottom:600}};
 w.HTMLCanvasElement.prototype.getContext=()=>({});w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.IntersectionObserver=class{constructor(cb){this.cb=cb;observers.push(this)}observe(){}unobserve(){}disconnect(){}};
 let fail=false,held=null;
 w.pdfTest={getDocument(opts){options.push(opts);const doc={numPages:6,async getPage(n){return {getViewport({scale}){return {width:(n%2?600:800)*scale,height:(n%2?800:400)*scale,scale}},render(){return {promise:Promise.resolve(),cancel(){}}},streamTextContent(){return {}},cleanup(){}}},async destroy(){this.destroyed=true}};docs.push(doc);return {promise:held|| (fail?Promise.reject(Error('offline')):Promise.resolve(doc)),destroy:()=>doc.destroy()}},TextLayer:class{async render(){}cancel(){}}};
 w.eval(source.replace('let library,queue=','let library=Promise.resolve(window.pdfTest),queue=').replace('export function mountNewsReader','function mountNewsReader')+'\nwindow.mount=mountNewsReader;');
 const dispose=w.mount(w.document);t.after(dispose);
 return {w,options,observers,docs,$:s=>w.document.querySelector(s),all:s=>[...w.document.querySelectorAll(s)],tick:()=>new Promise(r=>setTimeout(r,0)),fail:v=>fail=v,hold:p=>held=p,dispose};
}
test('PDF stays lazy, loads range chunks and watermarks every page as safe noninteractive text',async t=>{
 const f=fixture(t);assert.equal(f.options.length,0);
 f.observers[0].cb([{target:f.$('[data-inline-pdf]'),isIntersecting:true}]);await f.tick();await f.tick();
 assert.equal(f.options.length,1);assert.equal(f.options[0].disableAutoFetch,true);assert.equal(f.options[0].disableStream,true);assert.equal(f.options[0].rangeChunkSize,65536);
 assert.equal(f.all('canvas').length,1);assert.equal(f.$('.pdf-watermark').textContent,'Team <b>literal</b>');assert.equal(f.$('.pdf-watermark b'),null);
 f.$('[data-pdf-next]').click();await f.tick();await f.tick();
 assert.equal(f.all('.pdf-watermark').length,2);assert.equal(f.all('.pdf-inline-page')[0].style.aspectRatio,'0.75');assert.equal(f.all('.pdf-inline-page')[1].style.aspectRatio,'2');
 assert.equal(f.$('.pdf-inline-status').textContent,'');assert.equal(f.all('.pdf-inline-tools').length,1);
 f.$('[data-pdf-collapse]').click();assert.equal(f.all('canvas').length,0);assert.equal(f.w.document.activeElement,f.$('[data-pdf-start]'));
});
test('canvas and document limits are retained, offscreen pages restore without duplicating watermark',async t=>{
 const f=fixture(t,markup('a')+markup('b')+markup('c'));
 const starts=f.all('[data-pdf-start]');starts[0].click();await f.tick();await f.tick();
 for(let i=0;i<4;i++){f.$('[data-pdf-next]').click();await f.tick();await f.tick()}
 assert.ok(f.all('canvas').length<=3);assert.equal(f.all('.pdf-watermark').length,5);
 const page=f.$('.pdf-inline-page');f.observers[0].cb([{target:page,isIntersecting:true}]);await f.tick();await f.tick();assert.equal(page.querySelectorAll('.pdf-watermark').length,1);
 starts[1].click();await f.tick();await f.tick();starts[2].click();await f.tick();await f.tick();assert.equal(f.docs[0].destroyed,true);
});
test('failed load offers retry without suggesting a forbidden original download',async t=>{
 const f=fixture(t);f.fail(true);f.$('[data-pdf-start]').click();await f.tick();await f.tick();
 assert.match(f.$('.pdf-inline-status').textContent,/retry/i);assert.doesNotMatch(f.$('.pdf-inline-status').textContent,/original|原文件/);
 assert.equal(f.$('[data-pdf-start]').disabled,false);f.fail(false);f.$('[data-pdf-start]').click();await f.tick();await f.tick();assert.equal(f.all('canvas').length,1);
});
test('disposing during a pending document prevents late page painting',async t=>{
 const f=fixture(t);let resolve;f.hold(new Promise(r=>resolve=r));f.$('[data-pdf-start]').click();await f.tick();f.dispose();resolve(f.docs[0]);await f.tick();await f.tick();assert.equal(f.all('canvas').length,0);
});
test('administrator default markup receives no frontend watermark and retains progress text',async t=>{
 const f=fixture(t,markup('admin',false));f.$('[data-pdf-start]').click();await f.tick();await f.tick();assert.equal(f.all('.pdf-watermark').length,0);assert.match(f.$('.pdf-inline-status').textContent,/按页阅读/);
});
