/* Bounded server-rendered chunks, shared by home modules and public lists. */
(() => {
  'use strict';
  const states=[];
  const queue=[];
  const configured=Number(document.querySelector('[data-public-stream-concurrency]')?.dataset.publicStreamConcurrency);
  const concurrency=Number.isInteger(configured)&&configured>=1&&configured<=4?configured:2;
  let active=0,paused=false;
  const say=(s,zh,en)=>s.lang==='en'?en:zh;
  const endpoint=s=>s.endpoint;
  const queryKey=url=>JSON.stringify([...url.searchParams].filter(([key])=>key!=='page').sort(([a],[b])=>a.localeCompare(b)));
  function safeNext(s,value,after=s.page){
    if (!value) return '';
    const u=new URL(value,location.href);
    const p=Number(u.searchParams.get('page'));
    if(u.origin!==location.origin || u.pathname!==endpoint(s) || !Number.isInteger(p) || p<=after || (u.searchParams.get('home')==='1')!==s.home || (s.nav && u.searchParams.get('nv')!==s.stamp)) throw new Error('Invalid continuation');
    if(s.queryId&&s.queryKey&&queryKey(u)!==s.queryKey)throw new Error('Changed query');
    return u.pathname+u.search;
  }
  function watch(s){
    if(s.observer && !s.busy && !s.blocked && s.next && !paused) s.observer.observe(s.controls);
  }
  function updateLinks(s){
    s.root.dataset.next=s.next;
    s.more.hidden=!s.next;s.fallback.hidden=!s.next;
    if(s.next){s.more.href=s.next;s.fallback.href=s.next;}
    else {s.more.removeAttribute('href');s.fallback.removeAttribute('href');}
  }
  function retryHome(){
    let button=document.querySelector('[data-home-retry]');
    if(!button){button=document.createElement('button');button.type='button';button.dataset.homeRetry='';button.className='btn btn-outline-secondary';button.textContent=document.documentElement.lang==='en'?'Retry loading content':'重试加载内容';document.querySelector('.faculty-home')?.after(button);button.addEventListener('click',()=>{button.hidden=true;for(const state of states)if(state.home&&state.page===0)schedule(state,true);});}
    button.hidden=false;
  }
  function schedule(s,manual=false){
    if(paused || !s.next || s.busy || s.queued || (s.blocked&&!manual)) return;
    s.queued=true;queue.push({s,manual});pump();
  }
  function pump(){
    while(active<concurrency&&queue.length&&!paused){
      const {s,manual}=queue.shift();s.queued=false;active++;
      load(s,manual).finally(()=>{active--;pump();});
    }
  }
  async function load(s,manual){
    if(paused||!s.next||s.busy)return;
    s.observer?.unobserve(s.controls);s.busy=true;s.blocked=false;
    s.root.setAttribute('aria-busy','true');s.more.setAttribute('aria-disabled','true');
    if(s.home&&s.page===0)s.root.dataset.streamState='loading';
    s.status.textContent=say(s,'正在加载…','Loading…');
    const controller=new AbortController();s.controller=controller;
    const timer=setTimeout(()=>controller.abort(),15000);
    try {
      const url=safeNext(s,s.next);
      const expected=Number(new URL(url,location.href).searchParams.get('page'));
      const response=await fetch(url,{credentials:'same-origin',headers:{'Accept':'application/json','X-Public-Fragment':'1'},signal:controller.signal,redirect:'error'});
      if(!response.ok || !response.headers.get('content-type')?.includes('application/json'))throw new Error('HTTP error');
      const result=await response.json();
      if(paused||controller.signal.aborted)return;
      if((s.queryId && result.query_id!==s.queryId) || (s.nav && (result.nav!==s.nav || result.nav_stamp!==s.stamp)) || result.table!==s.table || result.lang!==s.lang || result.home!==s.home || result.page!==expected || typeof result.html!=='string' || !Number.isInteger(result.total)||result.total<0)throw new Error('Changed results');
      const next=safeNext(s,result.next_url,result.page);
      const template=document.createElement('template');template.innerHTML=result.html;
      const articles=[...template.content.children].filter(el=>el.tagName==='ARTICLE'&&el.dataset.recordId);
      if((next||(s.home&&result.total>0))&&!articles.length)throw new Error('Missing rows');
      const additions=[];
      for(const el of articles){if(s.ids.has(el.dataset.recordId))continue;s.ids.add(el.dataset.recordId);s.items.append(el);additions.push(el);}
      s.page=result.page;s.next=next;s.root.dataset.page=String(s.page);s.root.dataset.total=String(result.total);
      updateLinks(s);
      if(s.home){
        s.root.dataset.streamState=result.total>0?'ready':'empty';
        s.root.hidden=result.total===0;
        const group=s.root.closest('[data-home-group]');
        if(group){const visible=[...group.querySelectorAll('[data-public-stream]')].filter(el=>!el.hidden).length;group.dataset.moduleCount=String(visible);group.hidden=visible===0;}
      }
      s.more.textContent=say(s,'加载更多','Load more');
      s.status.textContent=next?say(s,`本页已加载 ${s.ids.size} 条，共 ${result.total} 条`,`Loaded ${s.ids.size} here, ${result.total} total`):say(s,'已显示全部后续结果','All remaining results loaded');
      s.root.dispatchEvent(new CustomEvent('public:appended',{bubbles:true,detail:{count:additions.length,page:s.page,total:result.total}}));
      if(manual&&!next)s.status.focus({preventScroll:true});
    } catch(error){
      if(s.home&&s.page===0)s.root.dataset.streamState='pending';
      if(!paused){if(s.home&&s.page===0)retryHome();s.blocked=true;s.more.textContent=say(s,'重试加载','Retry');s.status.textContent=say(s,'加载未完成，请重试或使用分页查看；内容有变化时请刷新。','Could not load more. Retry or open the next page; refresh if content changed.');}
    } finally {
      clearTimeout(timer);s.controller=null;s.busy=false;s.root.removeAttribute('aria-busy');s.more.removeAttribute('aria-disabled');watch(s);if(!paused&&s.home&&s.page===0&&!s.blocked)schedule(s);
    }
  }
  for(const root of document.querySelectorAll('[data-public-stream]')){
    const s={root,items:root.querySelector('[data-stream-items]'),controls:root.querySelector('[data-stream-controls]'),more:root.querySelector('[data-load-more]'),fallback:root.querySelector('[data-page-fallback]'),status:root.querySelector('[data-stream-status]'),queryId:root.dataset.queryId||'',queryKey:root.dataset.next?queryKey(new URL(root.dataset.next,location.href)):'',table:root.dataset.table,lang:root.dataset.lang,endpoint:root.dataset.endpoint||'/' + root.dataset.lang + '/' + root.dataset.table,nav:root.dataset.nav||'',stamp:root.dataset.navStamp||'',home:root.dataset.home==='1',page:Number(root.dataset.page),next:root.dataset.next||'',busy:false,queued:false,blocked:false,observer:null,controller:null};
    if(!s.items||!s.controls||!s.more||!s.fallback||!s.status)continue;
    s.ids=new Set([...s.items.querySelectorAll('[data-record-id]')].map(el=>el.dataset.recordId));
    try{s.next=safeNext(s,s.next);}catch{continue;}
    s.more.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();schedule(s,true);});
    if('IntersectionObserver' in window && !navigator.connection?.saveData){s.observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))schedule(s);},{rootMargin:'0px 0px 240px 0px'});}
    states.push(s);updateLinks(s);watch(s);
  }
  // Initial homepage slices share the existing queue, including browsers without IO.
  // Hidden home sections need their first bounded slice even with Save-Data.
  function initial(){for(const s of states)if(s.home&&s.page===0)schedule(s);}
  initial();
  function pause(){paused=true;queue.length=0;for(const s of states){s.queued=false;s.observer?.disconnect();s.controller?.abort();}}
  document.addEventListener('public:querychange',pause);
  window.addEventListener('pagehide',pause);
  window.addEventListener('pageshow',async event=>{
    if(event.persisted){
      try{const response=await fetch('/api/public/cache-revision',{credentials:'same-origin'});if(response.ok){const data=await response.json();if(data.revision!==document.querySelector('[data-public-revision]')?.dataset.publicRevision||data.identity!==document.querySelector('[data-public-identity]')?.dataset.publicIdentity){location.reload();return;}}}catch{if(document.querySelector('[data-public-identity]')?.dataset.publicIdentity){location.reload();return;}}
    }
    paused=false;for(const s of states)watch(s);initial();pump();});
})();
