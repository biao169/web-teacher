/** Read-only draft matching; saving remains the responsibility of the shared editor. */
import {assist} from './native-assistance.js';
const root=document.querySelector('[data-category-matches][data-can-preview="true"]');
if(root){
 const form=root.closest('form'),keywords=form.elements.namedItem('keywords'),results=root.querySelector('[data-match-results]'),feedback=root.querySelector('[data-match-feedback]'),button=root.querySelector('[data-match-preview]'),size=root.querySelector('[data-match-size]');
 let controller,timer,generation=0,composing=false,saving=false;
 // Invalidate immediately on input, before debounce: old responses must never describe a new draft.
 const cancel=()=>{clearTimeout(timer);generation++;controller?.abort();button.disabled=false;results.removeAttribute('aria-busy')};
 const preview=async(page=1)=>{
  if(saving||composing)return;cancel();const ticket=generation,value=keywords.value;controller=new AbortController();
  button.disabled=true;results.setAttribute('aria-busy','true');feedback.dataset.uiState='info';feedback.textContent='正在匹配当前输入…';
  try{
   const result=await assist('student-matches',{uid:form.elements.namedItem('_uid').value,keywords:value,page,size:Number(size.value)},{signal:controller.signal});
   if(ticket!==generation||value!==keywords.value||saving)return;
   // HTML comes only from the server's auto-escaped shared result template, never from input interpolation.
   results.innerHTML=result.html;
   const persisted=root.dataset.isSaved==='true'&&value===root.dataset.savedKeywords;
   feedback.dataset.uiState=persisted?'success':'warning';
   feedback.textContent=(persisted?'已保存关键词':'未保存的关键词草稿')+` · 匹配 ${result.total} 人。`+(persisted?'':'保存并激活后才生效。');
  }catch(error){if(ticket!==generation||saving||error.name==='AbortError')return;results.replaceChildren();feedback.dataset.uiState='error';feedback.textContent=error.message+' 当前输入已保留，可点击“预览匹配”重试。'}
  finally{if(ticket===generation){button.disabled=false;results.removeAttribute('aria-busy')}}
 };
 const changed=()=>{cancel();results.replaceChildren();feedback.dataset.uiState='warning';feedback.textContent='关键词已修改，匹配结果待刷新；当前输入尚未保存。';if(!composing&&!saving)timer=setTimeout(()=>preview(),450)};
 keywords.addEventListener('compositionstart',()=>{composing=true;cancel()});
 keywords.addEventListener('compositionend',()=>{composing=false;changed()});
 keywords.addEventListener('input',changed);
 button.addEventListener('click',()=>preview());size.addEventListener('change',()=>preview());
 results.addEventListener('click',event=>{const page=event.target.closest('[data-match-page]');if(page&&!page.disabled)preview(Number(page.dataset.matchPage))});
 form.addEventListener('submit',()=>{saving=true;cancel()});
 // The shared editor emits this only after a failed save, so a preserved draft remains previewable.
 form.addEventListener('native-save-failed',()=>{saving=false});
}
