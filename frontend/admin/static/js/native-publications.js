/** Paper draft tools: field-local undo, compact citation pairs and explicit all-format updates. */
import {generatePublicationCitations,parsePublicationCitation} from './publication-tools.mjs?v=0.15.40';
import {createDraftReview} from './native-draft-review.js?v=0.15.40';
import {setupMetadata,metadataLabels} from './native-metadata-query.js?v=0.15.40';
import {paintAuthorMarkers} from './native-corresponding-authors.js?v=0.15.40';
import {assist} from './native-assistance.js';
const form=document.querySelector('[data-editor-table="publications"]');
if(form){
 const sourceNames=['title','authors','venue','year','volume','issue','pages','doi','url','publication_type','keywords','corresponding_authors'];
 const styles=['gbt','elsevier','apa','ieee'],citations=new Map(),feedback=form.querySelector('[data-citation-feedback]');
 const get=name=>form.elements.namedItem(name),generateButton=form.querySelector('[data-generate-citations]');
 let pending=0,review=null,profileNames=JSON.parse(generateButton.dataset.profileNames||'[]');
 const source=()=>Object.fromEntries(new FormData(form));
 const authorPreview=document.createElement('div');authorPreview.className='paper-author-preview';authorPreview.setAttribute('aria-label','作者与通讯作者标记');authorPreview.setAttribute('aria-live','polite');get('authors').after(authorPreview);
 const paintAuthors=()=>paintAuthorMarkers(authorPreview,get('authors').value,get('corresponding_authors').value);paintAuthors();
 function protectionStatus(){return `${[...citations.values()].filter(state=>state.lock.checked).length} 项已保护；随字段变化只更新未保护项。`}
 function changed(){document.querySelector('[data-save-status]').textContent='有未保存的填写'}
 for(const name of Object.keys(generatePublicationCitations({}).fields)){
  const input=get(name);if(!input)continue;
  const label=document.createElement('label');label.className='native-citation-protection';
  const lock=document.createElement('input');lock.type='checkbox';lock.className='form-check-input';lock.checked=Boolean(input.value);
  lock.dataset.citationLock=name;lock.setAttribute('aria-label','保护'+input.closest('.native-field').querySelector('label').textContent.trim());
  lock.title='勾选后不随论文信息自动变化。显式更新可重新生成，并保留原值供撤销。';
  const text=document.createElement('span'),status=()=>{text.textContent=lock.checked?'🔒 已保护':'↻ 自动更新';label.dataset.uiState=lock.checked?'warning':'success'};
  label.append(lock,text);input.after(label);citations.set(name,{input,lock,setProtected(value){lock.checked=value;status()}});status();
  lock.addEventListener('change',()=>{status();feedback.textContent=protectionStatus()});
  input.addEventListener('input',()=>{if(name.startsWith('citation_'))form.querySelector('[data-highlight-feedback='+name.slice(9)+']').textContent='';lock.checked=true;status();review?.sourceChanged(name);feedback.textContent=protectionStatus();changed()});
 }
 // Keep action and label in the same accessible row without altering the shared field macro.
 styles.forEach(style=>{const host=form.querySelector(`[data-highlight-style="${style}"]`),field=get('highlight_'+style).closest('.native-field'),label=field.querySelector('label'),heading=document.createElement('div');heading.className='paper-field-heading';label.before(heading);heading.append(label,host.querySelector('[data-auto-highlight]'))});
 feedback.textContent=protectionStatus();
 function generate(){
  paintAuthors();
  clearTimeout(pending);pending=0;
  const result=generatePublicationCitations(source(),profileNames);
  for(const [name,value] of Object.entries(result.fields)){
   const state=citations.get(name);if(name.startsWith('citation_')||name==='bibtex'){if(state&&!state.lock.checked){state.input.value=value;review?.sourceChanged(name,false)}}
  }
  for(const style of styles){const name='highlight_'+style,state=citations.get(name);if(!state.lock.checked){state.input.value=highlightText(style);review?.sourceChanged(name,false)}}
  feedback.textContent=[protectionStatus(),...result.warnings].join(' ');return result;
 }
 review=createDraftReview({form,root:form.querySelector('[data-assistance-review]'),labels:metadataLabels,sourceNames,generate,citations});
 function setDraft(name,value,label){
  const state=citations.get(name),before=state.input.value,locked=state.lock.checked;
  if(before===value)return false;
  state.input.value=value;state.setProtected(true);review.remember(name,before,value,label,locked);changed();return true;
 }
 // Explicit refresh updates all five citation text formats; ordinary source edits still respect locks.
 generateButton.addEventListener('click',()=>{
  if(form.inert)return;clearTimeout(pending);pending=0;
  const result=generatePublicationCitations(source(),profileNames),names=styles.map(style=>'citation_'+style).concat('bibtex');
  form.querySelectorAll('[data-highlight-feedback]').forEach(node=>node.textContent='');
  let count=0;for(const name of names)if(setDraft(name,result.fields[name],'更新全部引用'))count++;
  let highlights=0;for(const style of styles){const state=citations.get('highlight_'+style);if(!state.lock.checked){const value=highlightText(style);if(value&&setDraft('highlight_'+style,value,'引用格式自动高亮'))highlights++}}
  feedback.textContent=`✓ 已更新 ${count} 种引用、${highlights} 项高亮；可逐项撤销，尚未保存。 `+result.warnings.join(' ');
 });
 function changeSource(name){paintAuthors();review.sourceChanged(name);changed();clearTimeout(pending);pending=setTimeout(()=>{if(!form.inert)generate()},350)}
 sourceNames.forEach(name=>{get(name)?.addEventListener('input',()=>changeSource(name));get(name)?.addEventListener('change',()=>changeSource(name))});
 // Only candidates explicitly selected by the user may change the draft, including exact DOI results.
 const lookup=setupMetadata(form.querySelector('[data-metadata-query]'),{form,onClear:()=>review.clear(),onSelect:(fields,provider,msg)=>{
  clearTimeout(pending);pending=0;review.show(fields,{host:form.querySelector('[data-doi-review-host]'),source:provider+' 元数据',feedback:msg,autoApply:true});changed();
 }});
 const cancelQuery=()=>lookup.cancel(),raw=get('source_citation'),parseFeedback=form.querySelector('[data-parse-feedback]'),format=form.querySelector('[data-citation-format]');
 const formats={gbt:'GB/T',apa:'APA',ieee:'IEEE',elsevier:'Elsevier',bibtex:'BibTeX',generic:'通用格式（需重点核对）'};
 raw.addEventListener('input',()=>{if(review.origin.startsWith('引用解析'))review.clear();format.textContent='';parseFeedback.textContent='原始引用已修改，请重新解析。'});
 form.querySelector('[data-parse-citation]').addEventListener('click',()=>{
  cancelQuery();review.clear();format.textContent='';
  if(!raw.value.trim()){parseFeedback.textContent='请先在上方粘贴原始引用。';return}
  if(raw.value.length>20000){parseFeedback.textContent='单次解析最多20000个字符；原文保留，可分段核对。';return}
  try{
   const result=parsePublicationCitation(raw.value),label=formats[result.format]||formats.generic;
   format.textContent=`识别格式：${label} · 规则匹配完整度：${Math.round(result.confidence*100)}%（不代表准确率）`;
   const count=review.show(result.fields,{host:form.querySelector('[data-citation-review-host]'),source:'引用解析 · '+label,feedback:parseFeedback});
   parseFeedback.textContent=(count?'已解析，请核对并勾选需要回填的字段。':'未识别出可用字段，可继续手动录入。')+' '+result.notes.join(' ');
  }catch{parseFeedback.textContent='该引文暂时无法解析，原文已保留，请手动录入。'}
 });
 function highlightText(style){
  const citation=get('citation_'+style).value;if(!citation.trim()||!profileNames.length)return '';
  const fields=source(),result=generatePublicationCitations(fields,profileNames),possibilities=new Set();
  // Reuse the original formatter for both author-list matches and known Chinese/English profile names.
  for(const value of [result.fields['highlight_'+style],...profileNames.map(name=>generatePublicationCitations({...fields,authors:name},[name]).fields['highlight_'+style])]){
   for(const name of value.split('；').filter(Boolean))possibilities.add(name);
  }
  const matches=[];
  for(const name of possibilities){
   const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+'),pattern=new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','giu');
   for(const match of citation.matchAll(pattern))matches.push({text:match[0],start:match.index,end:match.index+match[0].length});
  }
  // Prefer full names over overlapping short aliases, and keep the literal text found in this format.
  matches.sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.start-b.start);const selected=[];
  for(const item of matches)if(!selected.some(x=>x.start<item.end&&item.start<x.end))selected.push(item);
  return [...new Set(selected.sort((a,b)=>a.start-b.start).map(x=>x.text))].join('；');
 }
 const profileButton=form.querySelector('[data-extract-profile]'),profileFeedback=form.querySelector('[data-profile-feedback]');let profileRequest=null,profileSequence=0;
 function cancelProfile(){profileSequence++;profileRequest?.abort();profileRequest=null;profileButton.disabled=false}
 profileButton.addEventListener('click',async()=>{
  if(form.inert)return;cancelProfile();const sequence=profileSequence;profileRequest=new AbortController();profileButton.disabled=true;profileFeedback.textContent='正在读取首页精选教师…';
  const controller=profileRequest,timer=setTimeout(()=>controller.abort(),12000);
  try{
   const context=Object.fromEntries(['uid','nav','nav_stamp'].map(name=>[name,get('_'+name)?.value||'']));
   const result=await assist('publication-profile',context,{signal:profileRequest.signal});
   if(sequence!==profileSequence||form.inert)return;
   profileNames=result.names;generateButton.dataset.profileNames=JSON.stringify(profileNames);
   form.querySelector('#paper-profile-name').value=result.name;form.querySelector('#paper-profile-name-en').value=result.name_en;
   form.querySelectorAll('[data-highlight-feedback]').forEach(node=>node.textContent='');
   profileFeedback.textContent=!result.name?'没有公开、启用且首页精选的教师；当前高亮保留。':result.name_en?'已提取：'+result.name+' / '+result.name_en+'。英文来源：'+(result.english_source==='manual'?'教师资料':'当前有效译文')+'；点击对应格式的“自动高亮”即可生成。':'已提取：'+result.name+'；英文姓名缺失，请在教师资料中补充后重新提取。';
  }catch(error){if(sequence===profileSequence)profileFeedback.textContent=(error.name==='AbortError'?'读取超时，请重试。':error.message)+' 当前姓名及高亮保留。'}
  finally{clearTimeout(timer);if(sequence===profileSequence){profileRequest=null;profileButton.disabled=false}}
 });
 styles.forEach(style=>form.querySelector(`[data-auto-highlight="${style}"]`).addEventListener('click',()=>{
  if(form.inert)return;const target='highlight_'+style,msg=form.querySelector(`[data-highlight-feedback="${style}"]`),value=highlightText(style);
  if(!profileNames.length){msg.textContent='尚无首页精选教师，当前高亮保留。';return}
  if(!value){msg.textContent='未在本格式引用中匹配到教师姓名，当前高亮保留；请核对姓名写法或先更新引用。';return}
  const updated=setDraft(target,value,'本格式自动高亮');msg.textContent=updated?'✓ 已生成本项高亮，可撤销；尚未保存。':'本项高亮已匹配，无需修改。';
 }));
 // Capture runs before the shared save listener regardless of asynchronous module import order.
 form.addEventListener('submit',()=>{if(pending)generate();cancelQuery();cancelProfile()},true);
 window.addEventListener('pagehide',()=>{clearTimeout(pending);cancelQuery();cancelProfile()});
}
