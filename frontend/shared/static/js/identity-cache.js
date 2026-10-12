/* Five display fields only; never a permission, session or CSRF cache. */
(()=>{'use strict';
const key='teacher:identity-display:v2',stampKey=key+':stamp',change='teacher:identity-change',retryKey='teacher:identity-retry:v1';
const TTL=300000;let memory=null,memoryStamp='';
const stamp=()=>{try{return localStorage.getItem(change)||'';}catch{return memoryStamp;}};
function valid(v){return v&&Object.keys(v).length===5&&typeof v.authenticated==='boolean'&&typeof v.username==='string'&&v.username.length<=150&&typeof v.display_name==='string'&&v.display_name.length<=200&&typeof v.can_enter_admin==='boolean'&&typeof v.checked_at==='string'&&Number.isFinite(Date.parse(v.checked_at))&&Date.parse(v.checked_at)<=Date.now();}
function load(){
 try{memory=JSON.parse(sessionStorage.getItem(key)||'null');memoryStamp=sessionStorage.getItem(stampKey)||'';}catch{}
 if(!valid(memory)||memoryStamp!==stamp())return null;
 return {...memory};
}
function save(data){
 if(typeof data.authenticated!=='boolean'||(data.authenticated&&(typeof data.username!=='string'||typeof data.display_name!=='string')))throw Error('Invalid identity');
 memory={authenticated:data.authenticated,username:data.authenticated?data.username.slice(0,150):'',display_name:data.authenticated?(data.display_name||data.username).slice(0,200):'',can_enter_admin:data.authenticated&&data.can_enter_admin===true,checked_at:new Date(Date.now()).toISOString()};
 memoryStamp=stamp();try{sessionStorage.setItem(key,JSON.stringify(memory));sessionStorage.setItem(stampKey,memoryStamp);}catch{}
}
function clear(){memory=null;try{sessionStorage.removeItem(key);sessionStorage.removeItem(stampKey);sessionStorage.removeItem('teacher:identity-display:v1');}catch{}}
function retry(){try{const v=JSON.parse(sessionStorage.getItem(retryKey)||'null');return v&&Number.isFinite(v.until)&&v.until<=Date.now()+TTL&&Number.isInteger(v.count)&&v.count>=1&&v.count<=3?v:null;}catch{return null;}}
function success(){try{sessionStorage.removeItem(retryKey);}catch{}}
function failure(){const count=Math.min(3,(retry()?.count||0)+1),until=Date.now()+Math.min(300,60*2**(count-1))*1000;try{sessionStorage.setItem(retryKey,JSON.stringify({count,until}));}catch{}return until;}
function invalidate(){clear();success();try{localStorage.setItem(change,Date.now()+':'+Math.random());}catch{}}
window.TeacherIdentityCache={load,save,clear,invalidate,retryAt:()=>retry()?.until||0,success,failure,freshUntil:v=>Date.parse(v.checked_at)+TTL};
// Old expiry/permission-shaped snapshots are never migrated into the new display format.
try{sessionStorage.removeItem('teacher:identity-display:v1');}catch{}
document.addEventListener('teacher:identity-change',invalidate);
document.addEventListener('formdata',event=>{
 const action=event.target?.getAttribute?.('action');if(!action)return;const url=new URL(action,location.href);
 if(url.origin===location.origin&&['/auth/logout','/auth/login'].includes(url.pathname))invalidate();
},true);
window.addEventListener('storage',event=>{if(event.key===change){clear();document.dispatchEvent(new Event('teacher:identity-invalidated'));}});
})();
