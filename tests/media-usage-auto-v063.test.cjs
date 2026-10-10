const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
async function setup(t,n=41){
 const dom=new JSDOM('<main>'+Array.from({length:n},(_,i)=>`<a data-media-locations="u${i}" href="/admin/media/u${i}/inspect"><span data-media-usage-summary>待读取</span></a>`).join('')+'<input id="search"><button data-column-sort="uid"></button></main>',{url:'https://example.test/admin/media_assets',runScripts:'outside-only'});
 const w=dom.window,timers=new Map(),calls=[];let serial=0;
 w.setTimeout=(fn,ms)=>{timers.set(++serial,{fn,ms});return serial};w.clearTimeout=id=>timers.delete(id);
 const context=dom.getInternalVMContext();const dep=new vm.SyntheticModule(['requestJSON','adminFetch'],function(){this.setExport('requestJSON',()=>{});this.setExport('adminFetch',(url,options)=>new Promise(resolve=>calls.push({url,options,resolve})))},{context});
 const mod=new vm.SourceTextModule(fs.readFileSync('frontend/admin/static/js/native-media-locations.js','utf8'),{context});await mod.link(()=>dep);await mod.evaluate();
 const root=w.document.querySelector('main'),dispose=mod.namespace.setupMediaLocations(root);t.after(()=>{dispose();dom.window.close()});
 const fire=ms=>{for(const [id,x] of [...timers])if(x.ms===ms){timers.delete(id);x.fn()}};
 const finish=async(i)=>{calls[i].resolve({ok:true,json:async()=>({items:Object.fromEntries(Array.from({length:n},(_,j)=>['u'+j,{used:false,groups:[]}]))})});await new Promise(r=>setImmediate(r))};
 return {w,root,calls,timers,fire,finish,dispose};
}
test('delayed current-page batches are serial, bounded20, separated200ms',async t=>{
 const f=await setup(t);assert.equal(f.calls.length,0);f.fire(1000);assert.equal(f.calls.length,1);assert.equal(new URL(f.calls[0].url,'https://x').searchParams.getAll('uid').length,20);
 f.fire(200);assert.equal(f.calls.length,1);await f.finish(0);assert.equal(f.root.querySelector('span').textContent,'未使用');f.fire(200);assert.equal(f.calls.length,2);await f.finish(1);f.fire(200);assert.equal(new URL(f.calls[2].url,'https://x').searchParams.getAll('uid').length,1);await f.finish(2);f.fire(200);assert.equal(f.calls.length,3);
});
for(const action of ['dispose','pagehide','refresh','search','sort','leave'])test(action+' aborts and ignores late response',async t=>{
 const f=await setup(t);f.fire(1000);
 if(action==='dispose')f.dispose();
 if(action==='pagehide')f.w.dispatchEvent(new f.w.Event('pagehide'));
 if(action==='refresh')f.root.dispatchEvent(new f.w.Event('native-list-loading'));
 if(action==='search')f.root.querySelector('input').dispatchEvent(new f.w.Event('input',{bubbles:true}));
 if(action==='sort')f.root.querySelector('button').click();
 if(action==='leave'){const a=f.w.document.createElement('a');a.href='/admin/news';a.addEventListener('click',e=>e.preventDefault());f.w.document.body.append(a);a.click();}
 assert.equal(f.calls[0].options.signal.aborted,true);await f.finish(0);assert.equal(f.root.querySelector('span').textContent,'读取中…');f.fire(200);assert.equal(f.calls.length,1);
});
