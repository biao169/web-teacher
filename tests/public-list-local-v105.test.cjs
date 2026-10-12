const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const scripts=Object.fromEntries(['public-list','public-query','public-stream','public-people','public-filters'].map(name=>[name,fs.readFileSync(path.join(__dirname,'../frontend/public/static/js/'+name+'.js'),'utf8')]));
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function model(table='profiles',lang='zh'){
 const rows=Array.from({length:25},(_,i)=>({uid:'p'+i,display:{name:'姓名 '+i,title:i%2?'教授':'讲师',bio:'安全 <script>文字</script>',email:'public@example.test'},filter_values:{uid:'p'+i,name:'姓名 '+i,title:i%2?'教授':'讲师',category:i%2?'A; B':'C',year:2020+i%2},filter_tokens:{category:i%2?['A','B']:['C']},search_values:['姓名 '+i,i===4?'AI %_\\':'English '+i],order:{group:table==='students'?Math.floor(i/10):0,rank:i},media:{},links:{homepage:'https://example.test'},detail_url:'/zh/'+table+'/p'+i}));
 return {schema_version:'public-read-model-v1',model_key:table+'-public-index-'+lang,module:table,lang,complete:true,total:rows.length,items:rows,groups:[{label:'博士'},{label:'硕士'},{label:'其他'}],facets:[{field:'title',values:['教授','讲师'],labels:{}}],semantics:{filters:{uid:{kind:'text',operators:['eq']},name:{kind:'text',operators:['eq','contains']},title:{kind:'text',operators:['eq','contains']},category:{kind:'text',operators:['eq'],facet_tokens:true},year:{kind:'integer',operators:['eq']}}}};
}
function fixture(t,{table='profiles',lang='zh',url='',nav=false}={}){
 const html=`<a data-public-language="en" href="/en/${table}">English</a><form data-public-query-form data-person-form action="/${lang}/${table}"><input name="q"><label data-person-facet data-field="title" data-facet-label="职称"><select id="title" name="f.title"><option value="">全部</option></select><button data-facet-trigger hidden type="button"><span class="facet-current">Options</span></button><button data-facet-more hidden type="button">More</button></label><input name="direction" type="radio" value="asc" checked><input name="direction" type="radio" value="desc"><button type="submit">Apply</button><a data-person-reset href="/${lang}/${table}">Reset</a><div data-person-selection hidden><input data-person-all type="checkbox"><span data-person-count></span><button data-person-copy disabled type="button">Copy</button><button data-person-clear disabled type="button">Clear</button></div><span data-person-total>25</span><span data-person-tool-status></span>${table==='publications'?'<select data-copy-format><option value="gbt">GB/T</option></select>':''}</form><section data-public-list-local data-public-stream ${nav?'data-nav="fixed"':''} ${!['profiles','students'].includes(table)?'data-public-content':''} data-table="${table}" data-lang="${lang}" data-home="0" data-page="1" data-total="25" data-next="/${lang}/${table}?page=2"><div data-stream-items><article data-record-id="old" data-person-card><input type="checkbox" data-person-select><h2>Original HTML</h2></article></div><div data-stream-controls><a data-load-more href="/${lang}/${table}?page=2">More</a><a data-page-fallback>Next</a><span data-stream-status></span></div></section>`;
 const dom=new JSDOM(html,{url:'https://teacher.test'+(url||'/'+lang+'/'+table),runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,requests=[],copied=[];
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.fetch=(url,opts)=>new Promise((resolve,reject)=>requests.push({url,opts,resolve,reject}));w.navigator.clipboard={writeText:async value=>copied.push(value)};
 for(const name of ['public-list','public-query','public-stream','public-people','public-filters'])w.eval(scripts[name]);
 const $=selector=>w.document.querySelector(selector),ids=()=>[...w.document.querySelectorAll('[data-stream-items] article')].map(x=>x.dataset.recordId);
 async function respond(value=model(table,lang),status=200){requests[0].resolve({ok:status===200,headers:{get:key=>key.toLowerCase()==='content-type'?'application/json':key.toLowerCase()==='x-teacher-data-ok'?'1':null},text:async()=>JSON.stringify(value)});await tick();await tick();}
 const navigate=query=>w.teacherPublicList.navigate(new w.URL('/'+lang+'/'+table+query,w.location.href));
 return {w,$,requests,copied,ids,respond,navigate};
}
test('HTML stays visible while pending; one anonymous fixed data fetch owns all subsequent operations',async t=>{
 const f=fixture(t);assert.deepEqual(f.ids(),['old']);assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/api/public/data/zh/profiles');assert.equal(f.requests[0].opts.credentials,'omit');
 f.$('[data-facet-trigger]').click();await tick();assert.equal(f.requests.length,1);await f.respond();assert.equal(f.ids().length,10);assert.equal(f.$('[data-local-page]').textContent,'下一页');
 f.$('[data-facet-trigger]').click();f.$('[data-facet-more]').click();f.$('select').value='教授';f.$('input[name=q]').value='姓名';f.$('form').dispatchEvent(new f.w.Event('submit',{cancelable:true,bubbles:true}));assert.equal(f.ids().length,10);assert(f.ids().every(x=>Number(x.slice(1))%2));assert.equal(f.requests.length,1);
 const state=JSON.parse(Buffer.from(new URL(f.w.location.href).searchParams.get('s'),'base64url'));assert.equal(state['f.title'],'教授');assert.equal(state.q,'姓名');
 f.$('[data-local-page]').click();assert.deepEqual(f.ids(),['p21','p23']);assert.equal(f.requests.length,1);f.$('[data-person-reset]').click();assert.equal(f.ids()[0],'p0');assert.equal(f.requests.length,1);
});
test('literal search, binary equality, token matching, numeric equality and contains match public semantics',async t=>{
 const f=fixture(t);await f.respond();assert(f.navigate('?q= %25_%5C '));assert.deepEqual(f.ids(),['p4']);assert(f.navigate('?f.title=教授'));assert(f.ids().every(x=>Number(x.slice(1))%2));assert(f.navigate('?f.title=教授%20'));assert.deepEqual(f.ids(),[]);
 assert(f.navigate('?f.category=b'));assert(f.ids().every(x=>Number(x.slice(1))%2));assert(f.navigate('?f.category=A%3B%20B'));assert(f.ids().every(x=>Number(x.slice(1))%2));assert(f.navigate('?f.year=2021'));assert(f.ids().every(x=>Number(x.slice(1))%2));assert(f.navigate('?c.name=姓名%202'));assert.deepEqual(f.ids(),['p2','p20','p21','p22','p23','p24']);assert.equal(f.requests.length,1);
});
test('student descending reverses within groups, pagination clamps, legacy size maps to 20',async t=>{
 const f=fixture(t,{table:'students'});await f.respond();f.navigate('?direction=desc&size=20');assert.deepEqual(f.ids(),[...Array.from({length:10},(_,i)=>'p'+(9-i)),...Array.from({length:10},(_,i)=>'p'+(19-i))]);f.navigate('?page=999999&size=50');assert.deepEqual(f.ids(),['p20','p21','p22','p23','p24']);assert.equal(f.$('[data-public-stream]').dataset.page,'2');
});
test('back/forward restores controls, clears selection, refreshes language and detail return links without reads',async t=>{
 const f=fixture(t);await f.respond();f.$('[data-person-all]').click();assert(f.$('[data-person-copy]').disabled===false);f.navigate('?f.title=教授&page=2');assert(f.$('[data-person-copy]').disabled);assert.equal(f.$('select').value,'教授');
 const url=new URL(f.$('[data-person-link]').href);assert.equal(url.searchParams.get('from'),'/zh/profiles?f.title=%E6%95%99%E6%8E%88&page=2');assert.equal(new URL(f.$('[data-public-language]').href).search,'?f.title=%E6%95%99%E6%8E%88&page=2');
 f.w.history.back();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(f.$('select').value,'');assert.equal(f.ids()[0],'p0');assert.equal(f.requests.length,1);
});
test('unavailable, incomplete and oversized data leave HTML and native navigation available',async t=>{
 for(const mode of ['503','incomplete','oversized']){const f=fixture(t);const value=model();if(mode==='incomplete')value.complete=false;if(mode==='oversized')value.items[0].display.bio='X'.repeat(524288);await f.respond(value,mode==='503'?503:200);assert.deepEqual(f.ids(),['old']);assert.equal(f.$('[data-public-stream]').dataset.localReady,undefined);assert.equal(f.$('[data-public-stream]').dataset.localPending,undefined);assert.equal(f.navigate('?page=2'),false);assert(!f.$('[data-person-tool-status]').textContent.includes('错误'));}
});
test('unsafe query and URLs never replace successful visible content; raw markup renders as text',async t=>{
 const f=fixture(t);await f.respond();assert.equal(f.$('[data-stream-items] script'),null);assert.match(f.$('[data-stream-items]').textContent,/<script>/);const before=f.ids();for(const q of ['?home=1','?f.private=x','?c.uid=x','?page=0','?q=a&q=b','?size=3','?s=broken'])assert.equal(f.navigate(q),false);assert.deepEqual(f.ids(),before);
});
test('fixed navigation never initializes the local model',t=>{const f=fixture(t,{nav:true});assert.equal(f.requests.length,0);assert.equal(f.w.teacherPublicList,undefined);});
for(const table of ['profiles','students','projects','publications','patents','courses','research_interests','news'])for(const lang of ['zh','en'])test(`${table}/${lang} renders and pages from complete model`,async t=>{const f=fixture(t,{table,lang});await f.respond();assert.equal(f.ids().length,10);assert.equal(f.$('[data-public-stream]').dataset.localReady,'1');assert(f.navigate('?direction=desc&page=2'));assert.equal(f.ids().length,10);assert.equal(f.requests.length,1);});
test('publication copy fetches actual citation even when display is a bibliographic summary',async t=>{
 const f=fixture(t,{table:'publications'});await f.respond();f.$('[data-copy-citation]').click();await tick();assert.equal(f.requests.length,2);assert.match(f.requests[1].url,/\/api\/public\/publications\/citations/);f.requests[1].resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({format:'gbt',rows:[{uid:'p0',text:'Actual formatted citation'}]})});await tick();await tick();assert.deepEqual(f.copied,['Actual formatted citation']);
});
test('real SQLite read models match native list ordering, filtering and pagination in all 16 indexes',async t=>{
 const {spawnSync}=require('node:child_process');const result=spawnSync('python3',['-B',path.join(__dirname,'public_list_parity_fixture.py')],{cwd:path.join(__dirname,'..'),encoding:'utf8',env:process.env,maxBuffer:16*1024*1024});assert.equal(result.status,0,result.stderr);
 for(const entry of JSON.parse(result.stdout)){
  const f=fixture(t,entry);await f.respond(entry.model);
  for(const sample of entry.cases){const query=new URLSearchParams(sample.query);assert(f.navigate('?'+query),entry.table+'/'+entry.lang+' '+query);assert.deepEqual(f.ids(),sample.uids,entry.table+'/'+entry.lang+' '+query);assert.equal(Number(f.$('[data-public-stream]').dataset.total),sample.total);assert.equal(Number(f.$('[data-public-stream]').dataset.page),sample.page);}
  assert.equal(f.requests.length,1);
 }
});
test('data failure restores the existing server fragment loader',async t=>{
 const f=fixture(t);await f.respond(model(),503);f.$('[data-load-more]').click();await tick();assert.equal(f.requests.length,2);assert.equal(f.requests[1].url,'/zh/profiles?page=2');assert.equal(f.requests[1].opts.headers['X-Public-Fragment'],'1');
 f.requests[1].resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({table:'profiles',lang:'zh',home:false,page:2,total:25,next_url:'/zh/profiles?page=3',html:'<article data-record-id="fallback"><h2>Fallback HTML</h2></article>'})});await tick();assert.deepEqual(f.ids(),['old','fallback']);
});
test('configured citation display copies exact public text without another request',async t=>{
 const f=fixture(t,{table:'publications'}),value=model('publications');value.items[0].citation={style:'apa',text:'Exact APA <text>',highlight:'Exact'};await f.respond(value);assert.equal(f.$('[data-citation-text]').textContent,'Exact APA <text>');assert.equal(f.$('[data-citation-text]').dataset.citationHighlight,'Exact');
 // A real format control includes all five choices.
 f.$('[data-copy-format]').add(new f.w.Option('APA','apa'));f.$('[data-copy-format]').value='apa';f.$('[data-copy-citation]').click();await tick();await tick();assert.deepEqual(f.copied,['Exact APA <text>']);assert.equal(f.requests.length,1);
});
