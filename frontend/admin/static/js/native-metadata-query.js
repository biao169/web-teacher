/** One query widget for paper drafts and read-only lookup. Results are text nodes, never trusted HTML. */
import {assist} from './native-assistance.js';
export const metadataLabels={title:'论文题名',authors:'作者',venue:'期刊／会议',year:'年份',volume:'卷',issue:'期',pages:'页码',doi:'DOI',url:'链接',publication_type:'论文类型',keywords:'关键词',corresponding_authors:'通讯作者'};
export function setupMetadata(root,{form=null,onSelect=()=>{},onClear=()=>{}}={}){
 const query=root.querySelector('#metadata-doi'),kind=root.querySelector('#metadata-kind'),provider=root.querySelector('#metadata-provider'),button=root.querySelector('#metadata-fetch'),cancel=root.querySelector('[data-metadata-cancel]'),feedback=root.querySelector('#metadata-feedback'),results=root.querySelector('[data-metadata-candidates]'),attempts=root.querySelector('[data-metadata-attempts]');
 let revision=0,controller=null,timer=null;
 function stop(){revision++;controller?.abort();controller=null;clearTimeout(timer);button.disabled=false;cancel.hidden=true}
 function clear(){results.replaceChildren();attempts.replaceChildren();onClear()}
 function changed(){stop();clear();feedback.textContent='查询条件已修改，请重新查询；表单内容保持不变。'}
 query.addEventListener('input',changed);kind.addEventListener('change',changed);provider.addEventListener('change',changed);root.querySelector('[data-correspondence]')?.addEventListener('change',changed);
 query.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();e.stopPropagation();button.click()}});
 cancel.addEventListener('click',()=>{stop();feedback.textContent='已取消等待，当前表单保持不变。'});
 function select(candidate,control){
  results.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===control)));
  onSelect(candidate.fields,candidate.provider,feedback);
 }
 function show(result){
  const rows=Array.isArray(result.candidates)?result.candidates.slice(0,5):[];
  for(const a of (result.attempts||[]).slice(0,11)){
   const li=document.createElement('li');li.dataset.uiState=a.status==='success'?'success':'warning';li.textContent=a.label+'：'+a.message+(a.cached?'（缓存）':'');attempts.append(li);
  }
  rows.forEach((row,index)=>{
   const article=document.createElement('article'),heading=document.createElement('strong'),summary=document.createElement('p'),action=document.createElement('button');article.className='native-metadata-candidate';
   heading.textContent=(index+1)+'. '+(row.fields.title||'无题名');heading.title=row.fields.title||'';
   summary.textContent=[row.fields.authors,row.fields.venue,row.fields.year,row.fields.doi,row.fields.corresponding_authors?'通讯作者：'+row.fields.corresponding_authors+(row.correspondence_provider?'（OpenAlex补查）':''):'通讯作者未提供'].filter(Boolean).join(' · ');summary.title=summary.textContent;
   action.type='button';action.className='btn btn-outline-primary btn-sm';action.textContent=form?.hasAttribute('data-inline-metadata')?'填入这篇':form?'核对这篇':'查看字段';action.setAttribute('aria-label',(form?'核对候选':'查看候选')+(index+1));action.setAttribute('aria-pressed','false');action.addEventListener('click',()=>select(row,action));article.append(heading,summary,action);results.append(article);
  });
  feedback.textContent=rows.length?'找到 '+rows.length+' 个候选，请核对题名、作者与DOI。':'没有可用候选，请查看服务状态、修改关键词或更换服务重试。';
  // A unique DOI match can open its comparison directly; title searches always require choosing a candidate.
  if(rows.length===1&&result.kind==='doi'&&!form?.hasAttribute('data-inline-metadata'))select(rows[0],results.querySelector('button'));
 }
 button.addEventListener('click',async()=>{
  if(!query.value.trim()){feedback.textContent='请先输入DOI或题名。';query.focus();return}
  stop();clear();const seq=revision;controller=new AbortController();button.disabled=true;cancel.hidden=false;feedback.textContent='正在查询，请稍候…';
  timer=setTimeout(()=>{if(seq!==revision)return;stop();feedback.textContent='等待超过25秒，已停止等待；请稍后重试，表单保持不变。'},25000);
  try{
   const field=name=>form?.elements.namedItem(name)?.value||'';
   const result=await assist('metadata',{query:query.value,kind:kind.value,provider:provider.value,uid:field('_uid'),nav:field('_nav'),nav_stamp:field('_nav_stamp'),read_only:!form,correspondence:!!root.querySelector('[data-correspondence]')?.checked},{signal:controller.signal,csrf:root.dataset.csrf});
   if(seq!==revision||form?.inert)return;show(result);
  }catch(error){if(seq===revision&&error.name!=='AbortError')feedback.textContent=error.message}
  finally{if(seq===revision){clearTimeout(timer);button.disabled=false;cancel.hidden=true;controller=null}}
 });
 window.addEventListener('pagehide',stop);return {cancel:stop};
}
const standalone=document.querySelector('[data-metadata-standalone]');
if(standalone){
 const details=standalone.querySelector('[data-metadata-details]');
 setupMetadata(standalone.querySelector('[data-metadata-query]'),{onClear:()=>{details.hidden=true;details.replaceChildren()},onSelect:fields=>{
  details.replaceChildren();for(const [name,label] of Object.entries(metadataLabels)){if(!fields[name])continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(fields[name]);details.append(dt,dd)}details.hidden=false;
 }});
}
