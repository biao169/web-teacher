const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const source=fs.readFileSync(path.join(__dirname,'../frontend/shared/static/js/public-background.js'),'utf8');
test('background follows visibility without replacing content or stealing input',t=>{
 const dom=new JSDOM('<html><body class="section-public"><div class="public-ambient" aria-hidden="true"></div><input value="AB1234"><button>A+</button></body></html>',{runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window,d=w.document,input=d.querySelector('input');
 w.eval(source);assert.equal(d.documentElement.dataset.publicMotion,'running');Object.defineProperty(d,'hidden',{configurable:true,value:true});d.dispatchEvent(new w.Event('visibilitychange'));assert.equal(d.documentElement.dataset.publicMotion,'paused');
 Object.defineProperty(d,'hidden',{configurable:true,value:false});w.dispatchEvent(new w.Event('pageshow'));assert.equal(d.documentElement.dataset.publicMotion,'running');w.dispatchEvent(new w.Event('pagehide'));assert.equal(d.documentElement.dataset.publicMotion,'paused');assert.equal(d.querySelector('input'),input);assert.equal(input.value,'AB1234');
});
test('admin page is untouched',t=>{
 const dom=new JSDOM('<body class="section-admin"></body>',{runScripts:'outside-only'});t.after(()=>dom.window.close());dom.window.eval(source);assert.equal(dom.window.document.documentElement.dataset.publicMotion,undefined);
});
test('CSS has no images or fixed page dimensions and provides static/print fallbacks',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../frontend/shared/static/css/public-background.css'),'utf8');assert(!css.includes('url('));assert.match(css,/pointer-events:none/);assert.match(css,/overflow:hidden/);assert.match(css,/isolation:isolate/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/animation:none;transform:none/);assert.match(css,/@media print/);assert.match(css,/forced-colors:active/);assert(!/[;{]\s*(?:filter|backdrop-filter|width|min-width):/.test(css));
});
