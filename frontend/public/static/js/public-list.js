/* Complete public read models; HTML and scoped navigation remain independent. */
(() => {
  'use strict';
  const root=document.querySelector('[data-public-list-local]'),form=document.querySelector('[data-public-query-form]');
  if(!root||!form||root.dataset.nav||root.dataset.home==='1')return;
  const table=root.dataset.table,lang=root.dataset.lang,en=lang==='en',path='/'+lang+'/'+table;
  if(location.pathname!==path)return;
  const items=root.querySelector('[data-stream-items]'),controls=root.querySelector('[data-stream-controls]');
  const lower=value=>String(value??'').replace(/[A-Z]/g,c=>c.toLowerCase());
  const say=(zh,english)=>en?english:zh;
  let model=null,job=null,failed=false,away=false;
  root.dataset.localPending='1';
  window.addEventListener('pagehide',()=>{away=true;});
  window.addEventListener('pageshow',()=>{away=false;});
  const aliases={主持:['主持','负责人','项目负责人','主持人','主持/负责人','主持（负责人）','host','lead','leader','pi','principal investigator'],参与:['参与','成员','项目成员','参与者','参与/成员','参与（成员）','participant','member','participate','participation']};
  const role=value=>String(value).split(/[;；\r\n]/).map(x=>x.trim()).filter(Boolean).map(x=>Object.keys(aliases).find(k=>aliases[k].includes(lower(x)))||x).filter((x,i,a)=>a.indexOf(x)===i).join(' / ');
  function decode(url){
    const params=url.searchParams,state={},seen=new Set();
    for(const [key,value] of params){if(seen.has(key))throw Error('Duplicate');seen.add(key);state[key]=value;}
    if(state.s){
      if(!/^[A-Za-z0-9_-]+$/.test(state.s)||state.s.length>24576)throw Error('State');
      const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(state.s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
      if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length>30)throw Error('State');
      for(const [k,v] of Object.entries(value)){if(!(k==='q'||k.startsWith('f.')||k.startsWith('c.'))||typeof v!=='string'||Object.hasOwn(state,k))throw Error('State');state[k]=v;}
      delete state.s;
    }
    for(const [key,value] of Object.entries(state)){
      if(key==='q'){if([...value].length>200)throw Error('Search');}
      else if(key.startsWith('f.')||key.startsWith('c.')){
        const spec=model.semantics.filters[key.slice(2)];if(!spec||[...value].length>500)throw Error('Filter');
        if(key.startsWith('c.')&&value&&!spec.operators.includes('contains'))throw Error('Operator');
      }else if(key==='page'||key==='size'){if(!/^[0-9]{1,7}$/.test(value)||Number(value)<1||Number(value)>1000000)throw Error('Page');}
      else if(key==='direction'){if(!['asc','desc'].includes(value))throw Error('Order');}
      else if(!['sort','_rev'].includes(key))throw Error('Scope');
      if(/[\x00-\x1f\x7f]/.test(value))throw Error('Control');
    }
    const size=Number(state.size||10);if(![10,20,50,100].includes(size))throw Error('Size');
    return {...state,size:Math.min(size,20),page:Number(state.page||1),direction:state.direction||'asc'};
  }
  function result(state){
    const predicates=Object.entries(state).filter(([key,value])=>(key.startsWith('f.')||key.startsWith('c.'))&&value!=='');
    const rows=model.items.filter(item=>{
      if(state.q?.trim()&&!item.search_values.some(value=>lower(value).includes(lower(state.q.trim()))))return false;
      return predicates.every(([key,value])=>{
        const field=key.slice(2),spec=model.semantics.filters[field],raw=item.filter_values[field];
        if(key.startsWith('c.'))return raw!=null&&lower(raw).includes(lower(value.trim()));
        if(raw==null)return false;
        if(['integer','boolean'].includes(spec.kind))return /^-?[0-9]+$/.test(value)&&Number(raw)===Number(value);
        if(String(raw)===value)return true;
        if(!spec.facet_tokens&&!(table==='projects'&&field==='project_role'))return false;
        const wanted=table==='projects'&&field==='project_role'?role(value):value.trim();
        return (item.filter_tokens[field]||[]).some(token=>lower(token)===lower(wanted));
      });
    });
    rows.sort((a,b)=>a.order.group-b.order.group+(a.order.group===b.order.group?(state.direction==='desc'?-1:1)*(a.order.rank-b.order.rank):0));
    const pages=Math.max(1,Math.ceil(rows.length/state.size)),page=Math.min(state.page,pages);
    return {rows:rows.slice((page-1)*state.size,page*state.size),total:rows.length,pages,page};
  }
  const fields={profiles:[['title','职称','Title'],['organization','单位','Organization'],['role','身份','Role'],['lab','实验室','Laboratory'],['email','邮箱','Email'],['phone','电话','Phone'],['office','办公室','Office']],students:[['degree','学位','Degree'],['category','分类','Category'],['grade','年级','Cohort'],['status','状态','Status'],['enrollment_date','入学时间','Enrollment'],['graduation_date','毕业时间','Graduation'],['destination','毕业去向','Destination'],['direction','研究方向','Research interests'],['awards','获奖情况','Awards'],['email','邮箱','Email']],projects:[['source','来源','Source'],['fund_name','基金计划','Fund / Program'],['project_number','项目编号','Project no.'],['project_role','承担角色','Role'],['start_date','开始日期','Start'],['end_date','结束日期','End'],['status','状态','Status']],publications:[['authors','作者','Authors'],['venue','期刊/会议','Venue'],['year','年份','Year'],['volume','卷','Volume'],['issue','期','Issue'],['pages','页码','Pages'],['doi','DOI','DOI'],['publication_type','论文类型','Paper type'],['display_tags','标签','Tags']],patents:[['patent_type','类型','Type'],['legal_status','状态','Status'],['inventors','发明人 / 作者','Inventors / Authors'],['owner','权利人','Owner'],['country','国家/地区','Country'],['application_number','申请号','Application no.'],['application_date','申请日期','Filed'],['grant_number','授权号','Grant no.'],['grant_date','授权日期','Granted']],courses:[['semester','学期','Semester'],['audience','授课对象','Audience']],news:[['published_at','发布日期','Published'],['category','分类','Category']],research_interests:[]};
  function node(tag,classes,text){const el=document.createElement(tag);if(classes)el.className=classes;if(text!=null)el.textContent=String(text);return el;}
  function safeURL(value,local=false){const url=new URL(value,location.href);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||(local&&url.origin!==location.origin))throw Error('URL');return url;}
  function card(item,index,total,state){
    const display=item.display,title=display.name||display.title||'',article=node('article','public-list-card person-card '+(['profiles','students'].includes(table)?'card-with-media':'content-card'));
    article.id='record-'+item.uid;article.dataset.recordId=item.uid;article.dataset.personCard='';
    if(table==='students'){article.classList.add('student-card');article.dataset.personGroup=String(item.order.group);const heading=node('h2','person-group-heading',model.groups[item.order.group]?.label||'');heading.dataset.personGroupHeading='';article.append(heading);}
    const select=node('div','person-select'),number=node('span','person-number',table==='profiles'?(state.page-1)*state.size+index+1:total-(state.page-1)*state.size-index),check=node('input');check.type='checkbox';check.dataset.personSelect='';check.hidden=true;check.setAttribute('aria-label',say('选择 ','Select ')+title);select.append(number,check);article.append(select);
    if(['profiles','students'].includes(table)){const photo=node('div','person-photo public-media');photo.dataset.publicMedia='';photo.setAttribute('role','img');photo.setAttribute('aria-label',title);const fallback=node('span','',String(title).trim().slice(0,1)||'?');fallback.dataset.mediaFallback='';fallback.setAttribute('aria-hidden','true');if(item.media.avatar_url){const img=node('img');img.src=safeURL(item.media.avatar_url,true).href;img.alt='';img.loading='lazy';img.width=88;img.height=88;img.decoding='async';fallback.hidden=true;img.addEventListener('error',()=>{img.hidden=true;fallback.hidden=false;});photo.append(img);}photo.append(fallback);article.append(photo);}else if(item.media.cover_url){article.classList.add('card-with-media');const cover=node('div','content-cover'),img=node(String(item.media_types?.cover_url||'').startsWith('video/')?'video':'img');if(img.tagName==='VIDEO'){img.controls=true;img.preload='none';}img.src=safeURL(item.media.cover_url,true).href;img.alt='';img.loading='lazy';img.addEventListener('error',()=>{img.hidden=true;});cover.append(img);article.append(cover);}
    const content=node('div','person-content'),heading=node('h2');heading.dataset.copyField='';
    if(['profiles','courses','news'].includes(table)){const link=node('a','',title);const target=safeURL(item.detail_url,true);target.searchParams.set('from',location.pathname+location.search);link.href=target.pathname+target.search;link.dataset.personLink='';if(table==='news'){link.target='_blank';link.rel='noopener noreferrer';}heading.append(link);}else heading.textContent=title;
    content.append(heading);
    for(const [field,zh,english] of fields[table]||[]){if(display[field]==null||display[field]==='')continue;const p=node('p','content-field');p.dataset.copyField='';p.dataset.publicField=field;p.append(node('span','person-label',say(zh,english)+'：'),node('span','',display[field]));content.append(p);}
    if(table==='profiles'){const identity=node('div','faculty-identity');identity.append(heading);for(const [classes,keys] of [['faculty-rank',['title','role']],['faculty-affiliation',['organization','lab']]]){const group=node('div',classes);for(const key of keys){const field=content.querySelector('[data-public-field="'+key+'"]');if(field)group.append(field);}identity.append(group);}content.prepend(identity);const contacts=node('div','faculty-contacts');for(const key of ['email','phone','office']){const field=content.querySelector('[data-public-field="'+key+'"]');if(field)contacts.append(field);}identity.after(contacts);}
    if(table==='projects'){content.replaceChildren();const text=node('div','project-text'),main=node('div','project-main');text.dataset.projectText='';text.dataset.projectPrivate=item.uid;const parts=[[null,'',[display.source,display.fund_name].filter(Boolean).join(' — ')],['title','',title],['number',say('项目编号','Project no.'),display.project_number],['role',say('承担角色','Role'),display.project_role],['period',say('项目周期','Period'),display.start_date&&display.end_date?display.start_date+' – '+display.end_date:display.start_date?say('起于 ','From ')+display.start_date:display.end_date?say('截至 ','Until ')+display.end_date:'']];for(const [key,label,value] of parts){if(value==null||value==='')continue;if(main.childNodes.length)main.append(node('span','project-separator',' · '));const piece=node(key==='title'?'h2':'span',key==='title'?'project-name':'project-piece project-'+(key||'source'));piece.dataset.copyField='';if(label)piece.append(node('span','person-label',label+'：'));piece.append(document.createTextNode(String(value)));main.append(piece);}text.append(main);if(display.status){text.classList.add('project-with-status');const status=node('span','project-piece project-status content-status');status.dataset.copyField='';status.append(node('span','person-label',say('状态','Status')+'：'),document.createTextNode(String(display.status)));text.append(status);}content.append(text);}
    const prose=display.bio||display.summary||display.description;
    if(prose){const expandable=['profiles','students','courses'].includes(table),p=node('p','person-biography'+(expandable?'':' is-expanded'),prose);p.dataset.copyField='';if(expandable){p.dataset.personBiography='';p.id='bio-'+item.uid;const field=table==='courses'?'summary':'bio';if(item.truncated_fields?.includes(field)){if(table!=='profiles')article.dataset.descriptionUrl='/api/public/'+lang+'/'+table+'/'+encodeURIComponent(item.uid)+'/description';}else article.dataset.biographyLoaded='1';const button=node('button','person-icon',say('展开简介','Expand biography'));button.type='button';button.dataset.personExpand='';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',p.id);content.append(button);const status=node('span','visually-hidden');status.dataset.personStatus='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');content.append(status);}content.append(p);}
    const links=node('div','content-links');
    for(const [label,value] of Object.entries({...item.links,...item.media})){if(label==='avatar_url'||label==='cover_url')continue;const labels={pdf_url:['论文 PDF','Paper PDF'],certificate_url:['证书','Certificate'],syllabus_url:['教学大纲','Syllabus'],material_url:['课程资料','Materials'],url:['原文链接','Publication link'],homepage:['个人主页','Homepage'],personal_homepage:['个人主页','Homepage'],google_scholar:['Google Scholar','Google Scholar'],orcid:['ORCID','ORCID'],dblp:['DBLP','DBLP'],github:['GitHub','GitHub'],cnki:['知网','CNKI']};const link=node('a','',labels[label]?say(...labels[label]):label);link.href=safeURL(value,label.endsWith('_url')).href;link.target='_blank';link.rel='noopener noreferrer';links.append(link);}
    if(table==='publications'){
      content.replaceChildren();
      const configured=item.citation,style=configured?.style||'gbt',citation=node('p','publication-citation',configured?.text?.trim()?configured.text:[display.authors,display.title,display.venue,display.year].filter(Boolean).join('. '));citation.dataset.citationText='';citation.dataset.citationFormat='citation_'+style;if(configured){if(configured.text.trim())citation.dataset.citationHighlight=configured.highlight||'';else citation.dataset.citationFallback='';}else citation.dataset.citationRemote='';content.append(citation);
      const tags=node('div','content-tags');for(const field of ['publication_type','index_type','author_role','display_tags','corresponding_authors'])if(display[field])tags.append(node('span','',display[field]));content.append(tags);
      const button=node('button','person-icon',say('复制引文','Copy citation'));button.type='button';button.dataset.copyCitation='';links.append(button);const status=node('span','citation-status');status.dataset.citationStatus='';status.setAttribute('role','status');content.append(status);
    }
    content.append(links);if(table==='profiles'){const summary=node('div','person-summary'),copy=node('div','person-copy'),actions=node('div','person-actions');for(const child of [...content.children]){if(child.matches('[data-person-expand]'))actions.append(child);else copy.append(child);}summary.append(copy,actions);content.append(summary);}article.append(content);return article;
  }
  function pageURL(state,page){const url=new URL(location.href);url.searchParams.set('page',String(page));url.hash='';return url;}
  function syncForm(state){
    for(const control of form.elements){if(!control.name)continue;if(control.type==='radio')control.checked=state[control.name]===control.value;else if(control.name==='size')control.value=String(state.size);else if(control.name==='q'||control.name.startsWith('f.')||control.name.startsWith('c.'))control.value=state[control.name]||'';}
    form.querySelectorAll('select').forEach(select=>select.dispatchEvent(new Event('public:facet-options')));
  }
  function render(url,push=false){
    const state=decode(url),data=result(state);state.page=data.page;
    // Build the complete replacement before touching the visible server content.
    const fragment=document.createDocumentFragment();data.rows.forEach((item,index)=>fragment.append(card(item,index,data.total,state)));
    if(!data.rows.length)fragment.append(node('p','text-secondary public-empty',say('暂无公开内容。','No public content.')));
    if(push)history.pushState({publicList:true},'',url.pathname+url.search); // URL is set before preparing detail links below.
    root.dispatchEvent(new CustomEvent('public:querychange',{bubbles:true}));items.replaceChildren(fragment);root.dataset.total=String(data.total);root.dataset.page=String(data.page);root.dataset.next='';
    controls.replaceChildren();
    for(const [page,label] of [[data.page-1,say('上一页','Previous page')],[data.page+1,say('下一页','Next page')]])if(page>=1&&page<=data.pages){const link=node('a','btn btn-outline-secondary',label);link.href=pageURL(state,page).href;link.dataset.localPage='';controls.append(link);}
    const status=node('span','',say(`第 ${data.page} / ${data.pages} 页，共 ${data.total} 条`,`Page ${data.page} / ${data.pages}, ${data.total} results`));status.setAttribute('role','status');controls.append(status);
    for(const link of document.querySelectorAll('[data-public-language]')){const target=new URL(link.href);target.pathname=path.replace(/^\/(en|zh)/,'/'+link.dataset.publicLanguage);target.search=location.search;target.hash=location.hash;link.href=target.href;}
    syncForm(state);root.dispatchEvent(new CustomEvent('public:appended',{bubbles:true,detail:{count:data.rows.length,page:data.page,total:data.total}}));
    // Rebuild return links on every transition, including back/forward.
    for(const link of items.querySelectorAll('[data-person-link]')){const target=new URL(link.href);target.searchParams.set('from',location.pathname+location.search);link.href=target.pathname+target.search;}
    root.dataset.localReady='1';
  }
  function valid(value){
    if(!value||value.schema_version!=='public-read-model-v1'||value.module!==table||value.lang!==lang||value.model_key!==table+'-public-index-'+lang||value.complete!==true||!Array.isArray(value.items)||value.total!==value.items.length||value.total>500||!Array.isArray(value.facets)||!Array.isArray(value.groups)||!value.semantics?.filters)throw Error('Incomplete model');
    for(const facet of value.facets)if(!facet||typeof facet.field!=='string'||!Array.isArray(facet.values)||facet.values.some(x=>typeof x!=='string')||!facet.labels||typeof facet.labels!=='object')throw Error('Facet');
    const ids=new Set();for(const item of value.items){if(!item||typeof item.uid!=='string'||ids.has(item.uid)||!item.display||!item.filter_values||!item.filter_tokens||!Array.isArray(item.search_values)||!item.order||!Number.isInteger(item.order.rank)||!Number.isInteger(item.order.group)||!item.media||!item.links||typeof item.detail_url!=='string')throw Error('Row');if(item.citation&&(!['gbt','elsevier','apa','ieee'].includes(item.citation.style)||typeof item.citation.text!=='string'||typeof item.citation.highlight!=='string'))throw Error('Citation');ids.add(item.uid);}
    return value;
  }
  function facets(){
    const style=model.items.find(item=>item.citation)?.citation.style,copyFormat=document.querySelector('[data-copy-format]');if(style&&copyFormat)copyFormat.value=style;
    for(const facet of model.facets){const host=[...form.querySelectorAll('[data-person-facet]')].find(x=>x.dataset.field===facet.field);if(!host)continue;const select=host.querySelector('select'),selected=select.value,first=select.options[0]?.cloneNode(true);select.replaceChildren();if(first)select.append(first);for(const value of facet.values)select.add(new Option(facet.labels[value]||value,value));if(selected&&![...select.options].some(o=>o.value===selected))select.add(new Option(selected,selected));select.value=selected;host.querySelector('[data-facet-more]')?.setAttribute('hidden','');select.dispatchEvent(new Event('public:facet-options'));}
  }
  async function load(){
    if(model)return model;if(job)return job;if(failed)throw Error('Unavailable');
    job=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{
      const response=await fetch('/api/public/data/'+lang+'/'+table,{credentials:'omit',redirect:'error',signal:controller.signal,headers:{Accept:'application/json'}});
      if(!response.ok||!response.headers.get('content-type')?.includes('application/json')||response.headers.get('X-Teacher-Data-OK')!=='1')throw Error('Unavailable');
      const text=await response.text();if(new TextEncoder().encode(text).length>512*1024)throw Error('Too large');model=valid(JSON.parse(text));decode(new URL(location.href));return model;
    }catch(error){model=null;failed=true;throw error;}finally{clearTimeout(timer);}})();return job;
  }
  // The query encoder calls this only after a complete model has arrived.
  window.teacherPublicList={navigate(url){if(!model)return false;try{render(url,true);return true;}catch{return false;}}};
  root.addEventListener('click',event=>{const link=event.target.closest('[data-local-page]');if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();const url=new URL(link.href);if(!window.teacherPublicList.navigate(url))location.assign(url.href);});
  form.querySelector('[data-person-reset]')?.addEventListener('click',event=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!model)return;const url=new URL(path,location.href);if(window.teacherPublicList.navigate(url))event.preventDefault();});
  window.addEventListener('popstate',()=>{if(!model)return;try{if(location.pathname!==path)throw Error('Path');render(new URL(location.href));}catch{location.reload();}});
  // Start after initial HTML is visible; errors leave it and normal navigation intact.
  function fallback(){model=null;failed=true;delete root.dataset.localPending;root.dispatchEvent(new CustomEvent('public:local-fallback',{bubbles:true}));}
  load().then(()=>{if(away){fallback();return;}try{render(new URL(location.href));facets();delete root.dataset.localPending;root.dispatchEvent(new CustomEvent('public:local-ready',{bubbles:true}));}catch{fallback();}}).catch(fallback);
})();
