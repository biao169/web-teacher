const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const script=fs.readFileSync(path.join(__dirname,'../frontend/public/static/js/public-query.js'),'utf8');
function submit(t,{action='/en/n/ai-projects',values={q:'人工智能 & AI + %', 'f.source':'国家基金','c.name':'医疗','direction':'desc'}}={}){
 const dom=new JSDOM('<form data-public-query-form method="get"></form>',{url:'https://teacher.test/en/n/ai-projects'});t.after(()=>dom.window.close());const w=dom.window,form=w.document.querySelector('form');form.action=action;
 for(const [name,value] of Object.entries(values)){const input=w.document.createElement('input');input.name=name;input.value=value;form.append(input);}
 let navigated='';const ctx=vm.createContext({document:w.document,location:{href:w.location.href,origin:w.location.origin,assign:url=>{navigated=url}},FormData:w.FormData,URL,URLSearchParams,TextEncoder,btoa:s=>Buffer.from(s,'binary').toString('base64')});vm.runInContext(script,ctx);
 const event=new w.Event('submit',{cancelable:true});form.dispatchEvent(event);return {event,url:navigated,form};
}
test('Chinese visitor fields serialize as ASCII and retain fixed-entry path',t=>{
 const f=submit(t),url=new URL(f.url,'https://teacher.test');assert(f.event.defaultPrevented);assert.equal(url.pathname,'/en/n/ai-projects');assert(/^[\x00-\x7f]+$/.test(f.url));assert(!/%E[0-9A-F]/.test(f.url));
 assert.equal(url.searchParams.get('direction'),'desc');assert.equal(url.searchParams.get('q'),null);
 const state=JSON.parse(Buffer.from(url.searchParams.get('s'),'base64url').toString());assert.deepEqual(state,{'c.name':'医疗','f.source':'国家基金',q:'人工智能 & AI + %'});
});
test('empty controls omit state and cannot carry stale pagination or fixed rules',t=>{
 const f=submit(t,{values:{q:'','f.source':'',page:'9',nf:'tampered',nav:'other',direction:'asc'}});assert.equal(f.url,'/en/n/ai-projects?direction=asc');
});
test('cross-origin form action does not trigger scripted navigation',t=>{const f=submit(t,{action:'https://elsewhere.test/en/n/ai'});assert.equal(f.url,'');assert(!f.event.defaultPrevented);});
