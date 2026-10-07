const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const script=fs.readFileSync(path.join(__dirname,'../frontend/public/static/js/public-people.js'),'utf8');
const card=id=>`<article data-person-card data-record-id="${id}"><span>99</span><input data-person-select type="checkbox" hidden><h2 data-copy-field><a data-person-link href="/zh/profiles/${id}">Name ${id}</a></h2><p data-copy-field>单位：Organization</p><p data-person-biography id="bio-${id}">Preview</p><span>NOT_COPY_DECORATION</span><button data-person-expand hidden aria-expanded="false">Expand</button><span data-person-status class="visually-hidden"></span></article>`;
const form=`<form data-person-form><div data-person-selection hidden><input data-person-all type="checkbox"><button type="button" data-person-copy disabled>Copy</button><button type="button" data-person-clear disabled>Clear</button><span data-person-count></span></div><a data-person-reset href="/zh/profiles">Reset</a><span data-person-tool-status></span></form>`;
function fixture(t,{html=form+`<section data-public-stream data-table="profiles" data-lang="zh">${card('a')}${card('b')}<div data-stream-controls><a data-page-fallback href="/zh/profiles?page=2">Next</a></div></section>`,url='https://site.example/zh/profiles?q=A'}={}){
 const dom=new JSDOM(html,{url,runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,copied=[],requests=[];
 Object.defineProperty(w.navigator,'clipboard',{configurable:true,value:{writeText:async text=>copied.push(text)}});
 Object.defineProperties(w.HTMLElement.prototype,{scrollHeight:{configurable:true,get(){return this.matches('[data-person-biography]')?80:0;}},clientHeight:{configurable:true,get(){return this.matches('[data-person-biography]')?40:0;}}});
 w.fetch=(url,opts)=>new Promise((resolve,reject)=>requests.push({url,opts,resolve,reject}));w.eval(script);
 const $=s=>w.document.querySelector(s),tick=()=>new Promise(r=>setTimeout(r,0));
 const check=selector=>{$(selector).checked=true;$(selector).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const respond=(index,{id='a',table='profiles',bio='Full biography',ok=true}={})=>requests[index].resolve({ok,headers:{get:()=> 'text/html'},text:async()=>`<article data-person-detail data-record-id="${id}" data-table="${table}" data-lang="zh"><p data-person-biography>${bio}</p></article>`});
 return {w,$,copied,requests,tick,check,respond};
}
test('select loaded, append preserves choices and new rows stay unchecked',t=>{const f=fixture(t);f.check('[data-person-all]');assert.equal(f.$('[data-person-copy]').disabled,false);const root=f.$('[data-public-stream]');root.insertAdjacentHTML('beforeend',card('c'));root.dispatchEvent(new f.w.CustomEvent('public:appended'));assert.equal(f.$('[data-record-id=a] [data-person-select]').checked,true);assert.equal(f.$('[data-record-id=c] [data-person-select]').checked,false);assert.equal(f.$('[data-person-all]').indeterminate,true);assert.match(f.$('[data-person-count]').textContent,/已选 2 \/ 已加载 3/);});
test('copy uses only explicit public fields in current display order',async t=>{const f=fixture(t);f.check('[data-person-all]');f.$('[data-person-copy]').click();await f.tick();assert.equal(f.copied[0],'Name a\n单位：Organization\n\nName b\n单位：Organization');assert.doesNotMatch(f.copied[0],/99|NOT_COPY|Preview/);assert.match(f.$('[data-person-tool-status]').textContent,/已复制/);f.$('[data-person-clear]').click();assert.equal(f.$('[data-person-copy]').disabled,true);});
test('expansion loads only requested entry, caches text and toggles clamp',async t=>{const f=fixture(t);assert.equal(f.requests.length,0);const button=f.$('[data-person-expand]');button.click();button.click();assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/zh/profiles/a');f.respond(0,{bio:'Full &lt;script&gt;literal&lt;/script&gt; biography'});await f.tick();assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(f.$('[data-person-biography]').textContent,'Full <script>literal</script> biography');assert.equal(f.$('[data-person-biography] script'),null);button.click();assert.equal(button.getAttribute('aria-expanded'),'false');button.click();assert.equal(f.requests.length,1);});
test('failed or mismatched detail preserves preview and allows retry',async t=>{const f=fixture(t);f.$('[data-person-expand]').click();f.respond(0,{id:'wrong',bio:'WRONG_PERSON'});await f.tick();assert.equal(f.$('[data-person-biography]').textContent,'Preview');assert.match(f.$('[data-person-status]').textContent,/失败/);assert.equal(f.$('[data-person-expand]').disabled,false);f.$('[data-person-expand]').click();f.respond(1);await f.tick();assert.equal(f.$('[data-person-biography]').textContent,'Full biography');});
test('Clipboard denial uses legacy fallback and accurately reports failure',async t=>{const f=fixture(t);f.w.navigator.clipboard.writeText=async()=>{throw new Error('denied');};let fallback='';f.w.document.execCommand=()=>{fallback=f.$('textarea').value;return true;};f.check('[data-person-all]');f.$('[data-person-copy]').click();await f.tick();assert.match(fallback,/Name a/);assert.equal(f.$('textarea'),null);assert.match(f.$('[data-person-tool-status]').textContent,/已复制/);f.w.document.execCommand=()=>false;f.$('[data-person-copy]').click();await f.tick();assert.match(f.$('[data-person-tool-status]').textContent,/未成功/);});
test('explicit filter submit marks selection reset; automatic append does not',t=>{const f=fixture(t);f.check('[data-person-all]');f.$('[data-public-stream]').dispatchEvent(new f.w.CustomEvent('public:appended'));assert.equal(f.w.sessionStorage.length,0);f.$('[data-person-form]').dispatchEvent(new f.w.Event('submit',{cancelable:true}));assert.equal(f.w.sessionStorage.getItem('public-people-reset:/zh/profiles'),'1');});
test('detail links retain filters for back navigation',t=>{const f=fixture(t);const u=new URL(f.$('[data-person-link]').href);assert.equal(u.searchParams.get('from'),'/zh/profiles?q=A');});
function detail(){return '<article data-person-detail data-lang="zh" data-table="profiles"><a data-person-back href="/zh/profiles">Back</a><button data-person-copy-detail hidden>Copy</button><span data-person-tool-status></span><h1 data-copy-field>Ada</h1><p data-copy-field>公开简介</p><span>NOT_COPY</span></article>';}
test('details copy public fields and restore same-module return URL',async t=>{const f=fixture(t,{html:detail(),url:'https://site.example/zh/profiles/a?from=%2Fzh%2Fprofiles%3Fq%3DA%26page%3D2'});assert.equal(f.$('[data-person-back]').href,'https://site.example/zh/profiles?q=A&page=2');f.$('[data-person-copy-detail]').click();await f.tick();assert.equal(f.copied[0],'Ada\n公开简介');});
test('details reject cross-origin or different-module return URLs',t=>{for(const from of ['https://evil.example/zh/profiles','/admin','/zh/students']){const f=fixture(t,{html:detail(),url:'https://site.example/zh/profiles/a?from='+encodeURIComponent(from)});assert.equal(f.$('[data-person-back]').href,'https://site.example/zh/profiles');}});
test('empty biography is reported without inventing content',async t=>{const f=fixture(t);f.$('[data-person-expand]').click();f.respond(0,{bio:''});await f.tick();assert.equal(f.$('[data-person-biography]').hidden,true);assert.match(f.$('[data-person-status]').textContent,/暂无公开简介/);});
test('group heading appears once across appended batches, selection and copy exclude heading',async t=>{
 const grouped=(id,group)=>card(id).replace('data-person-card',`data-person-card data-person-group="${group}"`).replace('<span>99</span>',`<h2 data-person-group-heading>${group}</h2><span>99</span>`);
 const f=fixture(t,{html:form+`<section data-public-stream data-table="students" data-lang="zh">${grouped('a','博士')}${grouped('b','博士')}</section>`});
 assert.equal(f.$('[data-record-id=a] [data-person-group-heading]').hidden,false);assert.equal(f.$('[data-record-id=b] [data-person-group-heading]').hidden,true);
 f.check('[data-person-all]');const root=f.$('[data-public-stream]');root.insertAdjacentHTML('beforeend',grouped('c','博士')+grouped('d','硕士'));root.dispatchEvent(new f.w.CustomEvent('public:appended'));
 assert.equal(f.$('[data-record-id=c] [data-person-group-heading]').hidden,true);assert.equal(f.$('[data-record-id=d] [data-person-group-heading]').hidden,false);
 assert.equal(f.$('[data-record-id=c] [data-person-select]').checked,false);f.$('[data-person-copy]').click();await f.tick();assert.doesNotMatch(f.copied[0],/博士|硕士/);
});
const facetForm=form.replace('</form>','<label data-person-facet data-field="title" data-page="1"><select name="f.title"><option value="">All</option><option value="A" selected>A</option></select><button data-facet-more type="button" hidden>More</button></label></form>');
test('facet options append safely without changing active filter or selected records',async t=>{
 const f=fixture(t,{html:facetForm+`<section data-public-stream data-table="profiles" data-lang="zh">${card('a')}</section>`});
 f.check('[data-person-all]');f.$('[data-facet-more]').click();f.$('[data-facet-more]').click();assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/api/public/people/profiles/facets/title?page=2&lang=zh');
 f.requests[0].resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({table:'profiles',field:'title',page:2,values:['A','B','<script>literal</script>'],has_more:false})});await f.tick();
 assert.equal(f.$('select').value,'A');assert.equal(f.$('select').options.length,4);assert.equal(f.$('select script'),null);assert.equal(f.$('[data-facet-more]').hidden,true);assert.equal(f.$('[data-person-all]').checked,true);
});
test('facet failure preserves options and page; retry stays on the same page',async t=>{
 const f=fixture(t,{html:facetForm+`<section data-public-stream data-table="profiles" data-lang="zh">${card('a')}</section>`});
 f.$('[data-facet-more]').click();f.requests[0].resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({table:'students',field:'title',page:2,values:['Wrong'],has_more:false})});await f.tick();
 assert.equal(f.$('select').options.length,2);assert.equal(f.$('[data-person-facet]').dataset.page,'1');assert.match(f.$('[data-person-tool-status]').textContent,/失败/);f.$('[data-facet-more]').click();assert.equal(f.requests[1].url,f.requests[0].url);f.requests[1].reject(new Error('offline'));await f.tick();
});
const paperCard=(id,value,missing=false)=>`<article data-person-card data-record-id="${id}"><input data-person-select type="checkbox" hidden><p data-citation-text ${missing?'data-citation-fallback':''}>${value}</p><div class="content-tags">NOT_COPY_TAG</div><a>NOT_COPY_LINK</a><button type="button" data-copy-citation hidden><svg></svg></button><span data-citation-status></span></article>`;
test('batch citations copy selected loaded raw text in list order with zero requests',async t=>{
 const f=fixture(t,{html:form+`<section data-public-stream data-public-content data-table="publications" data-lang="zh">${paperCard('a','  APA <strong>A</strong>\nLine 2  ')}${paperCard('b','APA B')}${paperCard('c','NOT_SELECTED')}</section>`});
 f.check('[data-record-id=a] [data-person-select]');f.check('[data-record-id=b] [data-person-select]');f.$('[data-person-copy]').click();await f.tick();
 assert.equal(f.requests.length,0);assert.equal(f.copied[0],'  APA A\nLine 2  \n\nAPA B');assert.equal(f.$('[data-person-copy]').disabled,false);
});
test('missing-format cards stop the batch instead of copying fallback',async t=>{
 const fallback='[APA 引文未填写；基本著录信息] Author. Title. 2026';
 const f=fixture(t,{html:form+`<section data-public-stream data-public-content data-table="publications" data-lang="zh">${paperCard('a','APA A')}${paperCard('b',fallback,true)}</section>`});
 f.check('[data-person-all]');f.$('[data-person-copy]').click();await f.tick();assert.equal(f.copied.length,0);assert.match(f.$('[data-person-tool-status]').textContent,/缺失|missing/);assert.equal(f.requests.length,0);
});
test('single citation copy works on homepage and appended cards without selection form',async t=>{
 const f=fixture(t,{html:`<section data-public-stream data-table="publications" data-lang="zh">${paperCard('a','APA A')}</section>`});
 f.$('[data-copy-citation] svg').dispatchEvent(new f.w.MouseEvent('click',{bubbles:true}));await f.tick();assert.equal(f.copied[0],'APA A');
 const root=f.$('[data-public-stream]');root.insertAdjacentHTML('beforeend',paperCard('b','APA B'));root.dispatchEvent(new f.w.CustomEvent('public:appended',{bubbles:true}));
 const button=f.$('[data-record-id=b] [data-copy-citation]');assert.equal(button.hidden,false);button.click();await f.tick();assert.equal(f.copied[1],'APA B');assert.equal(f.requests.length,0);
});
test('short biographies hide expand button and resizing reveals it only on overflow',t=>{
 const f=fixture(t),bio=f.$('[data-person-biography]');Object.defineProperty(bio,'scrollHeight',{configurable:true,value:20});f.w.dispatchEvent(new f.w.Event('resize'));assert.equal(f.$('[data-person-expand]').hidden,true);
 Object.defineProperty(bio,'scrollHeight',{value:80});f.w.dispatchEvent(new f.w.Event('resize'));assert.equal(f.$('[data-person-expand]').hidden,false);assert.equal(f.requests.length,0);
});
test('retained detail copies rich text with paragraph boundaries without reader buttons',async t=>{
 const html=detail().replace('</article>','<div data-copy-field data-copy-rich><p>Paragraph one</p><p>Paragraph two<br>Next line</p><button>Reader button</button></div></article>');
 const f=fixture(t,{html,url:'https://site.example/zh/profiles/a'});f.$('[data-person-copy-detail]').click();await f.tick();assert.match(f.copied[0],/Paragraph one\nParagraph two\nNext line/);assert.doesNotMatch(f.copied[0],/Reader button/);
});

const expandedExamples=JSON.parse(fs.readFileSync(path.join(__dirname,'../backend/app/native/frontend_example_rows.json'),'utf8'));
const escapeText=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for(const style of ['gbt','elsevier','apa','ieee'])test(`100 fictional ${style} citations append without changing selected entries and copy exact stored text`,async t=>{
 const papers=expandedExamples.publications;
 const render=rows=>rows.map(item=>paperCard(item.uid,escapeText(item.values['citation_'+style]))).join('');
 const f=fixture(t,{html:form+`<section data-public-stream data-public-content data-table="publications" data-lang="zh">${render(papers.slice(0,10))}</section>`});
 f.check('[data-person-all]');
 const root=f.$('[data-public-stream]');
 for(let offset=10;offset<100;offset+=10){
  root.insertAdjacentHTML('beforeend',render(papers.slice(offset,offset+10)));
  root.dispatchEvent(new f.w.CustomEvent('public:appended',{bubbles:true}));
 }
 assert.equal(root.querySelectorAll('[data-person-select]:checked').length,10);
 f.$('[data-person-copy]').click();await f.tick();
 assert.equal(f.copied[0],papers.slice(0,10).map(item=>item.values['citation_'+style]).join('\n\n'));
 f.check('[data-person-all]');f.$('[data-person-copy]').click();await f.tick();
 assert.equal(f.copied[1],papers.map(item=>item.values['citation_'+style]).join('\n\n'));
 assert.equal(f.requests.length,0);
});
for(const table of ['students','courses']){
 test(`${table}: short description expands locally and long description lazily loads safely`,async t=>{
  const student=card('a').replace('data-person-card','data-person-card data-biography-loaded="1"');
  const f=fixture(t,{html:form+`<section data-public-stream data-public-content data-table="${table}" data-lang="zh">${student}</section>`});
  const b=f.$('[data-person-expand]');b.click();assert.equal(f.requests.length,0);assert.equal(b.getAttribute('aria-expanded'),'true');b.click();
  const a=f.$('[data-person-card]');delete a.dataset.biographyLoaded;a.dataset.descriptionUrl=`/api/public/zh/${table}/a/description`;
  b.click();assert.equal(f.requests.length,1);assert.equal(b.disabled,true);
  f.requests[0].resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({table,lang:'zh',uid:'wrong',text:'wrong'})});await f.tick();
  assert.equal(f.$('[data-person-biography]').textContent,'Preview');assert.equal(b.disabled,false);
  b.click();f.requests[1].resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({table,lang:'zh',uid:'a',text:'Full <script>literal</script>'})});await f.tick();
  assert.equal(f.$('[data-person-biography]').textContent,'Full <script>literal</script>');assert.equal(f.$('[data-person-biography] script'),null);
  b.click();b.click();assert.equal(f.requests.length,2);
 });
}
test('description request is cancelled by filters and late text cannot overwrite the card',async t=>{
 const content=card('a').replace('data-person-card','data-person-card data-description-url="/api/public/zh/students/a/description"');
 const f=fixture(t,{html:form+`<section data-public-stream data-table="students" data-lang="zh">${content}</section>`});
 f.$('[data-person-expand]').click();f.$('[data-person-form]').dispatchEvent(new f.w.Event('submit',{cancelable:true}));
 assert.equal(f.requests[0].opts.signal.aborted,true);
 f.requests[0].resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({table:'students',lang:'zh',uid:'a',text:'Late text'})});await f.tick();
 assert.equal(f.$('[data-person-biography]').textContent,'Preview');assert.equal(f.$('[data-person-expand]').disabled,false);
});
test('news copy excludes PDF controls, loaded text layers and online watermark',async t=>{
 const html='<article data-person-detail data-table="news" data-lang="en"><a data-person-back href="/en/news">Back</a><button data-person-copy-detail hidden>Copy</button><span data-person-tool-status></span><div data-copy-field data-copy-rich><p>News body</p><span data-copy-ignore><span>Download PDF</span><span class="pdf-watermark">WATERMARK</span><span class="textLayer">PDF TEXT</span></span><p>Following text</p></div></article>';
 const f=fixture(t,{html,url:'https://site.example/en/news/a'});f.$('[data-person-copy-detail]').click();await f.tick();assert.equal(f.copied[0],'News body\nFollowing text');
});

