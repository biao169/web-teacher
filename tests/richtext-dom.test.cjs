const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom'),project=path.resolve(__dirname,'..'),uid='a'.repeat(32);
async function runtime(){
 const dom=new JSDOM('<form><select name="content_format"><option selected>html</option></select><textarea name="content"></textarea></form>',{url:'http://site.test/admin/news/new',pretendToBeVisual:true,runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 w.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});w.Range.prototype.getClientRects=()=>[];
 d.querySelector('textarea').value=`<p>Before<img src="/media/${uid}" data-image-width="50%" data-image-min-width="120px" alt="Example">After</p><p>Destination</p>`;
 w.eval(fs.readFileSync(path.join(project,'frontend/shared/static/vendor/quill-2.0.3/dist/quill.js'),'utf8'));
 const sandbox={window:w,document:d,Quill:w.Quill,Event:w.Event,Option:w.Option,AbortController:w.AbortController,confirm:()=>true,console};const context=vm.createContext(sandbox),modules=new Map();
 function mod(name){if(modules.has(name))return modules.get(name);let module;
  if(['native-richtext.js','native-image-format.js','native-richtext-window.js'].includes(name))module=new vm.SourceTextModule(fs.readFileSync(path.join(project,'frontend/admin/static/js',name),'utf8'),{context});
  else {const values=name==='native-access.js'?{adminFetch:()=>{throw Error('Unexpected request')}}:name==='native-media-picker.js'?{chooseMedia:async()=>[],mediaContext:()=>({})}:name==='news-reader.js'?{mountNewsReader:()=>()=>{}}:{attachHelp:()=>{}};module=new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v)},{context})}
  modules.set(name,module);return module;
 }
 const main=mod('native-richtext.js');await main.link(spec=>mod(path.basename(spec.split('?')[0])));await main.evaluate();d.dispatchEvent(new w.Event('DOMContentLoaded'));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(d.querySelector('textarea').hidden,true,d.querySelector('[role=status]').textContent);
 const editor=w.Quill.find(d.querySelector('.native-richtext-host'));editor.history.clear();return {w,d,editor,formats:modules.get('native-image-format.js').namespace,close(){dom.window.close()}};
}
test('real Quill image panel persists alignment and bounded geometry across reload',async t=>{
 const r=await runtime();t.after(()=>r.close());const {d,w,editor}=r;const image=editor.root.querySelector('img');image.click();assert.equal(d.querySelector('fieldset').hidden,false);
 const width=d.querySelector('[data-rich-image-size=imageWidth]');assert.equal(width.value,'50');width.value='75';const unit=d.querySelector('[aria-label="图片宽度单位"]');unit.value='%';unit.dispatchEvent(new w.Event('change'));
 d.querySelector('[data-rich-image-size=imageHeight]').value='240';d.querySelector('[data-rich-image-apply]').click();
 const layout=d.querySelector('[data-rich-image-layout]');layout.value='image-align-right';layout.dispatchEvent(new w.Event('change'));
 const html=d.querySelector('textarea').value;assert.match(html,/data-image-width="75%"/);assert.match(html,/image-align-right/);assert.match(html,/height: 240px/);assert.match(html,/data-image-min-width="120px"/);
 editor.setContents(editor.clipboard.convert({html}),'silent');assert.equal(editor.root.querySelector('img').style.width,'75%');assert.equal(editor.root.querySelector('img').style.height,'240px');
});
test('real Quill rejects oversized percentage without changing content',async t=>{
 const r=await runtime();t.after(()=>r.close());r.editor.root.querySelector('img').click();const before=r.editor.getSemanticHTML();r.d.querySelector('[data-rich-image-size=imageWidth]').value='101';r.d.querySelector('[data-rich-image-apply]').click();assert.equal(r.editor.getSemanticHTML(),before);
});
test('drag and drop uses Firefox caret fallback, preserves attributes and undoes atomically',async t=>{
 const r=await runtime();t.after(()=>r.close());const {editor,w,d}=r,before=JSON.stringify(editor.getContents());const img=editor.root.querySelector('img');const originalIndex=editor.getIndex(w.Quill.find(img));
 const destination=editor.root.lastElementChild.firstChild;d.caretPositionFromPoint=()=>({offsetNode:destination,offset:3});
 const transfer={types:['application/x-teacher-image'],files:[],items:{clear(){}},clearData(){},setData(){}};
 for(const [name,node] of [['dragstart',img],['drop',editor.root]]){const event=new w.Event(name,{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:transfer});Object.defineProperty(event,'clientX',{value:0});Object.defineProperty(event,'clientY',{value:0});node.dispatchEvent(event)}
 assert.notEqual(editor.getIndex(w.Quill.find(editor.root.querySelector('img'))),originalIndex);assert.equal(editor.root.querySelector('img').getAttribute('data-image-width'),'50%');
 editor.history.undo();assert.equal(JSON.stringify(editor.getContents()),before);editor.history.redo();assert.notEqual(editor.getIndex(w.Quill.find(editor.root.querySelector('img'))),originalIndex);
});
test('numeric dimension validator rejects CSS injection',async t=>{
 const r=await runtime();t.after(()=>r.close());for(const value of ['0px','4097px','101%','url(x)','20px;position:fixed'])assert.equal(r.formats.imageSize('imageWidth',value),'');assert.equal(r.formats.imageSize('imageWidth','100%'),'100%');
});

