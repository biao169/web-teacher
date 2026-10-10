/* Private islands on Worker Public pages. Never persist identity or private values. */
(()=>{'use strict';
const host=document.querySelector('[data-public-session]');if(!host)return;
const en=host.dataset.lang==='en',login=host.firstElementChild.cloneNode(true);
let generation=0,controller=null,timer=null,active=false,allowed=false,busy=false;
let loaded=new WeakSet();const visible=new WeakSet();
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function clear(){host.replaceChildren(login.cloneNode(true));document.querySelectorAll('[data-private-value]').forEach(n=>n.remove());loaded=new WeakSet();}
function stop(){generation++;active=false;allowed=false;busy=false;controller?.abort();controller=null;clearTimeout(timer);timer=null;observer?.disconnect();clear();}
async function read(url,signal){const timeout=setTimeout(()=>{if(!signal.aborted&&controller?.signal===signal)controller.abort();},15000);try{const response=await fetch(url,{credentials:'same-origin',cache:'no-store',redirect:'error',signal,headers:{Accept:'application/json'}});if(signal.aborted||!response.ok)throw Error('Private component unavailable');return await response.json();}finally{clearTimeout(timeout);}}
function identity(data){
 if(!data.authenticated)return;
 if(typeof data.username!=='string'||typeof data.csrf!=='string')throw Error('Invalid identity');
 const name=node('span',data.display_name||data.username,'academic-username');name.title=data.username;host.replaceChildren(name);
 if(data.can_enter_admin===true){const a=node('a',en?'Admin':'后台','academic-account-link');a.href='/admin';host.append(a);}
 const form=node('form',undefined,'academic-logout');form.action='/auth/logout';form.method='post';form.dataset.publicLogout='';
 const csrf=node('input');csrf.type='hidden';csrf.name='_csrf';csrf.value=data.csrf;
 const button=node('button',en?'Sign out':'退出');button.type='submit';form.append(csrf,button);host.append(form);
 // formdata fires after the browser has captured the CSRF field for native submission.
 form.addEventListener('formdata',()=>{announce();stop();},{once:true});
}
function apply(row){
 for(const card of document.querySelectorAll('[data-project-private]')){
  if(card.dataset.projectPrivate!==row.uid)continue;
  const main=card.querySelector('.project-main');if(!main)continue;
  main.querySelectorAll('[data-private-value]').forEach(n=>n.remove());
  for(const [key,label] of [['principal',en?'Principal':'负责人'],['amount',en?'Amount':'金额'],['members',en?'Members':'项目成员']]){
   if(row[key]===null||row[key]===undefined||row[key]==='')continue;
   const wrapper=node('span');wrapper.dataset.privateValue='';
   const sep=node('span',' · ','project-separator'),piece=node('span',undefined,'project-piece project-'+key);piece.dataset.copyField='';
   piece.append(node('span',label+'：','person-label'),document.createTextNode(String(key==='amount'?row.amount_display:row[key])));wrapper.append(sep,piece);main.append(wrapper);
  }
 }
}
const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){visible.add(e.target);observer.unobserve(e.target);}pump();}):null;
function watch(){if(!active||!allowed)return;document.querySelectorAll('[data-project-private]').forEach(n=>{if(!visible.has(n))observer?observer.observe(n):visible.add(n);});pump();}
async function pump(){
 if(!active||!allowed||busy)return;
 const ids=[...new Set([...document.querySelectorAll('[data-project-private]')].filter(n=>visible.has(n)&&!loaded.has(n)).map(n=>n.dataset.projectPrivate))].slice(0,20);
 if(!ids.length)return;
 busy=true;const seq=generation,signal=controller.signal;
 try{
  const query=new URLSearchParams({lang:en?'en':'zh'});ids.forEach(uid=>query.append('uid',uid));
  const data=await read('/api/public/admin-project-fields?'+query,signal);
  if(seq!==generation||!active)return;
  if(!Array.isArray(data.projects))throw Error('Invalid project response');
  document.querySelectorAll('[data-project-private]').forEach(n=>{if(ids.includes(n.dataset.projectPrivate))loaded.add(n);});
  for(const row of data.projects)if(ids.includes(row.uid))apply(row);
 }catch(error){if(seq===generation){allowed=false;clear();}}
 finally{if(seq===generation){busy=false;if(allowed)timer=setTimeout(pump,200);}}
}
async function start(){
 stop();if(document.visibilityState==='hidden')return;
 active=true;controller=new AbortController();const seq=generation,signal=controller.signal;
 const timeout=setTimeout(()=>{if(seq===generation)controller?.abort();},15000);
 try{const data=await read('/api/public/session-summary',signal);if(seq!==generation||!active)return;identity(data);allowed=data.authenticated===true&&data.can_view_private_projects===true;watch();}
 catch(error){if(seq===generation){clear();allowed=false;}}
 finally{clearTimeout(timeout);}
}
function announce(){try{localStorage.setItem('teacher:identity-change',String(Date.now())+Math.random());}catch{}}
window.addEventListener('pagehide',stop);
window.addEventListener('pageshow',event=>{if(event.persisted)start();});
document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
document.addEventListener('teacher:navigation-start',stop);
document.addEventListener('teacher:navigation-cancel',start);
document.addEventListener('public:querychange',stop);
document.addEventListener('public:appended',watch);
document.addEventListener('teacher:identity-change',()=>{announce();start();});
window.addEventListener('storage',event=>{if(event.key==='teacher:identity-change')start();});
start();
})();