test('scoped teacher expansion preserves fixed-entry path and revision',async t=>{
 const markup=(form+`<section data-public-stream data-table="profiles" data-lang="zh">${card('a')}${card('b')}</section>`).replace('data-public-stream','data-public-stream data-endpoint="/zh/n/faculty" data-nav="faculty" data-nav-stamp="rev1"').replace(/\/zh\/profiles\/([ab])/g,'/zh/n/faculty/$1?nv=rev1');
 const f=fixture(t,{html:markup,url:'https://site.example/zh/n/faculty?s=eyJxIjoiQSJ9'});f.$('[data-person-expand]').click();assert.equal(f.requests[0].url,'/zh/n/faculty/a?nv=rev1');f.respond(0);await f.tick();assert.equal(f.$('[data-person-biography]').textContent,'Full biography');
});
test('scoped detail return accepts only its own entry and preserves encoded filters',t=>{
 const markup=detail().replace('href="/zh/profiles"','href="/zh/n/faculty"');
 for(const [from,expected] of [['/zh/n/faculty?s=abc','/zh/n/faculty?s=abc'],['/zh/profiles','/zh/n/faculty'],['/zh/n/other','/zh/n/faculty']]){
 const f=fixture(t,{html:markup,url:'https://site.example/zh/n/faculty/a?from='+encodeURIComponent(from)});assert.equal(f.$('[data-person-back]').href,'https://site.example'+expected);
 }
});

test('English facet continuation requests language and scope, and keeps raw values for identical labels',async t=>{
 const f=fixture(t,{html:facetForm+`<section data-public-stream data-table="profiles" data-lang="en" data-nav="faculty" data-nav-stamp="rev">${card('a')}</section>`});
 f.$('[data-facet-more]').click();const url=new URL(f.requests[0].url,'https://site.example');assert.equal(url.searchParams.get('lang'),'en');assert.equal(url.searchParams.get('nav'),'faculty');assert.equal(url.searchParams.get('nv'),'rev');
 f.requests[0].resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({table:'profiles',field:'title',page:2,values:['教授甲','教授乙','讲师'],labels:{'教授甲':'Professor','教授乙':'Professor','讲师':'<script>Literal</script>'},has_more:false})});await f.tick();
 const options=[...f.$('select').options];assert.equal(options.filter(o=>o.textContent==='Professor').length,2);assert(options.some(o=>o.value==='教授甲'));assert(options.some(o=>o.value==='教授乙'));assert.equal(f.$('select script'),null);assert.equal(f.$('select').value,'A');
});
