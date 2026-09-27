/** Shared provider configuration, explicit tests and finite single-entry translation feedback. */
import {assist} from './native-assistance.js';
const form=document.querySelector('#native-editor');
const item=name=>form?.elements.namedItem(name);
const value=name=>item(name)?.value??'';
let testing=false;
/** Read only this service family's fields; never serialize the complete settings or content form. */
function serviceDraft(family){
 const prefix=family==='translation'?'translation':'publication_metadata';
 const fields=family==='translation'?['translation_provider','translation_timeout_seconds','libretranslate_url','microsoft_translator_region','microsoft_translator_endpoint','mymemory_email','_secret_google_translate_api_key','_secret_deepl_api_key','_secret_microsoft_translator_key','_secret_libretranslate_api_key']:['publication_metadata_provider','publication_suggestion_cache_seconds'];
 const values=Object.fromEntries(fields.filter(n=>item(n)).map(n=>[n,value(n)]));
 const rows=[...document.querySelectorAll(`[data-service-family="${family}"] [data-service-row]`)];
 const enabled=rows.map((row,index)=>({key:row.dataset.serviceRow,index,order:Number(value(`_${family}_order_${row.dataset.serviceRow}`)),checked:item(`_${family}_enabled_${row.dataset.serviceRow}`).checked})).filter(row=>row.checked).sort((a,b)=>a.order-b.order||a.index-b.index);
 values[`${prefix}_providers`]=JSON.stringify(enabled.map(row=>row.key));return values;
}
for(const group of document.querySelectorAll('[data-service-family]')){
 const family=group.dataset.serviceFamily;let revision=0;
 /** Mark results stale after edits; a late request can never certify newer credentials or parameters. */
 const changed=()=>{revision++;group.querySelector('[data-service-summary]').textContent='当前显示为配置草稿；统一保存后生效。';for(const status of group.querySelectorAll('[data-service-result]'))status.textContent='配置已变化，请重新测试';};
 form.addEventListener('input',e=>{if(group.contains(e.target)||e.target.name?.includes(family==='metadata'?'publication_':'translation')||family==='translation'&&(/mymemory|deepl|google_translate|microsoft_/.test(e.target.name)))changed();});
 group.querySelector('[data-service-recommend]').addEventListener('click',()=>{
  const names=JSON.parse(group.dataset.recommended);const field=family==='translation'?'translation_provider':'publication_metadata_provider';
  item(field).value=names[0];item(field).dispatchEvent(new Event('change',{bubbles:true}));
  for(const row of group.querySelectorAll('[data-service-row]')){const key=row.dataset.serviceRow;item(`_${family}_enabled_${key}`).checked=names.includes(key);item(`_${family}_order_${key}`).value=names.includes(key)?names.indexOf(key)+1:group.querySelectorAll('[data-service-row]').length;}
  changed();group.querySelector('[data-service-summary]').textContent='✓ 推荐值已填入草稿；密钥和自定义地址保留，保存后生效。';
 });
 for(const button of group.querySelectorAll('[data-service-test]'))button.addEventListener('click',async()=>{
  if(testing)return;
  const status=button.closest('[data-service-row]').querySelector('[data-service-result]');
  if(!item(`_${family}_enabled_${button.dataset.serviceTest}`).checked){status.textContent='请先勾选此服务，再测试。';return;}
  const current=revision;testing=true;const buttons=[...document.querySelectorAll('[data-service-test]')];buttons.forEach(b=>b.disabled=true);status.textContent='正在测试固定短样例…';
  try{const result=await assist('services/test',{family,provider:button.dataset.serviceTest,uid:value('_uid'),stamp:value('_stamp'),values:serviceDraft(family)});if(current===revision)status.textContent=result.attempts.map(a=>`${a.label}：${a.message}`).join('；')+'（测试未保存设置）';}
  catch(error){if(current===revision)status.textContent=error.message;}
  finally{testing=false;buttons.forEach(b=>b.disabled=false);}
 });
}
const translationFeedback=document.querySelector('[data-translation-feedback]');
/** Compare saved form values, excluding action buttons; changing only the operation's provider is safe. */
const fingerprint=()=>JSON.stringify(form?[...new FormData(form)]:[]);
let original=fingerprint();
if(form?.dataset.editorTable==='translation_cache'){
 // Module downloads may finish after typing; compare against server-rendered defaults, not late input.
 const saved=form.cloneNode(true);saved.reset();original=JSON.stringify([...new FormData(saved)]);
}
document.querySelector('[data-queue-translation]')?.addEventListener('click',async e=>{
 const button=e.currentTarget;if(fingerprint()!==original){translationFeedback.textContent='请先保存当前修改，再从已保存原文建立翻译。';return;}
 button.disabled=true;translationFeedback.textContent='正在建立翻译条目…';
 try{const result=await assist('translation',{table:form.dataset.editorTable,uid:value('_uid'),field:button.dataset.queueTranslation});location.assign('/admin/translation_cache/'+result.uid+'/edit');}
 catch(error){translationFeedback.textContent=error.message;button.disabled=false;}
});
/** Translate and invalidate share the same dirty-form, version and editor locking contract. */
document.querySelectorAll('[data-run-translation],[data-invalidate-translation]').forEach(actionButton=>actionButton.addEventListener('click',async e=>{
 const button=e.currentTarget;if(fingerprint()!==original){translationFeedback.textContent='当前有未保存修改，请先保存；手工译文不会被自动覆盖。';return;}
 let updated=false;const invalidating=button.hasAttribute('data-invalidate-translation');const provider=document.querySelector('[data-translation-provider]');
 const actions=[...document.querySelectorAll('[data-run-translation],[data-invalidate-translation]')].filter(b=>!b.disabled);actions.forEach(b=>b.disabled=true);provider.disabled=true;
 // Lock editable values during the committed operation, leaving them readable and restoring on all outcomes.
 const controls=[...form.querySelectorAll('input:not([type=hidden]),textarea,select')].filter(c=>c!==provider&&!c.disabled);
 controls.forEach(c=>c.disabled=true);const saveButtons=[...document.querySelectorAll('button[form="native-editor"]')];saveButtons.forEach(b=>b.disabled=true);
 translationFeedback.textContent=invalidating?'正在停用；保留译文正文…':'正在翻译此条已保存原文，请等待完整结果…';
 try{const result=await assist(invalidating?'translation-invalidate':'translate',{uid:value('_uid'),stamp:value('_stamp'),...(invalidating?{}:{provider:provider.value})});item('_stamp').value=result.updated_at;updated=true;
  if(invalidating){location.reload();return;}
  translationFeedback.textContent=result.reused?'已复用有效译文，未调用翻译服务。':result.attempts.map(a=>`${a.label}：${a.message}`).join('；');
  if(result.status==='success')location.reload();
  else{document.querySelector('[data-translation-record]').textContent='本次未完成；已保留原文和已有译文，可重试或人工填写。';}
 }catch(error){translationFeedback.textContent=error.message;}
 finally{actions.forEach(b=>b.disabled=false);provider.disabled=false;controls.forEach(c=>c.disabled=false);saveButtons.forEach(b=>b.disabled=false);if(updated)original=fingerprint();}
}));
