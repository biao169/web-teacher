/** Source links focus existing fields/rows without editing their values or opening dialogs. */
function locate(){
 let id;try{id=decodeURIComponent(location.hash.slice(1))}catch{return}
 if(!id.startsWith('field-')&&!id.startsWith('record-'))return;
 const target=document.getElementById(id),main=document.querySelector('.workspace-content');if(!target||!main)return;
 document.querySelectorAll('.native-source-focus').forEach(node=>node.classList.remove('native-source-focus'));
 target.classList.add('native-source-focus');target.tabIndex=-1;target.focus({preventScroll:true});
 const top=main.scrollTop+target.getBoundingClientRect().top-main.getBoundingClientRect().top-(document.querySelector('.native-section-nav')?.offsetHeight||0)-18;
 main.scrollTo({top:Math.max(0,top),behavior:'auto'});
 setTimeout(()=>target.classList.remove('native-source-focus'),4500);
}
requestAnimationFrame(locate);window.addEventListener('hashchange',locate);
