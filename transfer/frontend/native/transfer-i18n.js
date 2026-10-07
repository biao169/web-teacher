import catalog from './transfer-i18n-catalog.js?v=0.15.96';
// Tokens preserve raw file names and live status parameters across language changes.
let language=typeof document==='undefined'?'zh':((document.documentElement?.lang||'zh').startsWith('en')?'en':'zh');
const bindings=new Map(),rendered=new Map();let writes=0,generation=0;
class TextToken{
 constructor(render){this.render=render}
 toString(){const value=this.render(language);if(value){rendered.delete(value);rendered.set(value,this);if(rendered.size>512)rendered.delete(rendered.keys().next().value)}return value}
 valueOf(){return this.toString()}
 toJSON(){return this.toString()}
 [Symbol.toPrimitive](){return this.toString()}
}
export function t(key,args=[]){return new TextToken(lang=>(lang==='en'?(catalog[key]||key):key).replace(/\{(\d+)\}/g,(match,n)=>n<args.length?String(args[n]):match))}
export function joinText(a,b){return new TextToken(()=>String(a)+String(b))}
export function errorText(value){if(value instanceof TextToken)return value;const text=String(value??'');return rendered.get(text)||(catalog[text]?t(text):/[\u4e00-\u9fff]/.test(text)?new TextToken(lang=>lang==='en'?catalog['请求未能完成，请检查权限、额度或任务状态后重试。']:text):text)}
function bind(node,name,value){
 if(!node)return;
 let fields=bindings.get(node);if(!fields){fields=new Map();bindings.set(node,fields)}
 if(value instanceof TextToken)fields.set(name,value);else fields.delete(name);
 if(!fields.size)bindings.delete(node);
 if(++writes%128===0)Promise.resolve().then(()=>{for(const [el] of bindings)if(!el.isConnected)bindings.delete(el)});
}
export function getText(node){return bindings.get(node)?.get('textContent')??node.textContent}
export function setText(node,value){bind(node,'textContent',value);node.textContent=String(value??'');return value}
export function setAttr(node,name,value){bind(node,name,value);node.setAttribute(name,String(value));return value}
function renderPage(){
 if(typeof document==='undefined')return;
 document.documentElement.lang=language;
 for(const [node,fields] of bindings){if(!node.isConnected){bindings.delete(node);continue}for(const [name,value] of fields)if(name==='textContent')node.textContent=String(value);else node.setAttribute(name,String(value))}
 document.querySelectorAll('[data-transfer-i18n]').forEach(node=>{node.textContent=String(t(node.dataset.transferI18n))});
 for(const attr of ['aria-label','title','placeholder'])document.querySelectorAll('[data-transfer-i18n-'+attr+']').forEach(node=>node.setAttribute(attr,String(t(node.getAttribute('data-transfer-i18n-'+attr)))));
 document.querySelectorAll('[data-public-language]').forEach(node=>{if(node.dataset.publicLanguage===language)node.setAttribute('aria-current','true');else node.removeAttribute('aria-current')});
 document.dispatchEvent(new (document.defaultView.Event)('transfer-language-change'));
}
export function getLanguage(){return language}
export async function setLanguage(next,{refreshHeader=true}={}){
 if(!['zh','en'].includes(next))return;
 language=next;const revision=++generation;renderPage();
 if(typeof document==='undefined')return;
 const w=document.defaultView;
 document.cookie='public_language='+language+'; Path=/; SameSite=Lax; Max-Age=31536000'+(w.location.protocol==='https:'?'; Secure':'');
 const url=new URL(w.location.href);url.searchParams.set('lang',language);w.history.replaceState(w.history.state,'',url);
 const header=document.querySelector('.academic-header');
 if(!refreshHeader||!header)return;
 try{
  const response=await fetch(url.href,{credentials:'same-origin',headers:{Accept:'text/html'}});
  if(!response.ok)throw Error('header');
  const html=await response.text();if(revision!==generation)return;
  const parsed=new w.DOMParser().parseFromString(html,'text/html'),replacement=parsed.querySelector('.academic-header');
  if(!replacement)throw Error('header');
  header.replaceWith(document.importNode(replacement,true));
  document.dispatchEvent(new w.Event('public-header-updated'));
  const status=document.getElementById('transfer-language-status');if(status)setText(status,'');
 }catch(error){if(revision!==generation)return;const status=document.getElementById('transfer-language-status');if(status)setText(status,t('导航更新失败，传输不受影响。'))}
}
if(typeof document!=='undefined'&&document.addEventListener){
 if(document.documentElement?.lang&&document.defaultView)document.cookie='public_language='+language+'; Path=/; SameSite=Lax; Max-Age=31536000'+(document.defaultView.location.protocol==='https:'?'; Secure':'');
 document.addEventListener('click',event=>{const link=event.target.closest?.('[data-public-language]');if(!link||!document.querySelector('[data-portal]')||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();void setLanguage(link.dataset.publicLanguage)});
}
