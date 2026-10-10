const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
function setup(t){
 const d=new JSDOM('<body class="section-public"><img data-brand-logo src="/logo"><div data-public-media><img src="/media/a"><span data-media-fallback hidden>fallback</span></div></body>',{url:'https://test.local/en',runScripts:'outside-only'});t.after(()=>d.window.close());
 const w=d.window,timers=new Map();let id=0;
 w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id};w.clearTimeout=id=>timers.delete(id);
 for(const p of ['frontend/public/static/js/academic.js','frontend/shared/static/js/public-controls.js'])w.eval(fs.readFileSync(p,'utf8'));
 const fire=()=>{for(const [id,v] of [...timers]){timers.delete(id);assert.equal(v.ms,1000);v.fn()}};
 return {w,timers,fire,img:w.document.querySelector('[data-public-media] img'),logo:w.document.querySelector('[data-brand-logo]'),err:i=>i.dispatchEvent(new w.Event('error'))};
}
test('delays once, duplicate errors coalesce, second error shows fallback',t=>{
 const f=setup(t);f.err(f.img);f.err(f.img);assert.equal(f.timers.size,1);assert.equal(f.img.hidden,false);
 f.fire();assert.equal(f.img.getAttribute('src'),'/media/a');f.err(f.img);assert.equal(f.img.hidden,true);assert.equal(f.timers.size,0);
 assert.equal(f.w.document.querySelector('[data-media-fallback]').hidden,false);
});
test('logo re-enhancement does not add retry handlers',t=>{
 const f=setup(t);f.w.document.dispatchEvent(new f.w.Event('public-header-updated'));f.err(f.logo);assert.equal(f.timers.size,1);f.fire();f.err(f.logo);assert.equal(f.logo.hidden,true);assert.equal(f.timers.size,0);
});
test('pagehide cancels retries and detached images are not mutated',t=>{
 const f=setup(t);f.err(f.img);f.w.dispatchEvent(new f.w.Event('pagehide'));assert.equal(f.timers.size,0);f.err(f.img);assert.equal(f.timers.size,0);
 f.w.dispatchEvent(new f.w.Event('pageshow'));f.err(f.logo);f.logo.remove();let writes=0;f.logo.setAttribute=()=>writes++;f.fire();assert.equal(writes,0);
});
test('successful load clears pending retry',t=>{
 const f=setup(t);f.err(f.img);f.img.dispatchEvent(new f.w.Event('load'));assert.equal(f.timers.size,0);assert.equal(f.img.hidden,false);
});
test('appended images use retry and source changes prevent stale writes',t=>{
 const f=setup(t),section=f.w.document.createElement('section');section.innerHTML='<img src="/media/new">';f.w.document.body.append(section);
 section.dispatchEvent(new f.w.Event('public:appended',{bubbles:true}));const img=section.querySelector('img');f.err(img);assert.equal(f.timers.size,1);
 img.setAttribute('src','/media/replacement');let writes=0;img.setAttribute=()=>writes++;f.fire();assert.equal(writes,0);
});