test('independent window keeps the same editor, pins controls outside scroll and returns draft on Escape',async t=>{
 const r=await runtime();t.after(()=>r.close());const {d,w,editor}=r;const shell=d.querySelector('.native-richtext-workspace'),dialog=d.querySelector('dialog'),open=d.querySelector('[data-rich-window-open]');
 editor.root.querySelector('img').click();open.click();assert.equal(dialog.open,true);assert.ok(dialog.contains(shell));assert.equal(w.Quill.find(d.querySelector('.native-richtext-host')),editor);
 const top=d.querySelector('.native-richtext-top'),scroll=d.querySelector('.native-richtext-scroll');assert.ok(top.contains(d.querySelector('.ql-toolbar')));assert.ok(top.contains(d.querySelector('fieldset')));assert.equal(scroll.contains(d.querySelector('fieldset')),false);
 editor.insertText(0,'Modal draft ','user');dialog.dispatchEvent(new w.Event('cancel',{cancelable:true}));assert.equal(dialog.open,false);assert.equal(dialog.contains(shell),false);assert.match(d.querySelector('textarea').value,/Modal(?: |&nbsp;)draft/);assert.equal(d.activeElement,open);assert.equal(d.body.style.overflow,'');
 open.click();assert.equal(w.Quill.find(d.querySelector('.native-richtext-host')),editor);d.querySelector('[data-rich-window-close]').click();assert.equal(dialog.open,false);
});
test('dimension input and unit changes update the real editor immediately without apply',async t=>{
 const r=await runtime();t.after(()=>r.close());const {d,w,editor}=r;editor.root.querySelector('img').click();const width=d.querySelector('[data-rich-image-size=imageWidth]');
 width.value='30';width.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(editor.root.querySelector('img').style.width,'30%');assert.match(d.querySelector('textarea').value,/data-image-width="30%"/);
 const unit=d.querySelector('[aria-label="图片宽度单位"]');unit.value='px';unit.dispatchEvent(new w.Event('change'));width.value='160';width.dispatchEvent(new w.Event('input'));assert.equal(editor.root.querySelector('img').style.width,'160px');
 width.value='9999';width.dispatchEvent(new w.Event('input'));assert.equal(editor.root.querySelector('img').style.width,'160px');width.value='';width.dispatchEvent(new w.Event('input'));assert.equal(editor.root.querySelector('img').style.width,'');
});

test('unsupported dialog keeps the inline editor and draft usable',async t=>{
 const r=await runtime();t.after(()=>r.close());const {d,editor}=r,before=editor.getSemanticHTML();d.querySelector('dialog').showModal=undefined;d.querySelector('[data-rich-window-open]').click();assert.equal(d.querySelector('dialog').contains(d.querySelector('.native-richtext-workspace')),false);assert.equal(editor.getSemanticHTML(),before);assert.match(d.querySelector('[role=status]').textContent,/继续/);
});
