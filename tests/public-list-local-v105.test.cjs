const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const scripts=Object.fromEntries(['public-list','public-query','public-stream','public-people','public-filters'].map(name=>[name,fs.readFileSync(path.join(__dirname,'../frontend/public/static/js/'+name+'.js'),'utf8')]));
const cardIcons=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/public-card-icons-v109.json'),'utf8'));
const iconTemplates=Object.entries(cardIcons).map(([name,svg])=>`<template data-public-card-icon="${name}">${svg}</template>`).join('');
const publicationTemplates=JSON.parse(require('node:child_process').execFileSync(process.env.TEST_PYTHON||'python3',['-B','-c',`from pathlib import Path
import json
from backend.app.web.rendering import Renderer
r=Renderer.local(Path.cwd())
print(json.dumps({lang:r.render('public/content-card.html',table='publications',row={'uid':'','title':''},lang=lang,title_field={'publications':'title'},pages={'total':0,'page':1,'size':10},row_index=0,media_map={},home_mode=False,detail=False,publication_template=True) for lang in ['zh','en']}))`],{cwd:path.join(__dirname,'..'),encoding:'utf8'}));
const extraTemplates=JSON.parse(require('node:child_process').execFileSync(process.env.TEST_PYTHON||'python3',['-B','-c',`from pathlib import Path
import json
from backend.app.web.rendering import Renderer
r=Renderer.local(Path.cwd())
print(json.dumps({lang:{'news':r.render('public/content-card.html',table='news',row={'uid':'','title':''},lang=lang,title_field={'news':'title'},pages={'total':0,'page':1,'size':10},row_index=0,media_map={},home_mode=False,detail=False,card_template=True),'profiles':r.render('public/person-links.html',table='profiles',row={},lang=lang,person_link_template=True),'students':r.render('public/person-links.html',table='students',row={},lang=lang,person_link_template=True),**{table:r.render('public/content-card.html',table=table,row={'uid':'','title':''},lang=lang,title_field={table:'title'},pages={'total':0,'page':1,'size':10},row_index=0,media_map={},home_mode=False,detail=False,card_template=True) for table in ['patents','courses']}} for lang in ['zh','en']}))`],{cwd:path.join(__dirname,'..'),encoding:'utf8'}));
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function model(table='profiles',lang='zh'){
 const rows=Array.from({length:25},(_,i)=>({uid:'p'+i,display:{name:'姓名 '+i,title:i%2?'教授':'讲师',bio:'安全 <script>文字</script>',email:'public@example.test'},filter_values:{uid:'p'+i,name:'姓名 '+i,title:i%2?'教授':'讲师',category:i%2?'A; B':'C',year:2020+i%2},filter_tokens:{category:i%2?['A','B']:['C']},search_values:['姓名 '+i,i===4?'AI %_\\':'English '+i],order:{group:table==='students'?Math.floor(i/10):0,rank:i},media:{},links:{homepage:'https://example.test'},detail_url:'/'+lang+'/'+table+'/p'+i}));
 return {revision:'7',schema_version:'public-read-model-v1',model_key:table+'-public-index-'+lang,module:table,lang,complete:true,total:rows.length,items:rows,groups:[{label:'博士'},{label:'硕士'},{label:'其他'}],facets:[{field:'title',values:['教授','讲师'],labels:{}}],semantics:{filters:{uid:{kind:'text',operators:['eq']},name:{kind:'text',operators:['eq','contains']},title:{kind:'text',operators:['eq','contains']},category:{kind:'text',operators:['eq'],facet_tokens:true},year:{kind:'integer',operators:['eq']}}}};
}
function fixture(t,{table='profiles',lang='zh',url='',nav=false,iconDefinitions='templates',publicationDefinition=true,snapshot=false,lateStream=false,shared=true}={}){
 let html=`<a data-public-language="en" href="/en/${table}">English</a><form data-public-query-form data-person-form action="/${lang}/${table}"><input name="q"><label data-person-facet data-field="title" data-facet-label="职称"><select id="title" name="f.title"><option value="">全部</option></select><button data-facet-trigger hidden type="button"><span class="facet-current">Options</span></button><button data-facet-more hidden type="button">More</button></label><input name="direction" type="radio" value="asc" checked><input name="direction" type="radio" value="desc"><button type="submit">Apply</button><a data-person-reset href="/${lang}/${table}">Reset</a><div data-person-selection hidden><input data-person-all type="checkbox"><span data-person-count></span><button data-person-copy disabled type="button">Copy</button><button data-person-clear disabled type="button">Clear</button></div><span data-person-total>25</span><span data-person-tool-status></span>${table==='publications'?'<select data-copy-format><option value="gbt">GB/T</option></select>':''}</form><section data-public-list-local data-public-stream ${nav?'data-nav="fixed"':''} ${!['profiles','students'].includes(table)?'data-public-content':''} data-table="${table}" data-lang="${lang}" data-home="0" data-page="1" data-total="25" data-next="/${lang}/${table}?page=2">${iconDefinitions==='templates'?iconTemplates:''}${table==='publications'&&publicationDefinition?'<template data-publication-card>'+publicationTemplates[lang]+'</template>':''}${table==='news'?'<template data-news-card>'+extraTemplates[lang].news+'</template>':''}${['profiles','students'].includes(table)?'<template data-person-links>'+extraTemplates[lang][table]+'</template>':''}${['patents','courses'].includes(table)?'<template data-compact-card>'+extraTemplates[lang][table]+'</template>':''}<div data-stream-items><article data-record-id="old" data-person-card><input type="checkbox" data-person-select><h2>Original HTML</h2>${iconDefinitions==='legacy'?'<div class="person-actions"><button data-person-expand>'+cardIcons['chevron-down']+'</button><a class="person-icon" data-person-link>'+cardIcons['box-arrow-up-right']+'</a></div>':''}</article></div><div data-stream-controls><a data-load-more href="/${lang}/${table}?page=2">More</a><a data-page-fallback>Next</a><span data-stream-status></span></div></section>`;
 if(snapshot){
  html=html.replace('data-public-list-local data-public-stream','data-public-list-local data-local-size="10" data-public-stream');
  const cards=Array.from({length:10},(_,i)=>`<article data-record-id="p${i}" data-person-card><input type="checkbox" data-person-select><h2>SSR ${i}</h2><p class="is-expanded" data-person-biography>Already expanded</p></article>`).join('');
  html=html.replace(/<div data-stream-items>[\s\S]*?<\/div><div data-stream-controls>/,'<div data-stream-items>'+cards+'</div><div data-stream-controls>');
  html='<main data-public-shared="'+(shared?'1':'0')+'" data-public-revision="7">'+html+'</main>';
 }
 const dom=new JSDOM(html,{url:'https://teacher.test'+(url||'/'+lang+'/'+table),runScripts:'outside-only',pretendToBeVisual:snapshot});t.after(()=>dom.window.close());const w=dom.window,requests=[],copied=[];
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.fetch=(url,opts)=>new Promise((resolve,reject)=>requests.push({url,opts,resolve,reject}));w.navigator.clipboard={writeText:async value=>copied.push(value)};
 for(const name of ['public-list','public-query','public-stream','public-people','public-filters'])if(!lateStream||name!=='public-stream')w.eval(scripts[name]);
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

for(const lang of ['zh','en'])test('teacher actions clone canonical SVG with accessible labels and return context: '+lang,async t=>{
 const f=fixture(t,{lang});await f.respond();
 const article=f.$('[data-record-id="p0"]'),actions=article.querySelector('.person-actions'),details=actions.querySelector('a.person-icon[data-person-link]'),expand=actions.querySelector('button[data-person-expand]');
 assert.ok(details);assert.equal(details.textContent.trim(),'');assert.equal(expand.textContent.trim(),'');
 assert.equal(details.title,lang==='en'?'View details':'查看详情');assert.equal(details.getAttribute('aria-label'),details.title);
 assert.equal(expand.getAttribute('aria-label'),lang==='en'?'Expand biography':'展开简介');
 for(const [button,name] of [[details,'box-arrow-up-right'],[expand,'chevron-down']])assert.equal(button.querySelector('svg').outerHTML,f.$('template[data-public-card-icon="'+name+'"]').content.querySelector('svg').outerHTML);
 const url=new URL(details.href);assert.equal(url.pathname,'/'+lang+'/profiles/p0');assert.equal(url.searchParams.get('from'),'/'+lang+'/profiles');
 f.navigate('?q=English%203');assert.ok(f.$('.person-actions a.person-icon svg'));assert.equal(f.requests.length,1);
});

test('legacy cached HTML reuses captured SSR icons across replacements',async t=>{
 const f=fixture(t,{iconDefinitions:'legacy'});await f.respond();assert.ok(f.$('.person-actions a svg'));f.navigate('?page=2');assert.ok(f.$('.person-actions a svg'));assert.equal(f.requests.length,1);
});
test('missing definitions preserve original HTML instead of broken dynamic controls',async t=>{
 const f=fixture(t,{iconDefinitions:'none'});await f.respond();assert.deepEqual(f.ids(),['old']);assert.equal(f.requests.length,1);
});

for(const lang of ['zh','en'])test('publication clones shared footer, icon, links and corresponding author markup: '+lang,async t=>{
 const f=fixture(t,{table:'publications',lang}),value=model('publications',lang);
 Object.assign(value.items[0].display,{title:'Paper <unsafe>',doi:'10.1000/a(b)',index_type:'SCI; EI',display_tags:'Tag A; Tag B',corresponding_authors:'Smith, John',volume:'2',issue:'3',pages:'1-9'});
 value.items[0].citation={style:'apa',text:'Citation <script>literal</script>',highlight:''};value.items[0].links={url:'https://publisher.test/paper'};value.items[0].media={pdf_url:'/media/public-pdf'};
 await f.respond(value);const article=f.$('[data-record-id="p0"]'),footer=article.querySelector('.publication-footer');
 assert(footer);assert(footer.querySelector('.publication-links [data-copy-citation] svg'));assert.equal(footer.querySelector('[data-copy-citation]').textContent.trim(),'');assert.equal(footer.querySelector('[data-copy-citation]').hidden,false);
 assert.equal(article.querySelector('[data-citation-status]').getAttribute('aria-live'),'polite');assert.equal(article.querySelector('[data-citation-text]').textContent,'Citation <script>literal</script>');assert.equal(article.querySelector('script'),null);
 assert.equal(footer.querySelector('[data-publication-link="doi"]').getAttribute('href'),'https://doi.org/10.1000/a%28b%29');assert.equal(footer.querySelector('[data-publication-link="pdf"]').getAttribute('rel'),'noopener noreferrer');
 assert.equal(footer.querySelector('[data-public-authors]').dataset.authors,'Smith, John');assert.match(footer.querySelector('[data-publication-tag="corresponding_authors"]').textContent,/Smith, John/);
 assert.deepEqual([...footer.querySelectorAll('[data-publication-tag="index_type"]')].map(n=>n.textContent),['SCI','EI']);
 assert(f.navigate('?direction=desc&page=2'));assert(f.$('.publication-footer [data-copy-citation] svg'));assert.equal(f.requests.length,1);
});
test('missing publication template preserves SSR and ordinary server forms without a data request',async t=>{
 const f=fixture(t,{table:'publications',publicationDefinition:false});await tick();assert.deepEqual(f.ids(),['old']);assert.equal(f.requests.length,0);assert.equal(f.w.teacherPublicList,undefined);
});
test('missing citation uses shared localized fallback and does not enable invalid copy',async t=>{
 const f=fixture(t,{table:'publications'}),value=model('publications');value.items[0].citation={style:'ieee',text:'',highlight:''};Object.assign(value.items[0].display,{volume:'2',issue:'3',pages:'1-9',doi:'10.1000/a'});await f.respond(value);
 const citation=f.$('[data-record-id="p0"] [data-citation-text]');assert(citation.hasAttribute('data-citation-fallback'));assert.match(citation.textContent,/\[IEEE 引文未填写；基本著录信息\]/);assert.match(citation.textContent,/; 卷 2; 期 3; 页码 1-9; DOI: 10.1000\/a/);
});

for(const lang of ['zh','en'])test('news categories split without comma and token filter matches single category: '+lang,async t=>{
 const f=fixture(t,{table:'news',lang}),value=model('news',lang);value.facets=[{field:'category',values:['研讨, Forum','学术动态','诊断研究'],labels:{}}];
 value.items.forEach((item,i)=>{item.display.category=i===0?'学术动态；研讨, Forum\r\n诊断研究;学术动态':i===1?'Other':'No category';item.filter_values.category=item.display.category;item.filter_tokens.category=i===0?['学术动态','研讨, Forum','诊断研究']:['Other'];});
 await f.respond(value);assert.deepEqual([...f.$('[data-record-id="p0"]').querySelectorAll('[data-news-category]')].map(n=>n.textContent),['学术动态','研讨, Forum','诊断研究']);
 assert(f.navigate('?f.category='+encodeURIComponent('诊断研究')));assert.deepEqual(f.ids(),['p0']);assert(f.navigate('?f.category='+encodeURIComponent('研讨, Forum')));assert.deepEqual(f.ids(),['p0']);assert.equal(f.requests.length,1);
});
test('publication split tags skip empty and duplicate values while preserving comma and text safety',async t=>{
 const f=fixture(t,{table:'publications'}),value=model('publications');Object.assign(value.items[0].display,{index_type:' SCI；EI\r\nSCI; ;',display_tags:'Tag, intact; <script>unsafe</script>\nAnother'});await f.respond(value);const card=f.$('[data-record-id="p0"]');
 assert.deepEqual([...card.querySelectorAll('[data-publication-tag="index_type"]')].map(n=>n.textContent),['SCI','EI']);assert.deepEqual([...card.querySelectorAll('[data-publication-tag="display_tags"]')].map(n=>n.textContent),['Tag, intact','<script>unsafe</script>','Another']);assert.equal(card.querySelector('script'),null);
});

test('separator-only publication tags and corresponding authors produce no empty labels',async t=>{
 const f=fixture(t,{table:'publications'}),value=model('publications');Object.assign(value.items[0].display,{publication_type:';；\n',index_type:' ; ',author_role:'\r\n',display_tags:'；',corresponding_authors:';\n'});await f.respond(value);assert.equal(f.$('[data-record-id="p0"]').querySelector('.content-tags'),null);
});

test('older news read model retains local single-category matching without another fetch',async t=>{
 const f=fixture(t,{table:'news'}),value=model('news');value.semantics.filters.category.facet_tokens=false;value.facets=[{field:'category',values:['A; B'],labels:{}}];value.items.forEach((item,i)=>{item.display.category=i===0?'A; B':'C';item.filter_values.category=item.display.category;delete item.filter_tokens.category;});await f.respond(value);assert(f.navigate('?f.category=B'));assert.deepEqual(f.ids(),['p0']);assert.equal(f.requests.length,1);
});

for(const lang of ['zh','en'])test('news clone retains server cover, details and category row: '+lang,async t=>{
 const f=fixture(t,{table:'news',lang});await f.respond();const card=f.$('[data-record-id="p0"]');assert(card.querySelector('.content-cover.public-media [data-media-fallback]'));assert(card.querySelector('.card-meta-row .person-icon svg'));assert.equal(card.querySelector('.person-icon').textContent.trim(),'');
});
test('teacher brand links precede biography; detail is first action; local append needs no data fetch',async t=>{
 const f=fixture(t),value=model();Object.defineProperty(f.w.document,'hidden',{value:false});value.items[0].links.google_scholar='https://scholar.google.com/citations?user=test';value.items[0].display.google_scholar=value.items[0].links.google_scholar;await f.respond(value);const card=f.$('[data-record-id="p0"]');assert(card.querySelector('.person-card-links .faculty-brand img'));assert(card.querySelector('.person-card-links').compareDocumentPosition(card.querySelector('[data-person-biography]'))&f.w.Node.DOCUMENT_POSITION_FOLLOWING);assert.equal(card.querySelector('.person-actions').firstElementChild.tagName,'A');assert.equal(f.ids().length,10);assert(f.w.teacherPublicList.append());assert.equal(f.ids().length,20);assert(f.w.teacherPublicList.append());assert.equal(f.ids().length,25);assert.equal(new Set(f.ids()).size,25);assert.equal(f.w.teacherPublicList.hasMore(),false);assert.equal(f.requests.length,1);
});

test('scroll fallback appends complete local results and never refetches the read model',async t=>{
 const f=fixture(t);Object.defineProperty(f.w.document,'hidden',{value:false});await f.respond();f.$('[data-stream-controls]').getBoundingClientRect=()=>({top:100,bottom:120,height:20});f.w.dispatchEvent(new f.w.Event('scroll'));await tick();await tick();assert.equal(f.ids().length,25);assert.equal(new Set(f.ids()).size,25);assert.equal(f.requests.length,1);
});

for(const lang of ['zh','en'])for(const table of ['students','patents','courses'])test('compact public card preserves metadata and safe template slots: '+table+'/'+lang,async t=>{
 const f=fixture(t,{table,lang}),value=model(table,lang),item=value.items[0];Object.assign(item.display,{degree:'PhD',category:'Research',grade:'2025',status:'Active',enrollment_date:'2025-09',direction:'AI',semester:'2025 Autumn',audience:'Graduate',legal_status:'Granted',grant_date:'2025-10',application_number:'APP-1',patent_type:'Patent',summary:'<script>safe plain text</script>'});item.media.certificate_url='/media/proof.pdf';item.media.syllabus_url='/media/course.pdf';item.truncated_fields=[table==='students'?'bio':'summary'];await f.respond(value);const card=f.$('[data-record-id="p0"]');assert.equal(card.querySelector('script'),null);
 if(table==='students'){assert.equal(card.querySelectorAll('.person-facts .student-chip').length,4);assert(card.querySelector('.student-highlights [data-public-field="direction"]'));assert.equal(card.querySelector('.person-copy').lastElementChild.dataset.personBiography,'');assert(card.querySelector('.person-actions [data-person-expand]'));assert(card.querySelector('.person-card-links svg'));}
 if(table==='patents'){assert.equal(card.querySelector('[data-patent-group="grant"] [data-public-field="legal_status"]').textContent.includes('Granted'),true);assert(card.querySelector('[data-patent-group="grant"] [data-public-field="grant_date"]'));assert(!card.querySelector('[data-public-field="grant_number"]'));assert(card.querySelector('[data-public-attachment="certificate_key"] svg'));assert.equal(card.querySelector('.patent-summary').textContent,item.display.summary);}
 if(table==='courses'){assert.equal(card.querySelector('.course-heading .content-facts').children.length,2);assert.equal(card.querySelector('[data-person-biography]').textContent,item.display.summary);assert.equal(card.dataset.descriptionUrl,'/api/public/'+lang+'/courses/p0/description');assert.equal(card.querySelector('[data-person-expand]').getAttribute('aria-controls'),'bio-p0');assert(card.querySelector('[data-public-attachment="syllabus_key"] svg'));}
 assert.equal(f.requests.length,1);
});

test('same anonymous snapshot adopts SSR nodes without disrupting selection, biography, focus or query drafts',async t=>{
 const f=fixture(t,{snapshot:true}),first=f.$('[data-record-id="p0"]'),input=f.$('input[name=q]');
 first.querySelector('input').checked=true;input.value='Unsubmitted draft';input.focus();
 let changes=0,appends=0;f.$('[data-public-stream]').addEventListener('public:querychange',()=>changes++);f.$('[data-public-stream]').addEventListener('public:appended',()=>appends++);
 await f.respond();assert.equal(f.$('[data-record-id="p0"]'),first);assert.equal(first.querySelector('input').checked,true);assert(first.querySelector('[data-person-biography]').classList.contains('is-expanded'));assert.equal(input.value,'Unsubmitted draft');assert.equal(f.w.document.activeElement,input);assert.equal(changes,0);assert.equal(appends,0);assert.equal(f.$('[data-public-stream]').dataset.localAdopted,'1');
 assert(f.w.teacherPublicList.append());assert.equal(f.ids().length,20);assert.equal(f.$('[data-record-id="p0"]'),first);assert.equal(f.requests.length,1);
 assert(f.navigate('?direction=desc'));assert.notEqual(f.$('[data-record-id="p0"]'),first);assert.equal(changes,1);
});
test('revision, order, totals, private views and changed URL require ordinary rendering',async t=>{
 for(const mode of ['revision','order','total','private','url','size']){
  const f=fixture(t,{snapshot:true,shared:mode!=='private'}),first=f.$('[data-record-id="p0"]'),value=model();
  if(mode==='revision')value.revision='8';if(mode==='order')value.items[0].order.rank=100;if(mode==='total')f.$('[data-public-stream]').dataset.total='26';if(mode==='private')f.$('main').dataset.publicShared='0';if(mode==='url')f.w.history.replaceState({},'', '?direction=desc');if(mode==='size')f.w.history.replaceState({},'', '?size=20');
  await f.respond(value);
  assert.equal(f.$('[data-public-stream]').dataset.localAdopted,undefined,mode);assert.notEqual(f.$('[data-record-id="p0"]'),first,mode);
 }
});
test('data failure leaves a valid SSR snapshot untouched; late stream initialization keeps automatic local pagination',async t=>{
 const failed=fixture(t,{snapshot:true}),first=failed.$('[data-record-id="p0"]');await failed.respond(model(),503);assert.equal(failed.$('[data-record-id="p0"]'),first);
 const f=fixture(t,{snapshot:true,lateStream:true});await f.respond();assert(f.$('[data-load-more]').hidden);let callback;
 f.w.IntersectionObserver=class{constructor(cb){callback=cb;}observe(){}unobserve(){}disconnect(){}};f.w.eval(scripts['public-stream']);assert.equal(typeof callback,'function');callback([{isIntersecting:true}]);await tick();assert.equal(f.ids().length,20);assert.equal(f.requests.length,1);
});

test('adoption preserves the user citation format instead of resetting it to the model style',async t=>{
 const f=fixture(t,{snapshot:true,table:'publications'}),value=model('publications');
 f.$('[data-copy-format]').add(new f.w.Option('APA','apa'));f.$('[data-copy-format]').value='apa';value.items[0].citation={style:'gbt',text:'Saved citation',highlight:''};await f.respond(value);
 assert.equal(f.$('[data-public-stream]').dataset.localAdopted,'1');assert.equal(f.$('[data-copy-format]').value,'apa');
});
