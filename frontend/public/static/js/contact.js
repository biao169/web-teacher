/* Progressive contact form; native POST remains available without JavaScript. */
(()=>{'use strict';const form=document.querySelector('[data-contact-form]');if(!form)return;
const button=form.querySelector('[type=submit]'),status=form.querySelector('[data-contact-feedback]'),en=form.dataset.lang==='en',say=(zh,eng)=>en?eng:zh;let busy=false,sent=!!form.dataset.sent;
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy||sent||button.disabled||!form.reportValidity())return;
 busy=true;button.disabled=true;form.setAttribute('aria-busy','true');status.textContent=say('正在提交…','Sending…');
 const body=new URLSearchParams(new FormData(form)),fields=[...form.querySelectorAll('input:not([type=hidden]),textarea')];
 fields.forEach(field=>field.readOnly=true);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(form.action,{method:'POST',signal:controller.signal,credentials:'same-origin',redirect:'error',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Unknown result');
  const result=await response.json();if(typeof result.ok!=='boolean'||typeof result.message!=='string')throw Error('Unknown result');
  if(response.ok&&result.ok){sent=true;form.dataset.sent='1';status.textContent=result.message;for(const field of form.querySelectorAll('input:not([type=hidden]),textarea'))field.readOnly=true;const another=document.createElement('a');another.href=form.action;another.textContent=say('再写一条','Write another message');form.querySelector('.contact-actions').append(another);}
  else{status.textContent=result.message;if(typeof result.challenge==='string')form.elements.challenge.value=result.challenge;}
 }catch(_){status.textContent=say('暂时无法确认是否提交成功，内容已保留。请勿立即重复提交；确认网络恢复后再决定是否重试。','The submission result could not be confirmed. Your text is retained. Avoid immediately resending; check your connection before retrying.');}
 finally{clearTimeout(timer);if(!sent)fields.forEach(field=>field.readOnly=false);busy=false;button.disabled=sent;form.removeAttribute('aria-busy');status.focus();}
});})();
