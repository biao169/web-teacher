/* Encode visitor text state only; fixed conditions never come from this form. */
(() => {
  'use strict';
  const form=document.querySelector('[data-public-query-form]');if(!form)return;
  form.addEventListener('submit',event=>{
    const state={},params=new URLSearchParams();
    for(const [key,value] of new FormData(form)){
      if(typeof value!=='string'||!value)continue;
      if(key==='q'||key.startsWith('f.')||key.startsWith('c.'))state[key]=value;
      else if(['direction','size'].includes(key))params.set(key,value);
    }
    if(Object.keys(state).length){
      const ordered=Object.fromEntries(Object.keys(state).sort().map(key=>[key,state[key]]));
      let binary='';for(const byte of new TextEncoder().encode(JSON.stringify(ordered)))binary+=String.fromCharCode(byte);
      params.set('s',btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''));
    }
    const url=new URL(form.action,location.href);if(url.origin!==location.origin)return;
    event.preventDefault();url.search=params.toString();url.hash='';location.assign(url.pathname+url.search);
  });
})();
