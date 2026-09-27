/** Shared, bounded history suggestions for all registered fields and the read-only dictionary page. */
import {assist} from './native-assistance.js';
import {historyFragment,replaceHistoryFragment} from './history-values.mjs?v=0.15.25';
const form=document.querySelector('#native-editor');
if(form?.querySelector('[data-history-field]')){
 const popup=document.createElement('div');popup.id='native-history-popup';popup.className='native-history-popup';popup.hidden=true;
 const status=document.createElement('p');status.setAttribute('role','status');status.className='native-muted';
 const list=document.createElement('div');list.setAttribute('role','listbox');list.setAttribute('aria-label','历史建议');
 const retry=document.createElement('button');retry.type='button';retry.className='btn btn-outline-secondary btn-sm';retry.textContent='↻ 重试';retry.hidden=true;
 popup.append(status,list,retry);document.body.append(popup);
 let active=null,controller=null,timer=0,sequence=0,composing=false,picking=false;
 function close(){
  clearTimeout(timer);controller?.abort();sequence++;popup.hidden=true;list.replaceChildren();active?.input.setAttribute('aria-expanded','false');
 }
 function position(){
  if(!active)return;
  const rect=active.input.getBoundingClientRect(),footer=document.querySelector('.workspace-footer')?.getBoundingClientRect();
  const bottom=Math.min(innerHeight-8,footer?.top??innerHeight-8);popup.style.width=Math.min(Math.max(rect.width,260),innerWidth-16)+'px';
  popup.style.left=Math.max(8,Math.min(rect.left,innerWidth-popup.offsetWidth-8))+'px';
  popup.style.top=Math.max(8,Math.min(rect.bottom+4,bottom-popup.offsetHeight))+'px';
 }
 function fragment(){return historyFragment(active.input.value,active.input.selectionStart,active.multiple)}
 function pick(value,snapshot){
  if(!active||form.inert||snapshot.signature!==fragment().signature)return;
  const next=replaceHistoryFragment(active.input.value,snapshot,value);picking=true;close();
  active.input.focus();active.input.value=next.value;
  if(active.input.type!=='number')active.input.setSelectionRange(next.caret,next.caret);
  // Native input listeners still update citations, category previews and other dependent draft state.
  active.input.dispatchEvent(new Event('input',{bubbles:true}));active.input.dispatchEvent(new Event('change',{bubbles:true}));picking=false;
 }
 async function query(){
  close();if(!active||composing||form.inert||picking)return;
  const owner=active,snapshot=fragment(),ticket=sequence;
  if(snapshot.query.length>240)return;
  controller=new AbortController();status.textContent='正在读取历史建议…';retry.hidden=true;popup.hidden=false;owner.input.setAttribute('aria-expanded','true');position();
  try{
   const result=await assist('suggestions',{table:form.dataset.editorTable,field:owner.field,query:snapshot.query,exclude:snapshot.exclude,nav:form.elements.namedItem('_nav').value,nav_stamp:form.elements.namedItem('_nav_stamp').value},{signal:controller.signal});
   if(ticket!==sequence||active!==owner||form.inert||fragment().signature!==snapshot.signature)return;
   list.replaceChildren();status.textContent=result.values.length?`${result.values.length} 项历史写法 · ↑↓选择，Enter填入，Esc关闭`:'暂无匹配写法，可继续手动输入。';
   for(const value of result.values){
    const option=document.createElement('button');option.type='button';option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.tabIndex=-1;option.textContent=value;option.title='填入当前片段：'+value;
    option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>pick(value,snapshot));list.append(option);
   }
   position();
  }catch(error){if(ticket===sequence&&error.name!=='AbortError'){status.textContent=error.message+' 可继续手动输入。';retry.hidden=false;position()}}
 }
 function schedule(){close();if(!composing&&!picking&&!form.inert)timer=setTimeout(query,250)}
 function focusOption(delta){
  const options=[...list.children];if(!options.length)return;
  const previous=options.indexOf(document.activeElement),index=(previous+delta+options.length)%options.length;
  options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===index)));options[index].focus();
 }
 form.querySelectorAll('[data-history-field]').forEach(wrapper=>{
  const input=wrapper.querySelector('input,textarea,select');if(!input||input.tagName==='SELECT')return;
  const entry={input,field:wrapper.dataset.historyField,multiple:wrapper.dataset.historyMultiple==='true'};
  input.setAttribute('aria-controls',popup.id);input.setAttribute('aria-haspopup','listbox');input.setAttribute('aria-expanded','false');input.autocomplete='off';
  input.addEventListener('focus',()=>{active=entry;if(!picking)schedule()});
  input.addEventListener('click',()=>{active=entry;if(!picking)schedule()});
  input.addEventListener('input',()=>{active=entry;if(!picking)schedule()});
  input.addEventListener('compositionstart',()=>{composing=true;close()});input.addEventListener('compositionend',()=>{composing=false;schedule()});
  input.addEventListener('keydown',event=>{
   if(event.isComposing)return;
   if(event.key==='Escape'){close();event.stopPropagation()}
   else if(event.key==='ArrowDown'&&!popup.hidden){event.preventDefault();focusOption(1)}
  });
  input.addEventListener('keyup',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key))schedule()});
 });
 list.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();focusOption(event.key==='ArrowDown'?1:-1)}
  if(event.key==='Escape'){event.preventDefault();picking=true;active.input.focus();close();picking=false}
 });
 retry.addEventListener('click',query);
 document.addEventListener('focusin',event=>{if(active&&event.target!==active.input&&!popup.contains(event.target))close()});
 document.addEventListener('pointerdown',event=>{if(active&&event.target!==active.input&&!popup.contains(event.target))close()});
 // Keep the popup attached when focus scrolls a field into view; close only after it leaves the viewport.
 document.addEventListener('scroll',event=>{if(active&&!popup.contains(event.target)){const rect=active.input.getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight)close();else if(!popup.hidden)position()}},true);
 window.addEventListener('resize',close);window.addEventListener('pagehide',close);form.addEventListener('submit',close);
}

