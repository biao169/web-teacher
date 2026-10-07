/** Paper-only draft helpers: parsed suggestions share per-field history with selected metadata and citation updates. */
export function createDraftReview({form,root,labels,sourceNames,generate,citations}){
 const get=name=>form.elements.namedItem(name),panel=root.querySelector('[data-metadata-review]'),rows=root.querySelector('[data-metadata-rows]'),apply=root.querySelector('[data-metadata-apply]');
 let review=new Map(),history=new Map(),batch=null,message=null,origin='';
 function updateApply(){apply.disabled=![...review.values()].some(row=>row.check.checked&&!row.check.disabled)}
 function drawEntry(name){
  const entry=history.get(name);if(!entry)return;
  const current=get(name).value,changed=current!==entry.after;
  entry.button.disabled=changed;entry.button.title=changed?'此项之后已手工修改，原值保留在下方供核对':'只撤销此字段最近一次自动填入，不影响其他字段';
  entry.status.textContent=current===entry.before?'已恢复原值。':changed?'此项之后已手动修改；保留当前内容，可复制下方原值。':'来源：'+entry.source+' · 尚未保存';
 }
 function sourceChanged(name,changed=true){
  drawEntry(name);const row=review.get(name);if(!row)return;
  row.current.textContent=get(name).value||'（空）';row.check.disabled=get(name).value===row.value;
  if(changed||row.check.disabled)row.check.checked=false;
  row.state.textContent=row.check.disabled?'＝ 相同':changed?'✎ 当前值已修改，请重新勾选':'≠ 有差异';updateApply();
 }
 function clear(){panel.hidden=true;rows.replaceChildren();review.clear();origin='';updateApply()}
 function values(fields){
  return Object.entries(labels).flatMap(([name])=>{
   const value=fields[name],input=get(name);
   if(!input||!['string','number'].includes(typeof value)||!String(value).trim()||String(value).length>20000)return [];
   if(name==='url'&&!/^https?:\/\/[^\s<>]+$/iu.test(String(value)))return [];
   return [[name,String(value)]];
  });
 }
 function remember(name,before,after,source,beforeLock=null){
  if(before===after)return;
  const input=get(name),field=input.closest('.native-field');history.get(name)?.note.remove();
  const note=document.createElement('div'),heading=document.createElement('header'),caption=document.createElement('strong'),button=document.createElement('button'),original=document.createElement('pre'),status=document.createElement('p');
  note.className='paper-inline-change';note.dataset.fieldUndo=name;note.id='paper-previous-'+name;
  caption.textContent='原来的填写内容';original.textContent=before||'（原来为空）';original.dataset.previousValue=name;
  button.type='button';button.className='btn btn-outline-secondary btn-sm';button.textContent='↶ 撤销';button.dataset.metadataUndoField=name;button.setAttribute('aria-label','撤销'+(labels[name]||field.querySelector('label').textContent.trim()));
  heading.append(caption,button);note.append(heading,original,status);
  // Keep the note directly below the input, ahead of its normal help text and lock control.
  input.after(note);input.setAttribute('aria-describedby',[...new Set((input.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean).concat(note.id))].join(' '));
  history.set(name,{before,after,source,beforeLock,note,button,status});button.addEventListener('click',()=>undo(name));drawEntry(name);
 }
 function applyValues(selected,source,feedback){
  if(form.inert)return 0;
  batch={source:Object.fromEntries(sourceNames.map(name=>[name,get(name)?.value])),citations:new Map([...citations].map(([name,state])=>[name,state.input.value]))};
  let count=0;message=feedback;
  for(const [name,value] of selected){
   const before=get(name).value;if(before===value)continue;
   get(name).value=value;remember(name,before,value,source);sourceChanged(name,false);count++;
  }
  if(count){generate();batch.after=new Map([...citations].map(([name,state])=>[name,state.input.value]))}
  updateApply();feedback.textContent=count?`✓ 已填入 ${count} 项；原值和撤销按钮位于各输入框下方，尚未保存。`:'候选提供的字段与当前内容一致，没有改动。';return count;
 }
 function show(fields,{host,source,feedback,autoApply=false}){
  clear();origin=source;message=feedback;const entries=values(fields);
  if(autoApply){const protectedNames=entries.filter(([name,value])=>name==='corresponding_authors'&&get(name).value.trim()&&get(name).value!==value);const count=applyValues(entries.filter(item=>!protectedNames.includes(item)),source,feedback);if(protectedNames.length){show(Object.fromEntries(protectedNames),{host,source,feedback,autoApply:false});feedback.textContent+=' 已保留现有通讯作者；如需替换，请勾选下方差异。'}return count;}
  host.append(root);root.querySelector('[data-review-source]').textContent='建议来源：'+source;
  for(const [name,value] of entries){
   const line=document.createElement('div');line.className='native-metadata-row';line.dataset.metadataField=name;
   const heading=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.className='form-check-input';check.setAttribute('aria-label','回填'+labels[name]);check.checked=!get(name).value;
   heading.append(check,document.createTextNode(labels[name]));const state=document.createElement('small');heading.append(state);
   const current=document.createElement('div'),suggested=document.createElement('div');current.className=suggested.className='native-metadata-value';current.dataset.caption='当前值';suggested.dataset.caption='建议值';suggested.textContent=value;
   line.append(heading,current,suggested);rows.append(line);review.set(name,{check,current,state,value});check.addEventListener('change',updateApply);sourceChanged(name,false);
  }
  panel.hidden=!review.size;updateApply();return review.size;
 }
 function applySelected(){
  const selected=[...review].filter(([,row])=>row.check.checked&&!row.check.disabled).map(([name,row])=>[name,row.value]);
  if(selected.length)applyValues(selected,origin,message);
 }
 function undo(name){
  if(form.inert)return;const entry=history.get(name);if(!entry||get(name).value!==entry.after)return;
  const derivedBefore=new Map([...citations].map(([key,state])=>[key,state.input.value]));
  get(name).value=entry.before;
  if(sourceNames.includes(name)){
   generate();
   if(batch?.after&&sourceNames.every(key=>get(key)?.value===batch.source[key])){
    for(const [key,value] of batch.citations){const state=citations.get(key);if(!state.lock.checked&&derivedBefore.get(key)===batch.after.get(key))state.input.value=value}
   }
  }else if(citations.has(name)&&entry.beforeLock!==null){citations.get(name).setProtected(entry.beforeLock)}
  const noteId=entry.note.id;entry.note.remove();history.delete(name);
  get(name).setAttribute('aria-describedby',(get(name).getAttribute('aria-describedby')||'').split(/\s+/).filter(x=>x&&x!==noteId).join(' '));
  sourceChanged(name);if(message)message.textContent='↶ 已撤销此项，其余填写保持；尚未保存。';
 }
 root.querySelector('[data-metadata-dismiss]').addEventListener('click',clear);apply.addEventListener('click',applySelected);
 return {show,clear,sourceChanged,remember,get origin(){return origin}};
}
