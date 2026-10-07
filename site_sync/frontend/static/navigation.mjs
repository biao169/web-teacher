/** Open folded settings and locate them inside the existing admin scroller. */
const nav=document.querySelector('[data-sync-navigation]');
if(nav){
 const links=[...nav.querySelectorAll('a[href^="#"]')];
 const targets=new Map(links.map(link=>[link.hash,document.getElementById(link.hash.slice(1))]).filter(([,target])=>target));
 function locate(hash){
  const target=targets.get(hash);if(!target)return;
  for(let node=target;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
  target.tabIndex=-1;target.dataset.syncTarget='';target.focus({preventScroll:true});
  const main=target.closest('.workspace-content');
  if(main){const top=main.scrollTop+target.getBoundingClientRect().top-main.getBoundingClientRect().top-nav.offsetHeight-18;main.scrollTo({top:Math.max(0,top),behavior:'auto'});}
  else target.scrollIntoView({block:'start',behavior:'auto'});
  for(const link of links){if(link.hash===hash)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}
 }
 nav.addEventListener('click',event=>{
  const link=event.target.closest('a');if(!link||!nav.contains(link)||!targets.has(link.hash)||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();if(location.hash!==link.hash)history.pushState(null,'',link.hash);locate(link.hash);
 });
 window.addEventListener('hashchange',()=>locate(location.hash));
 requestAnimationFrame(()=>locate(location.hash));
}
