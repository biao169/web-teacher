/** Group selection exports and explicit per-source version adoption; no provider calls on reads. */
import {requestJSON} from './native-http.js?v=0.16.076';
import {notify} from './native-notifications.js';

export function setupTranslationGroups(root){
 const button=root.querySelector('[data-export-groups]');if(!button)return ()=>{};
 const controller=new AbortController();
 button.addEventListener('click',()=>{
  const selected=[...root.querySelectorAll('tr[data-uid]')].filter(row=>row.querySelector('[data-select-row]').checked).map(row=>row.dataset.uid);
  if(!selected.length){notify('请先选择要导出的原文组','info');return}
  const url=new URL(button.dataset.exportGroups,location.origin);url.searchParams.set('selected',selected.join(','));location.assign(url);
 },{signal:controller.signal});
 return ()=>controller.abort();
}

const review=document.querySelector('[data-translation-review]');
if(review){
 const panel=review.querySelector('[data-review-panel]'),feedback=review.querySelector('[data-review-feedback]'),choice=review.querySelector('[data-version-choice]');
 let selected=null,busy=false,sequence=0,current=location.href;
 function paint(){
  panel.querySelectorAll('[data-version]').forEach(row=>row.dataset.chosen=String(row.dataset.version===selected?.uid));
  panel.querySelectorAll('[data-version-apply]').forEach(button=>button.disabled=!selected||busy);
  panel.querySelectorAll('[data-version-select]').forEach(button=>button.disabled=busy);
 }
 async function read(url){
  const seq=++sequence;feedback.textContent='正在读取来源…';
  const result=await requestJSON(url,{headers:{'X-Translation-Group':'1'}});
  if(seq!==sequence||!review.isConnected)return;
  const template=document.createElement('template');template.innerHTML=result.html;
  if(result.owner!==review.dataset.owner||template.content.firstElementChild?.dataset.groupPanel!==review.dataset.group)throw Error('来源或登录身份已变化，请重新打开列表');
  panel.replaceChildren(template.content);current=url;history.replaceState(history.state,'',url);paint();feedback.textContent='';
 }
 review.querySelector('[data-review-back]').addEventListener('click',()=>{
  const url=new URL(location.href),nav=url.searchParams.get('nav');url.pathname=nav?'/admin/n/'+encodeURIComponent(nav):'/admin/translation_cache';url.searchParams.delete('part');location.assign(url);
 });
 panel.addEventListener('click',async event=>{
  const page=event.target.closest('.native-pagination a');
  if(page){event.preventDefault();if(busy||page.closest('.disabled'))return;try{await read(page.href)}catch(error){feedback.textContent=error.message+'；可再次点击页码重试。'}return}
  const select=event.target.closest('[data-version-select]'),apply=event.target.closest('[data-version-apply]');
  if((!select&&!apply)||busy)return;
  const row=(select||apply).closest('[data-version]');
  if(select){
   selected={uid:row.dataset.version,stamp:row.dataset.stamp};choice.textContent='已选用：'+row.querySelector('h2').textContent+' · '+row.querySelector('[data-version-text]').textContent.slice(0,180)+'。选择待译来源后即可填入。';paint();return;
  }
  if(!selected)return;
  busy=true;sequence++;paint();feedback.textContent='正在复核并填入所选译文…';
  let saved=false;
  try{
   const url=new URL(current);url.pathname='/api/assistance/translation-groups/'+encodeURIComponent(review.dataset.group)+'/choose';
   await requestJSON(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_csrf:review.dataset.csrf,nav_stamp:review.dataset.navStamp,donor_uid:selected.uid,donor_stamp:selected.stamp,target_uid:row.dataset.version,target_stamp:row.dataset.stamp})});saved=true;
   await read(current);feedback.textContent='已填入该来源，未调用翻译服务。其他版本已保留。';
  }catch(error){feedback.textContent=(saved?'已保存，但来源列表未能刷新，请重新打开页面核对。':error.uncertain?'结果待核对，请重新打开页面后再决定是否重试。':error.message);if(saved||error.uncertain)selected=null}
  finally{busy=false;paint()}
 });
 paint();
}
