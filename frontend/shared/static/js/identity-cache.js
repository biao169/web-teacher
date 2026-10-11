/* Display hints only. Cookies, CSRF, permissions and private values never persist. */
(()=>{'use strict';
const key='teacher:identity-display:v1',change='teacher:identity-change';
const retryKey='teacher:identity-retry:v1';
let memory=null;
const stamp=()=>{try{return localStorage.getItem(change)||'';}catch{return '';}};
function load(){
 try{memory=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
 const v=memory;
 if(!v||v.version!==1||v.stamp!==stamp()||typeof v.authenticated!=='boolean'||
 !Number.isFinite(v.savedAt)||v.savedAt>Date.now()||!Number.isFinite(v.freshUntil)||
 !Number.isFinite(v.expiresAt)||v.expiresAt<=Date.now()||
 (v.authenticated&&(typeof v.username!=='string'||typeof v.display_name!=='string')))return null;
 return v;
}
function save(data){
 if(typeof data.authenticated!=='boolean')throw Error('Invalid identity');
 if(data.authenticated&&(typeof data.username!=='string'||typeof data.csrf!=='string'))throw Error('Invalid identity');
 const now=Date.now(),server=Date.parse(data.checked_at);
 const end=data.authenticated?Math.min(Date.parse(data.idle_expires_at),Date.parse(data.absolute_expires_at)):server+60000;
 // Missing expiry metadata is usable for this request, but must not be cached.
 if(!Number.isFinite(server)||!Number.isFinite(end)||end<=server){clear();return;}
 const ttl=Math.min(data.authenticated?300:60,Number(data.display_ttl_seconds)||0)*1000;
 memory={version:1,stamp:stamp(),authenticated:data.authenticated,savedAt:now,
 freshUntil:now+Math.min(ttl,end-server),expiresAt:now+end-server};
 if(data.authenticated)Object.assign(memory,{username:data.username.slice(0,150),
 display_name:String(data.display_name||data.username).slice(0,200),can_enter_admin:data.can_enter_admin===true});
 try{sessionStorage.setItem(key,JSON.stringify(memory));}catch{}
}
function clear(){memory=null;try{sessionStorage.removeItem(key);}catch{}}
function retry(){try{const v=JSON.parse(sessionStorage.getItem(retryKey)||'null');return v&&Number.isFinite(v.until)&&v.until<=Date.now()+300000?v:null;}catch{return null;}}
function success(){try{sessionStorage.removeItem(retryKey);}catch{}}
function failure(){const count=Math.min(3,(retry()?.count||0)+1),until=Date.now()+Math.min(300,60*2**(count-1))*1000;try{sessionStorage.setItem(retryKey,JSON.stringify({count,until}));}catch{}return until;}
function invalidate(){clear();success();try{localStorage.setItem(change,Date.now()+':'+Math.random());}catch{}}
window.TeacherIdentityCache={load,save,clear,invalidate,retryAt:()=>retry()?.until||0,success,failure};
document.addEventListener('teacher:identity-change',invalidate);
document.addEventListener('formdata',event=>{
 const action=event.target?.getAttribute?.('action');if(!action)return;
 const url=new URL(action,location.href);
 if(url.origin===location.origin&&['/auth/logout','/auth/login'].includes(url.pathname))invalidate();
},true);
window.addEventListener('storage',event=>{if(event.key===change){clear();document.dispatchEvent(new Event('teacher:identity-invalidated'));}});
})();
