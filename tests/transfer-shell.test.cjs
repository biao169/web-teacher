const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const base=path.join(__dirname,'../transfer/frontend/native');
async function setup(legacy=false){
 let html=fs.readFileSync(path.join(base,'portal.html'),'utf8').replace(/\{%[\s\S]*?%\}/g,'').replace(/\{\{[\s\S]*?\}\}/g,'');
 const dom=new JSDOM(html,{url:'https://teacher.test/transfer/'}),d=dom.window.document;
 if(legacy){d.querySelectorAll('[data-mode=lan],[data-mode=relay],[data-lan],[data-relay]').forEach(node=>node.remove())}
 let requests=0;const context=vm.createContext({document:d,window:dom.window,sessionStorage:dom.window.sessionStorage,location:dom.window.location,navigator:dom.window.navigator,confirm:()=>true,URL,Error,TypeError,Number,JSON,Array,Uint8Array,AbortController,setTimeout,clearTimeout,fetch:()=>{requests++;throw Error('Unexpected request')}});
 const core=new vm.SourceTextModule(fs.readFileSync(path.join(base,'portal-core.js'),'utf8'),{context});
 const controller=new vm.SourceTextModule(fs.readFileSync(path.join(base,'portal.js'),'utf8'),{context});await controller.link(require('./helpers/transfer-modules.cjs').linker(context));await controller.evaluate();
 const shell=new vm.SourceTextModule(fs.readFileSync(path.join(base,'portal-shell.js'),'utf8'),{context});await shell.link(require('./helpers/transfer-modules.cjs').linker(context));await shell.evaluate();
 return {dom,d,requests:()=>requests};
}
test('mode changes preserve all files, progress and receive fields without transport calls',async()=>{
 const {dom,d,requests}=await setup();try{
 const file=d.querySelector('#lan-file'),progress=d.querySelector('#lan-progress'),code=d.querySelector('#relay-code');progress.value=63;code.value='secret';
 assert.equal(d.querySelector('#workspace-cache').hidden,false);assert.equal(d.querySelector('#workspace-lan').hidden,true);
 for(const mode of ['lan','relay','cache','lan'])d.querySelector('[data-mode='+mode+']').click();
 assert.equal(d.querySelector('#lan-file'),file);assert.equal(progress.value,63);assert.equal(code.value,'secret');assert.equal(requests(),0);
 assert.equal(d.querySelectorAll('[role=tabpanel]:not([hidden])').length,1);
 }finally{dom.window.close()}
});
test('send/receive filter applies across all modes and leaves shared cancellation controls visible',async()=>{
 const {dom,d}=await setup();try{
 d.querySelector('[data-view=receive]').click();
 for(const panel of d.querySelectorAll('[data-mode-panel]')){
 assert.equal(panel.querySelector('[data-area=send]').hidden,true);assert.equal(panel.querySelector('[data-area=receive]').hidden,false);
 }
 assert.equal(d.querySelectorAll('[data-direction-panels].single').length,3);
 assert.equal(d.querySelector('#relay-cancel').closest('[data-area]'),null);
 d.querySelector('[data-view=all]').click();assert.equal(d.querySelectorAll('[data-area][hidden]').length,0);
 }finally{dom.window.close()}
});
test('tabs support arrows, wrapping, Home/End and matching accessible panels',async()=>{
 const {dom,d}=await setup();try{
 let tab=d.querySelector('[data-mode=cache]');tab.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 assert.equal(d.activeElement.id,'mode-lan');d.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(d.activeElement.id,'mode-cache');
 d.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(d.activeElement.id,'mode-lan');
 assert.equal(d.querySelectorAll('[role=tab][tabindex="0"]').length,1);
 for(const t of d.querySelectorAll('[role=tab]'))assert.equal(d.getElementById(t.getAttribute('aria-controls')).getAttribute('aria-labelledby'),t.id);
 }finally{dom.window.close()}
});
test('hidden mode feedback remains available, escaped, and can reopen its workspace',async()=>{
 const {dom,d}=await setup();try{
 d.querySelector('#lan-status').textContent='<img src=x onerror=alert(1)> 已暂停';await new Promise(resolve=>setTimeout(resolve,0));
 const li=d.querySelector('[data-mode-status] li');assert.match(li.textContent,/已暂停/);assert.equal(li.querySelector('img'),null);
 li.querySelector('button').click();assert.equal(d.querySelector('#workspace-lan').hidden,false);assert.equal(d.activeElement.id,'mode-lan');
 }finally{dom.window.close()}
});
test('legacy cached-only mode remains usable and does not offer absent transports',async()=>{
 const {dom,d,requests}=await setup(true);try{assert.equal(d.querySelectorAll('[role=tab]').length,1);assert.equal(d.querySelector('#workspace-cache').hidden,false);assert.equal(d.querySelector('[data-mode-status]').children.length,1);assert.equal(requests(),0)}finally{dom.window.close()}
});
