const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const script=fs.readFileSync(path.join(__dirname,'../frontend/shared/static/js/public-controls.js'),'utf8');
function fixture(t,{observer=true,reduced=false,publicPage=true}={}){
 const dom=new JSDOM(`<body class="${publicPage?'section-public':''}"><main id="main"></main><span data-top-marker></span><button data-back-top hidden>Top</button><div data-stream-items></div></body>`,{url:'https://example.test',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window,scrolls=[];let observed;
 w.requestAnimationFrame=fn=>fn();w.matchMedia=()=>({matches:reduced});w.scrollTo=value=>scrolls.push(value);
 if(observer)w.IntersectionObserver=class{constructor(fn){observed=fn}observe(){}};
 w.eval(script);return {w,button:w.document.querySelector('[data-back-top]'),scrolls,update:()=>observed?.()};
}
test('top control follows threshold, respects reduced motion and restores visible focus',t=>{
 const f=fixture(t,{reduced:true});assert.equal(f.button.hidden,true);
 f.w.scrollY=450;f.update();assert.equal(f.button.hidden,false);f.button.focus();f.button.click();
 assert.equal(f.scrolls[0].top,0);assert.equal(f.scrolls[0].behavior,'auto');
 f.w.scrollY=0;f.update();assert.equal(f.button.hidden,true);assert.equal(f.w.document.activeElement.id,'main');assert.equal(f.w.document.querySelector('main').hasAttribute('tabindex'),false);
});
test('scroll fallback and history restore work without an observer',t=>{
 const f=fixture(t,{observer:false});f.w.scrollY=600;f.w.dispatchEvent(new f.w.Event('scroll'));assert.equal(f.button.hidden,false);
 f.button.click();assert.equal(f.scrolls[0].behavior,'smooth');f.w.scrollY=0;f.w.dispatchEvent(new f.w.Event('pageshow'));assert.equal(f.button.hidden,true);
});
test('images appended by infinite scroll fall back on failure without copyable decoration',t=>{
 const f=fixture(t),root=f.w.document.querySelector('[data-stream-items]');
 root.innerHTML='<div data-public-media><img src="/media/unavailable"><span data-media-fallback aria-hidden="true" hidden>林</span></div>';
 root.dispatchEvent(new f.w.CustomEvent('public:appended',{bubbles:true}));root.querySelector('img').dispatchEvent(new f.w.Event('error'));
 assert.equal(root.querySelector('img').hidden,true);assert.equal(root.querySelector('span').hidden,false);assert.equal(root.querySelector('[data-copy-field]'),null);
});
test('controls do nothing on administration pages',t=>{
 const f=fixture(t,{publicPage:false});f.w.scrollY=500;f.w.dispatchEvent(new f.w.Event('scroll'));assert.equal(f.button.hidden,true);f.button.click();assert.equal(f.scrolls.length,0);
});
test('public styles reference centralized typography and color values without missing tokens',t=>{
 const dom=new JSDOM('<head></head>');t.after(()=>dom.window.close());
 const theme=fs.readFileSync(path.join(__dirname,'../frontend/shared/static/css/public-theme.css'),'utf8');
 const defined=new Set([...theme.matchAll(/(--public-[\w-]+)\s*:/g)].map(m=>m[1]));
 const files=['frontend/public/static/css/public.css','frontend/public/static/css/academic.css','frontend/public/static/css/home.css','frontend/public/static/css/faculty.css','transfer/frontend/native/portal.css','frontend/shared/static/css/public-controls.css','frontend/shared/static/css/public-background.css'];
 const walk=rules=>{for(const r of rules){if(r.cssRules)walk(r.cssRules);if(!r.style)continue;for(let i=0;i<r.style.length;i++){const name=r.style[i],value=r.style.getPropertyValue(name);assert.doesNotMatch(value,/#(?:[a-f\d]{3,8})\b|\b(?:rgba?|hsla?)\(/i);if(['font','font-family','font-size','font-weight','line-height','letter-spacing'].includes(name))assert.match(value,/^(var\(|inherit$|normal$|initial$|unset$)/);for(const m of value.matchAll(/var\((--public-[\w-]+)/g))assert(defined.has(m[1]),m[1]);}}};
 for(const file of files){const el=dom.window.document.createElement('style');el.textContent=fs.readFileSync(path.join(__dirname,'..',file),'utf8');dom.window.document.head.append(el);assert(el.sheet,file);walk(el.sheet.cssRules);}
 // Theme scopes shared overrides away from administration and keeps reading sizes in one source.
 assert.match(theme,/body\.section-public:not\(\.transfer-public\)/);assert.match(theme,/--public-root-large:20px/);
});
test('news video appended by infinite scroll exposes fallback on media error',t=>{
 const f=fixture(t),root=f.w.document.querySelector('[data-stream-items]');
 root.innerHTML='<div data-public-media><video src="/media/video" controls preload="none"></video><span data-media-fallback hidden>研</span></div>';
 root.dispatchEvent(new f.w.CustomEvent('public:appended',{bubbles:true}));
 assert.equal(root.querySelector('span').hidden,true);
 root.querySelector('video').dispatchEvent(new f.w.Event('error'));
 assert.equal(root.querySelector('video').hidden,true);assert.equal(root.querySelector('span').hidden,false);
});
