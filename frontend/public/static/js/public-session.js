/* Shared Public identity display; private data and CSRF remain request-bound. */
(()=>{'use strict';
const host=document.querySelector('[data-public-session]');if(!host)return;
const en=host.dataset.lang==='en',login=host.firstElementChild.cloneNode(true);login.hidden=false;
const cache=window.TeacherIdentityCache;
let checking=null,logoutBusy=false;
let heartbeat=null,lastActivity=Date.now(),nextCheck=0,retryUntil=0,heartbeatWanted=false;
const HEARTBEAT=300000,ACTIVE_WINDOW=600000;
function schedule(){
 clearTimeout(heartbeat);heartbeat=null;
 if(!active||document.hidden||!heartbeatWanted||Date.now()-lastActivity>ACTIVE_WINDOW)return;
 const saved=cache?.load();
 const due=Math.max(saved?Math.min(nextCheck||saved.freshUntil,saved.freshUntil):nextCheck,retryUntil,cache?.retryAt()||0);
 heartbeat=setTimeout(()=>{heartbeat=null;if(active&&!document.hidden&&Date.now()-lastActivity<=ACTIVE_WINDOW)start();},Math.max(1000,due-Date.now()));
}
function activity(){lastActivity=Date.now();if(heartbeat===null&&!checking)schedule();}
for(const event of ['pointerdown','keydown','scroll'])document.addEventListener(event,activity,{passive:true});
let generation=0,controller=null,timer=null,active=false,allowed=false,busy=false;
let loaded=new WeakSet();const visible=new WeakSet();
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function clear(reset=false){
 document.querySelectorAll('[data-private-value]').forEach(n=>n.remove());loaded=new WeakSet();
 host.querySelector('form')?.remove();
 if(reset)host.replaceChildren();
}
function feedback(text){
 host.querySelector('.academic-identity-feedback')?.remove();
 const message=node('span',text,'academic-identity-feedback');message.setAttribute('role','status');message.title=text;host.append(message);
}
function pending(){
 if(!host.querySelector('.academic-username'))host.replaceChildren(node('span',en?'Checking identity…':'身份确认中','academic-identity-pending'));
}

function stop(){clearTimeout(heartbeat);heartbeat=null;checking=null;generation++;active=false;allowed=false;busy=false;controller?.abort();controller=null;clearTimeout(timer);timer=null;observer?.disconnect();clear();pending();}
async function read(url,signal){const timeout=setTimeout(()=>{if(!signal.aborted&&controller?.signal===signal)controller.abort();},15000);try{const response=await fetch(url,{credentials:'same-origin',cache:'no-store',redirect:'error',signal,headers:{Accept:'application/json'}});if(signal.aborted||!response.ok)throw Error('Private component unavailable');return await response.json();}finally{clearTimeout(timeout);}}
function identity(data,cached=false){
 if(data.authenticated===false){clear(true);host.replaceChildren(login.cloneNode(true));return;}
 if(data.authenticated!==true)throw Error('Invalid identity');
 if(typeof data.username!=='string'||(!cached&&typeof data.csrf!=='string'))throw Error('Invalid identity');
 const name=node('span',data.display_name||data.username,'academic-username');name.title=(data.display_name||data.username)+' ('+data.username+')';host.replaceChildren(name);
 if(data.can_enter_admin===true){const a=node('a',en?'Admin':'后台','academic-account-link');a.href='/admin';host.append(a);}
 if(cached){
  const button=node('button',en?'Sign out':'退出','academic-account-link');button.type='button';button.disabled=logoutBusy;host.append(button);
  button.addEventListener('click',async()=>{
   if(logoutBusy)return;logoutBusy=true;button.disabled=true;host.setAttribute('aria-busy','true');
   const job=start(true);feedback(en?'Confirming sign out…':'正在确认退出…');
   await job;
   const form=host.querySelector('form');
   host.removeAttribute('aria-busy');
   if(form){form.requestSubmit();}
   else{logoutBusy=false;host.querySelector('button')?.removeAttribute('disabled');feedback(en?'Not signed out. Please retry.':'未能确认退出，请重试。');}
  });
  return;
 }
 const form=node('form',undefined,'academic-logout');form.action='/auth/logout';form.method='post';form.dataset.publicLogout='';
 const csrf=node('input');csrf.type='hidden';csrf.name='_csrf';csrf.value=data.csrf;
 const button=node('button',en?'Sign out':'退出');button.type='submit';form.append(csrf,button);host.append(form);
 // formdata fires after the browser has captured the CSRF field for native submission.
 form.addEventListener('formdata',()=>{announce();stop();clear(true);pending();},{once:true});
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
function start(force=false){
 if(checking)return checking;
 if(document.visibilityState==='hidden')return Promise.resolve();
 stop();active=true;controller=new AbortController();
 const saved=cache?.load();
 if(saved){identity(saved,true);heartbeatWanted=saved.authenticated===true;}else if(cache){clear(true);pending();}
 if(!force&&saved&&saved.freshUntil>Date.now()){
  // A cached hint can initiate a request, but the private endpoint authorizes it.
  allowed=saved.authenticated===true;watch();schedule();return Promise.resolve();
 }
 if(!force&&Math.max(retryUntil,cache?.retryAt()||0)>Date.now()){heartbeatWanted=true;schedule();return Promise.resolve();}
 const seq=generation,signal=controller.signal;
 const job=(async()=>{
  try{
   const data=await read('/api/public/session-summary',signal);
   if(seq!==generation||!active)return;
   cache?.save(data);identity(data);cache?.success();retryUntil=0;
   heartbeatWanted=data.authenticated===true;nextCheck=Date.now()+HEARTBEAT;
   allowed=data.authenticated===true&&data.can_view_private_projects===true;watch();
  }catch(error){if(seq===generation){retryUntil=cache?.failure()||Date.now()+60000;heartbeatWanted=true;clear();if(saved&&saved.expiresAt>Date.now())identity(saved,true);else{if(cache)clear(true);pending();}allowed=false;}}
 })();
 checking=job;
 job.finally(()=>{if(checking===job){checking=null;schedule();}});
 return job;
}

function announce(){cache?.invalidate();}
window.addEventListener('pagehide',stop);
window.addEventListener('pageshow',event=>{if(event.persisted)start();});
document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
document.addEventListener('teacher:navigation-start',stop);
document.addEventListener('teacher:navigation-cancel',()=>{logoutBusy=false;start();});
document.addEventListener('public:querychange',stop);
document.addEventListener('public:appended',watch);
function changed(){retryUntil=0;nextCheck=0;heartbeatWanted=false;stop();clear(true);pending();start(true);}
document.addEventListener('teacher:identity-change',changed);
document.addEventListener('teacher:identity-invalidated',changed);
start();
})();
