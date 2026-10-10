/* Shared public list/detail controls. Existing HTML routes; no admin API or bulk prefetch. */
(() => {
  'use strict';
  const root=document.querySelector('[data-public-stream][data-table="profiles"], [data-public-stream][data-table="students"], [data-public-content]');
  const detail=document.querySelector('[data-person-detail]');
  const lang=(root||detail)?.dataset.lang||document.documentElement.lang, en=lang==='en';
  const say=(zh,english)=>en?english:zh;
  function fieldText(el){
    if(!el.hasAttribute('data-copy-rich'))return el.textContent.trim();
    const clone=el.cloneNode(true);
    clone.querySelectorAll('button,script,style,canvas,svg,[hidden],[data-copy-ignore]').forEach(node=>node.remove());
    clone.querySelectorAll('br').forEach(node=>node.replaceWith('\n'));
    clone.querySelectorAll('td,th').forEach(node=>node.append('\t'));
    clone.querySelectorAll('p,div,section,article,li,ul,ol,blockquote,pre,h1,h2,h3,h4,h5,h6,tr').forEach(node=>node.append('\n'));
    return clone.textContent.replace(/\n{3,}/g,'\n\n').trim();
  }
  const projectText=value=>value.replace(/\s+/g,' ').trim();
  const text=card=>card.querySelector('[data-project-text]')?projectText(card.querySelector('[data-project-text]').textContent):card.querySelector('[data-citation-text]')?.textContent??[...card.querySelectorAll('[data-copy-field]')].map(fieldText).filter(Boolean).join('\n');
  // Normalize only a selection whose two ends are project content in one stream.
  // Clip each range to the selected text; never substitute entire fields/cards.
  document.addEventListener('copy',event=>{
    if(event.defaultPrevented||!event.clipboardData)return;
    const selection=window.getSelection();
    if(!selection||selection.rangeCount!==1||selection.isCollapsed)return;
    const range=selection.getRangeAt(0);
    const element=node=>node.nodeType===1?node:node.parentElement;
    const first=element(range.startContainer)?.closest('[data-project-text]');
    const last=element(range.endContainer)?.closest('[data-project-text]');
    const stream=first?.closest('[data-public-stream]');
    if(!first||!last||!stream||stream.dataset.table!=='projects'||last.closest('[data-public-stream]')!==stream)return;
    const parts=[];
    for(const block of stream.querySelectorAll('[data-project-text]')){
      if(!range.intersectsNode(block))continue;
      const piece=document.createRange();piece.selectNodeContents(block);
      if(piece.compareBoundaryPoints(Range.START_TO_START,range)<0)piece.setStart(range.startContainer,range.startOffset);
      if(piece.compareBoundaryPoints(Range.END_TO_END,range)>0)piece.setEnd(range.endContainer,range.endOffset);
      if(!piece.collapsed){const value=projectText(piece.cloneContents().textContent);if(value)parts.push(value);}
    }
    if(!parts.length)return;
    const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    event.clipboardData.setData('text/plain',parts.join('\n\n'));
    event.clipboardData.setData('text/html',parts.map(value=>'<p>'+escape(value)+'</p>').join(''));
    event.preventDefault();
  });
  async function copy(value,status){
    if(!value)return;
    const focus=document.activeElement;
    try {
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);
      else throw new Error('Clipboard unavailable');
      status.textContent=say('已复制。','Copied.');return true;
    } catch (_) { /* A user-initiated fallback for HTTP / denied Clipboard API. */ }
    const field=document.createElement('textarea');field.value=value;field.readOnly=true;
    field.setAttribute('aria-label',say('待复制内容','Text to copy'));
    field.style.cssText='position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:.01';
    document.body.append(field);field.select();
    let ok=false;
    try{ok=!!document.execCommand?.('copy');}catch(_){}finally{field.remove();focus?.focus({preventScroll:true});}
    status.textContent=ok?say('已复制。','Copied.'):say('复制未成功，请选中文字后复制。','Could not copy. Select the text and copy manually.');
    return ok;
  }
  const formatControl=document.querySelector('[data-copy-format]');
  const citationFormats=new Set(['gbt','elsevier','apa','ieee','bibtex']);
  let citationJob=null;
  function cancelCitation(){
    for(const field of document.querySelectorAll('.citation-manual'))field.parentElement.textContent=say('格式或选择已变更，请重新复制。','Format or selection changed. Copy again.');
    if(citationJob){citationJob.controller.abort();citationJob.status.textContent=say('复制已取消，请按当前格式重新复制。','Copy cancelled. Copy again using the current format.');}
  }
  formatControl?.addEventListener('change',cancelCitation);
  document.addEventListener('public:querychange',cancelCitation);
  window.addEventListener('pagehide',cancelCitation);
  document.addEventListener('teacher:navigation-start',cancelCitation);
  async function copyCitations(items,status){
    if(citationJob){status.textContent=say('正在读取引文，请稍候。','Loading citations. Please wait.');return;}
    if(!items.length)return;
    const sourceStyle=items[0].querySelector('[data-citation-text]')?.dataset.citationFormat?.replace(/^citation_/,'')||'gbt';
    const style=formatControl?.value||sourceStyle;
    if(!citationFormats.has(style))return;
    const job={controller:new AbortController(),status};citationJob=job;
    const values=new Map(),need=[],ordered=items.map(card=>({card,uid:card.dataset.recordId}));
    let missing=0;
    try{
      for(const {card,uid} of ordered){
        const el=card.querySelector('[data-citation-text]');
        const current=el?.dataset.citationFormat?.replace(/^citation_/,'')||'gbt';
        if(style===current){
          if(!el||el.hasAttribute('data-citation-fallback')||!el.textContent.trim()||el.textContent.length>65536)missing++;
          else values.set(card,el.textContent);
        }else need.push({card,uid});
      }
      for(let offset=0;offset<need.length;offset+=20){
        if(job.controller.signal.aborted)return;
        const batch=need.slice(offset,offset+20),uids=batch.map(x=>x.uid);
        if(uids.some(x=>!x)||new Set(uids).size!==uids.length)throw new Error('Invalid selection');
        status.textContent=say(`正在读取引文 ${Math.min(offset+20,need.length)} / ${need.length}…`,`Loading citations ${Math.min(offset+20,need.length)} / ${need.length}…`);
        const query=new URLSearchParams({format:style});if(root?.dataset.nav){query.set('nav',root.dataset.nav);query.set('nv',root.dataset.navStamp);}uids.forEach(uid=>query.append('uid',uid));
        const timer=setTimeout(()=>job.controller.abort(),15000);
        let result;
        try{
          const response=await fetch('/api/public/publications/citations?'+query,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:job.controller.signal,headers:{Accept:'application/json'}});
          if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Citation unavailable');
          result=await response.json();
        }finally{clearTimeout(timer);}
        if(job.controller.signal.aborted)return;
        if(result.format!==style||!Array.isArray(result.rows)||result.rows.length>batch.length)throw new Error('Invalid citation response');
        const found=new Map();
        for(const row of result.rows){
          if(!row||!uids.includes(row.uid)||found.has(row.uid)||(row.text!==null&&(typeof row.text!=='string'||row.text.length>65536)))throw new Error('Invalid citation row');
          found.set(row.uid,row.text);
        }
        for(const {card,uid} of batch){const value=found.get(uid);if(typeof value!=='string'||!value.trim())missing++;else values.set(card,value);}
      }
      if(job.controller.signal.aborted)return;
      if(missing){status.textContent=say(`${missing} 条所选格式缺失或条目已不可见，未复制。请更换格式或补齐后重试。`,`${missing} citations are missing or unavailable. Nothing copied. Choose another format or complete the entries and retry.`);return;}
      const value=ordered.map(({card})=>values.get(card)).join('\n\n');
      if(!await copy(value,status)){
        status.textContent=say('浏览器未允许自动复制。下面是所选格式，请选中后手动复制：','Automatic clipboard access was unavailable. Select and copy the chosen format below:');
        const field=document.createElement('textarea');field.className='citation-manual';field.readOnly=true;field.value=value;
        field.setAttribute('aria-label',say('所选格式引文','Citations in the selected format'));
        status.append(field);field.focus();field.select();
      }
    }catch(_){status.textContent=job.controller.signal.aborted?say('复制已取消或请求超时，请重试。','Copy cancelled or timed out. Please retry.'):say('引文读取失败，未复制；已保留选择，请重试。','Could not load citations. Nothing copied; your selection is retained. Please retry.');}
    finally{if(citationJob===job)citationJob=null;values.clear();}
  }
  function prepareCitations(scope=document){
    scope.querySelectorAll('[data-copy-citation]').forEach(button=>button.hidden=false);
  }
  prepareCitations();document.addEventListener('public:appended',event=>prepareCitations(event.target));
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-copy-citation]');if(!button||button.disabled)return;
    const card=button.closest('article');if(!card)return;
    button.disabled=true;
    try{await copyCitations([card],card.querySelector('[data-citation-status]'));}finally{button.disabled=false;}
  });
  if(!root&&!detail)return;
  if(detail){
    const button=detail.querySelector('[data-person-copy-detail]'),status=detail.querySelector('[data-person-tool-status]');
    button.hidden=false;button.addEventListener('click',()=>copy(text(detail),status));
    const back=detail.querySelector('[data-person-back]');
    try{const from=new URL(new URL(location.href).searchParams.get('from')||back.href,location.href);if(!back.hasAttribute('data-return-resolved')&&from.origin===location.origin&&from.pathname===new URL(back.href,location.href).pathname)back.href=from.pathname+from.search;}catch(_){}
    return;
  }
  const form=document.querySelector('[data-person-form]');if(!form)return;
  const all=form.querySelector('[data-person-all]'),count=form.querySelector('[data-person-count]'),copyButton=form.querySelector('[data-person-copy]'),clear=form.querySelector('[data-person-clear]'),status=form.querySelector('[data-person-tool-status]');
  const cards=()=>[...root.querySelectorAll('[data-person-card]')];
  const selected=()=>cards().filter(card=>card.querySelector('[data-person-select]').checked);
  const storageKey='public-people-reset:'+location.pathname;
  let copying=false;
  function refresh(){
    const total=cards().length,n=selected().length;
    all.checked=total>0&&n===total;all.indeterminate=n>0&&n<total;all.disabled=!total;
    copyButton.disabled=!n||copying;clear.disabled=!n;count.textContent=say(`已选 ${n} / 已加载 ${total}`,`${n} selected / ${total} loaded`);
    const resultTotal=form.querySelector('[data-person-total]'),available=Number(root.dataset.total);
    if(resultTotal&&Number.isInteger(available))resultTotal.textContent=say(`${available} 条结果`,`${available} results`);
  }
  function prepare(){
    let previousGroup=null;
    for(const card of cards()){
      const heading=card.querySelector('[data-person-group-heading]');
      if(heading){heading.hidden=card.dataset.personGroup===previousGroup;previousGroup=card.dataset.personGroup;}
      card.querySelector('[data-person-select]').hidden=false;
      const expand=card.querySelector('[data-person-expand]'),bio=card.querySelector('[data-person-biography]');
      if(expand&&bio){expand.hidden=!bio.textContent.trim()||(expand.getAttribute('aria-expanded')!=='true'&&!(card.dataset.descriptionUrl&&!card.dataset.biographyLoaded)&&bio.scrollHeight<=bio.clientHeight+1);biographyObserver?.observe(bio);}
      for(const link of card.querySelectorAll('[data-person-link]')){
        const url=new URL(link.href,location.href);if(!url.searchParams.has('from'))url.searchParams.set('from',location.pathname+location.search);link.href=url.pathname+url.search+url.hash;
      }
    }
    refresh();
  }
  function markReset(){
    if(!selected().length)return;
    try{sessionStorage.setItem(storageKey,'1');}catch(_){}
  }
  form.querySelector('[data-person-selection]').hidden=false;
  try{if(sessionStorage.getItem(storageKey)){status.textContent=say('筛选或分页已更新，原选择已清空。','Results changed; the previous selection was cleared.');sessionStorage.removeItem(storageKey);}}catch(_){}
  all.addEventListener('change',()=>{cancelCitation();for(const card of cards())card.querySelector('[data-person-select]').checked=all.checked;refresh();});
  clear.addEventListener('click',()=>{cancelCitation();for(const card of cards())card.querySelector('[data-person-select]').checked=false;refresh();});
  copyButton.addEventListener('click',async()=>{
    if(copying)return;
    copying=true;refresh();
    try{const chosen=selected();if(root.dataset.table==='publications'||chosen[0]?.querySelector('[data-citation-text]'))await copyCitations(chosen,status);else await copy(chosen.map(text).join('\n\n'),status);}
    finally{copying=false;refresh();}
  });
  root.addEventListener('change',event=>{if(event.target.matches('[data-person-select]')){cancelCitation();refresh();}});
  root.addEventListener('public:appended',prepare);
  const requests=new Set();
  function changingQuery(){
    markReset();for(const controller of requests)controller.abort();
    root.dispatchEvent(new CustomEvent('public:querychange',{bubbles:true}));
    for(const card of cards())card.querySelector('[data-person-select]').checked=false;
    refresh();
  }
  function navigate(event){if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&event.button===0)changingQuery();}
  form.addEventListener('submit',changingQuery);
  form.querySelector('[data-person-reset]').addEventListener('click',navigate);
  root.querySelector('[data-stream-controls]')?.addEventListener('click',event=>{const link=event.target.closest('a');if(link&&!link.matches('[data-load-more]'))navigate(event);});
  form.addEventListener('change',event=>{if(event.target.matches('[name="direction"]'))form.requestSubmit();});
  for(const facet of form.querySelectorAll('[data-person-facet]')){
    const button=facet.querySelector('[data-facet-more]');if(!button)continue;
    button.hidden=false;
    button.addEventListener('click',async()=>{
      if(button.disabled)return;button.disabled=true;
      facet.dispatchEvent(new CustomEvent('public:facet-status',{detail:say('正在读取选项…','Loading options…')}));
      const controller=new AbortController();requests.add(controller);const timer=setTimeout(()=>controller.abort(),15000);
      const page=Number(facet.dataset.page)+1;
      try{
        const params=new URLSearchParams({page,lang});if(root.dataset.nav){params.set('nav',root.dataset.nav);params.set('nv',root.dataset.navStamp);}
        const url='/api/public/people/'+encodeURIComponent(root.dataset.table)+'/facets/'+encodeURIComponent(facet.dataset.field)+'?'+params;
        const response=await fetch(url,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/json'}});
        if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Facet failed');
        const result=await response.json();if(controller.signal.aborted)return;
        if(result.table!==root.dataset.table||result.field!==facet.dataset.field||result.page!==page||!Array.isArray(result.values)||result.values.length>50||result.values.some(v=>typeof v!=='string')||typeof result.has_more!=='boolean')throw new Error('Invalid facet');
        const select=facet.querySelector('select'),seen=new Set([...select.options].map(o=>o.value));
        for(const value of result.values){if(!seen.has(value)){select.add(new Option(en&&typeof result.labels?.[value]==='string'?result.labels[value]:en&&typeof result.labels_en?.[value]==='string'?result.labels_en[value]:value,value));seen.add(value);}}
        facet.dataset.page=String(page);button.hidden=!result.has_more;
        select.dispatchEvent(new Event('public:facet-options'));
        status.textContent=say('分类选项已更新。','Filter options updated.');
      }catch(_){if(!controller.signal.aborted)status.textContent=say('分类选项读取失败，请重试。','Could not load filter options. Please retry.');}
      finally{clearTimeout(timer);requests.delete(controller);button.disabled=false;facet.dispatchEvent(new CustomEvent('public:facet-status',{detail:controller.signal.aborted?'':status.textContent}));}
    });
  }
  root.addEventListener('click',async event=>{
    const button=event.target.closest('[data-person-expand]');if(!button)return;
    const card=button.closest('[data-person-card]'),bio=card.querySelector('[data-person-biography]'),message=card.querySelector('[data-person-status]');
    const show=button.getAttribute('aria-expanded')!=='true';
    if(button.disabled)return;
    if(show&&!card.dataset.biographyLoaded){
      button.disabled=true;button.setAttribute('aria-busy','true');
      message.textContent=say('正在读取简介…','Loading biography…');message.classList.remove('visually-hidden');
      const controller=new AbortController();requests.add(controller);const timer=setTimeout(()=>controller.abort(),15000);
      try{
        if(card.dataset.descriptionUrl){
          const url=new URL(card.dataset.descriptionUrl,location.href);
          if(url.origin!==location.origin||url.pathname!==`/api/public/${lang}/${root.dataset.table}/${card.dataset.recordId}/description`)throw new Error('Invalid description');
          if(root.dataset.nav){url.searchParams.set('nav',root.dataset.nav);url.searchParams.set('nv',root.dataset.navStamp);}
          const response=await fetch(url.pathname+url.search,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/json'}});
          if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Description unavailable');
          const payload=await response.json();
          if(controller.signal.aborted)return;
          if(payload.uid!==card.dataset.recordId||payload.table!==root.dataset.table||payload.lang!==lang||typeof payload.text!=='string')throw new Error('Changed description');
          bio.textContent=payload.text;
        }else{
        const link=card.querySelector('[data-person-link]'),url=new URL(link.href,location.href);url.searchParams.delete('from');
        if(url.origin!==location.origin||url.pathname!==`${root.dataset.endpoint||'/'+lang+'/'+root.dataset.table}/${card.dataset.recordId}`)throw new Error('Invalid detail');
        const response=await fetch(url.pathname+url.search,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'text/html'}});
        if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw new Error('Detail unavailable');
        const doc=new DOMParser().parseFromString(await response.text(),'text/html');
        if(controller.signal.aborted)return;
        const target=doc.querySelector('[data-person-detail]');
        if(!target||target.dataset.recordId!==card.dataset.recordId||target.dataset.table!==root.dataset.table||target.dataset.lang!==lang)throw new Error('Changed detail');
        bio.textContent=target.querySelector('[data-person-biography]')?.textContent||'';
        }
        card.dataset.biographyLoaded='1';message.textContent='';message.classList.add('visually-hidden');
      }catch(_){if(controller.signal.aborted)return;message.textContent=say('简介读取失败，请重试。','Could not load the biography. Please retry.');return;}
      finally{clearTimeout(timer);requests.delete(controller);button.disabled=false;button.removeAttribute('aria-busy');}
    }
    bio.hidden=!bio.textContent.trim();bio.classList.toggle('is-expanded',show);
    button.setAttribute('aria-expanded',String(show));
    const label=show?say('收起简介','Collapse biography'):say('展开简介','Expand biography');button.title=label;button.setAttribute('aria-label',label);
    if(!bio.textContent.trim()){message.textContent=say('暂无公开简介。','No public biography.');message.classList.remove('visually-hidden');}
  });
  window.addEventListener('pagehide',()=>{for(const controller of requests)controller.abort();});
  document.addEventListener('teacher:navigation-start',()=>{for(const controller of requests)controller.abort();});
  document.addEventListener('teacher:navigation-cancel',refresh);
  window.addEventListener('pageshow',refresh);
  const biographyObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>{
    for(const card of cards()){
      const expand=card.querySelector('[data-person-expand]'),bio=card.querySelector('[data-person-biography]');
      if(expand&&bio)expand.hidden=!bio.textContent.trim()||(expand.getAttribute('aria-expanded')!=='true'&&!(card.dataset.descriptionUrl&&!card.dataset.biographyLoaded)&&bio.scrollHeight<=bio.clientHeight+1);
    }
  }):null;
  window.addEventListener('resize',prepare);
  document.fonts?.ready.then(prepare);
  prepare();
})();