const explorer=document.querySelector('#history-explorer');
if(explorer){
 const catalog=JSON.parse(explorer.dataset.historyCatalog),module=explorer.elements.namedItem('table'),field=explorer.elements.namedItem('field'),query=explorer.elements.namedItem('query');
 const feedback=document.querySelector('[data-history-feedback]'),values=document.querySelector('[data-history-values]');
 let controller=null,sequence=0;
 function cancel(){controller?.abort();sequence++;values.replaceChildren()}
 function fields(){cancel();field.replaceChildren();catalog[module.value].fields.forEach(item=>field.add(new Option(item.label,item.name)));feedback.textContent='选择字段后查询；留空关键词可查看最近的写法。'}
 async function search(){
  cancel();const ticket=sequence;controller=new AbortController();feedback.textContent='正在查询…';
  try{
   const result=await assist('suggestions',{table:module.value,field:field.value,query:query.value},{signal:controller.signal,csrf:explorer.dataset.csrf});
   if(ticket!==sequence)return;
   feedback.textContent=`显示 ${result.values.length} 项；来源为最近至多 ${result.row_limit} 条匹配记录。点击候选可复制。`;
   for(const value of result.values){const button=document.createElement('button');button.type='button';button.className='btn btn-outline-secondary btn-sm';button.textContent=value;button.title='复制：'+value;
    button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(value);feedback.textContent='✓ 已复制：'+value}catch{feedback.textContent='浏览器未允许复制，请选中文字手动复制。'}});values.append(button)}
  }catch(error){if(ticket===sequence&&error.name!=='AbortError')feedback.textContent=error.message+' 可再次查询。'}
 }
 fields();module.addEventListener('change',fields);field.addEventListener('change',()=>{cancel();feedback.textContent='字段已切换，请查询。'});query.addEventListener('input',()=>{cancel();feedback.textContent='关键词已修改，请查询。'});
 explorer.addEventListener('submit',event=>{event.preventDefault();search()});window.addEventListener('pagehide',cancel);
}
