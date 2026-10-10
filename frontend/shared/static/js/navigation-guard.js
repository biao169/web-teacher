/* Native navigation stays native. Only disposable reads listen to these events. */
(()=>{'use strict';let locked=false,timer=null;
const emit=name=>document.dispatchEvent(new CustomEvent(name));
function eligible(event){
 if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return false;
 const a=event.target.closest?.('a[href]');if(!a||a.hasAttribute('download')||(a.target&&a.target!=='_self'))return false;
 if(a.closest('[data-navigation-ignore],[data-auth-open],[data-auth-switch],[data-load-more],[data-media-locations],[data-source-page],[data-bs-toggle],[role="tab"]'))return false;
 const raw=a.getAttribute('href');if(!raw||raw.startsWith('#'))return false;
 let url;try{url=new URL(a.href,location.href);}catch{return false;}
 return ['http:','https:'].includes(url.protocol)&&url.origin===location.origin&&!(url.pathname===location.pathname&&url.search===location.search&&url.hash);
}
function reset(){clearTimeout(timer);timer=null;locked=false;}
// Block subsequent native navigations before their delegated handlers run.
window.addEventListener('click',event=>{if(locked&&eligible(event)){event.preventDefault();event.stopImmediatePropagation();}},true);
// Run after document handlers so modal/component links can prevent default first.
window.addEventListener('click',event=>{
 if(event.defaultPrevented||!eligible(event))return;
 locked=true;emit('teacher:navigation-start');
 timer=setTimeout(()=>{reset();emit('teacher:navigation-cancel');},3000);
});
window.addEventListener('pagehide',reset);
window.addEventListener('pageshow',reset);
})();
