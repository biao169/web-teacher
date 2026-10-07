/* Reuse the existing preference; public controls do not alter admin typography. */
(() => {
 const html=document.documentElement,key='teacher-reading';
 if(!html.hasAttribute('data-public-reading')){
  const select=document.getElementById('reading-size');if(!select)return;
  const choices=['standard','comfortable','large'];
  try{const value=localStorage.getItem(key);if(choices.includes(value)){select.value=value;html.dataset.reading=value}}catch{}
  select.addEventListener('change',()=>{html.dataset.reading=select.value;try{localStorage.setItem(key,select.value)}catch{}});return;
 }
 const normalize=value=>value==='large'||value==='comfortable'?'large':'standard';
 let current=normalize(html.dataset.reading);
 try{const saved=localStorage.getItem(key);if(saved!==null)current=normalize(saved)}catch{}
 html.dataset.reading=current;
 function sync(){
  const en=(html.lang||'en').startsWith('en');
  document.querySelectorAll('[data-reading-controls]').forEach(group=>{
   group.setAttribute('aria-label',en?'Text size':'字体大小');
   group.querySelectorAll('[data-reading-choice]').forEach(button=>{
    const large=button.dataset.readingChoice==='large',label=en?(large?'Large text':'Standard text'):(large?'大字体':'标准字体');
    button.setAttribute('aria-pressed',String(button.dataset.readingChoice===current));button.setAttribute('aria-label',label);button.title=label;
   });
  });
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-reading-controls] [data-reading-choice]');if(!button)return;
  current=normalize(button.dataset.readingChoice);html.dataset.reading=current;
  try{localStorage.setItem(key,current)}catch{}
  sync();document.dispatchEvent(new Event('public-reading-change'));
 });
 window.addEventListener('storage',event=>{if(event.key!==key&&event.key!==null)return;current=normalize(event.newValue);html.dataset.reading=current;sync();document.dispatchEvent(new Event('public-reading-change'))});
 for(const name of ['DOMContentLoaded','public-header-updated','transfer-language-change'])document.addEventListener(name,sync);
 sync();
})();
