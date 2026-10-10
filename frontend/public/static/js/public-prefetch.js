/* Intent-only public navigation warming. HTTP cache owns responses, never a JS HTML cache. */
(() => {
  'use strict';
  const root=document.querySelector('[data-public-nav-prefetch-concurrency]');
  if(!root)return;
  const value=Number(root.dataset.publicNavPrefetchConcurrency);
  const concurrency=Number.isInteger(value)&&value>=0&&value<=2?value:1;
  if(!concurrency)return;
  const selector='a.academic-brand,a[data-navigation-id]';
  const route=/^\/(en|zh)(?:\/(profiles|students|research_interests|projects|publications|patents|courses|news)|\/n\/[a-z0-9][a-z0-9_-]{0,79})?$/;
  const queryKeys=new Set(['page','size','direction','sort','s','nv']);
  const seen=new Set(),active=new Map(),queue=[];
  const maxBytes=256*1024,maxAttempts=32,maxQueue=4;
  let paused=false,hover=null;
  const permitted=()=>!paused&&document.visibilityState!=='hidden'&&!navigator.connection?.saveData&&navigator.onLine!==false;
  function target(link){
    if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return '';
    try{
      const url=new URL(link.href,location.href);
      if(!['http:','https:'].includes(url.protocol)||url.origin!==location.origin||url.username||url.password||url.hash||!route.test(url.pathname)||url.search.length>4096)return '';
      const keys=[...url.searchParams.keys()];
      if(new Set(keys).size!==keys.length||keys.some(key=>!queryKeys.has(key)))return '';
      if(!url.pathname.slice(3)&&keys.length)return '';
      if(url.pathname===location.pathname&&url.search===location.search)return '';
      return url.href;
    }catch{return '';}
  }
  function cancelHover(){if(hover){clearTimeout(hover.timer);hover=null;}}
  function enqueue(link){
    const url=target(link);
    if(!permitted()||!url||seen.has(url)||active.has(url)||queue.includes(url)||seen.size>=maxAttempts||queue.length>=maxQueue)return;
    queue.push(url);pump();
  }
  async function warm(url,controller){
    let reader;
    const timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(url,{credentials:'same-origin',redirect:'error',priority:'low',headers:{Accept:'text/html'},signal:controller.signal});
      const declared=response.headers.get('content-length');
      if(!response.ok||!response.headers.get('content-type')?.toLowerCase().startsWith('text/html')||response.headers.get('cache-control')?.toLowerCase().includes('no-store')||(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes)))throw Error('Not a cacheable page');
      if(!response.body?.getReader)throw Error('Streaming unavailable');
      reader=response.body.getReader();let size=0;
      // Drain bounded chunks so HTTP caching can finish, without parsing or retaining HTML.
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes||controller.signal.aborted)throw Error('Prefetch limit');}
    }catch{
      controller.abort(); // Optional warming never replaces the ordinary navigation/error UI.
      if(reader)try{await reader.cancel();}catch{}
    }finally{clearTimeout(timeout);try{reader?.releaseLock();}catch{}}
  }
  function pump(){
    while(permitted()&&active.size<concurrency&&queue.length&&seen.size<maxAttempts){
      const url=queue.shift();if(seen.has(url))continue;
      seen.add(url);const controller=new AbortController();active.set(url,controller);
      warm(url,controller).finally(()=>{active.delete(url);pump();});
    }
  }
  document.addEventListener('pointerover',event=>{
    if(event.pointerType==='touch')return;
    const link=event.target.closest?.(selector);
    if(!link||link.contains(event.relatedTarget)||!permitted()||!target(link))return;
    cancelHover();hover={link,timer:setTimeout(()=>{hover=null;enqueue(link);},120)};
  });
  document.addEventListener('pointerout',event=>{
    if(hover&&event.target.closest?.(selector)===hover.link&&!hover.link.contains(event.relatedTarget))cancelHover();
  });
  document.addEventListener('focusin',event=>enqueue(event.target.closest?.(selector)));
  document.addEventListener('touchstart',event=>enqueue(event.target.closest?.(selector)),{passive:true});
  function stop(){cancelHover();queue.length=0;for(const controller of active.values())controller.abort();}
  window.addEventListener('pagehide',()=>{paused=true;stop();});
  window.addEventListener('pageshow',()=>{paused=false;});
  window.addEventListener('offline',stop);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stop();});
  navigator.connection?.addEventListener?.('change',()=>{if(navigator.connection.saveData)stop();});
})();
