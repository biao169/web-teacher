import {adminFetch} from './native-access.js?v=0.15.28';
/** Shared media chooser: bounded pages, isolated draft selection and explicit upload/confirmation. */
import {previewURL,showLinkPreview,suggestedType,imageFile,lookupMedia} from './native-media-links.js?v=0.15.33';
import {watchMediaPreview,clearMediaPreviews} from './native-media.js?v=0.15.113';
import {editImage} from './native-media-crop.js';
const dialog=document.querySelector('[data-media-picker]');
let active=null,serial=0;
const el=name=>dialog.querySelector(`[data-picker-${name}]`);
const text=(tag,value,className='')=>{const node=document.createElement(tag);node.textContent=value;node.className=className;return node};
export function mediaContext(form,field){
 // Only the existing content identifiers and navigation version accompany requests.
 const value=name=>form.elements.namedItem(name)?.value||'';
 return {module:form.dataset.editorTable,field,uid:value('_uid'),nav:value('_nav'),nav_stamp:value('_nav_stamp')};
}
async function responseJSON(response){const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'请求未完成，请刷新媒体列表后重试');return data}
function feedback(message,state='info'){el('feedback').textContent=message;el('feedback').dataset.uiState=state}
function localCleanup(s){s.urls.forEach(url=>URL.revokeObjectURL(url));s.urls=[]}
function finish(value=null){
 clearMediaPreviews(dialog);
 const s=active;if(!s)return;active=null;s.query?.abort();s.operation?.abort();clearTimeout(s.timer);localCleanup(s);dialog.close();s.resolve(value);s.focus?.focus();
}
function busy(s,value){s.busy=value;if(value){s.epoch++;s.query?.abort();el('grid').removeAttribute('aria-busy')}for(const name of ['q','category','kind','size','link-url','link-type','link-check','link-register'])el(name).disabled=value;el('confirm').disabled=value||!s.selected.size;el('upload').disabled=value||!s.options?.can_upload||!s.files.length;el('file').disabled=value;el('stop').hidden=!value||!s.uploading;cropControls(s)}
function cropControls(s){
 const can=s.options?.can_upload&&s.options.extensions.some(e=>['png','jpg','jpeg'].includes(e));
 el('edit').hidden=!(s.selected.size===1&&[...s.selected.values()][0].mime_type.startsWith('image/'));el('edit').disabled=s.busy||!can;
 el('edit-local').hidden=!(s.files.length===1&&s.files[0].type.startsWith('image/'));el('edit-local').disabled=s.busy||!can;
}
function selection(s){
 el('selected').textContent=s.selected.size?`已选 ${s.selected.size} 项：`+[...s.selected.values()].map(r=>r.title||r.object_key).join('、'):'尚未选择；取消可保留原值';
 dialog.querySelectorAll('[data-picker-asset]').forEach(button=>{const selected=s.selected.has(button.dataset.pickerAsset);button.setAttribute('aria-pressed',String(selected));button.classList.toggle('is-selected',selected)});
 el('confirm').disabled=s.busy||!s.selected.size;
 if(s.selected.size===1&&!s.captionEdited)el('caption').value=[...s.selected.values()][0].title||'';
 cropControls(s);
}
function addSelected(s,row){
 if(!s.multiple)s.selected.clear();
 if(s.selected.has(row.uid))s.selected.delete(row.uid);
 else if(s.selected.size<s.maximum)s.selected.set(row.uid,row);else feedback(`最多选择 ${s.maximum} 个文件`,'warning');
 selection(s);
}
function drawRows(s,rows){
 clearMediaPreviews(el('grid'));
 const cards=rows.map(row=>{
  const card=text('article','','media-picker-card'),button=text('button','','media-picker-pick');button.type='button';button.dataset.pickerAsset=row.uid;button.title='选择 '+(row.title||row.object_key);button.setAttribute('aria-label',button.title);
  const preview=text('span','','media-picker-thumb');
  if(row.mime_type.startsWith('image/')){const image=document.createElement('img');image.src=previewURL(row);image.referrerPolicy='no-referrer';image.alt=row.title||'媒体图片';image.loading='lazy';image.decoding='async';preview.append(image)}
  else preview.append(text('span',row.mime_type==='application/pdf'?'▤ PDF':row.mime_type.startsWith('video/')?'▶ 视频':'▧ 文件'));
  const title=text('strong',row.title||row.object_key,'native-cell');title.title=row.title||row.object_key;
  button.append(preview,title,text('small',(row.storage_kind==='external'?'↗ 外部链接 · 大小未核验':(row.size/1024).toFixed(1)+' KiB')+' · '+(row.category||'未分类')));button.addEventListener('click',()=>{if(active===s&&!s.busy)addSelected(s,row)});
  const link=text('a','↗ 完整预览','media-picker-detail');link.href='/admin/media/'+encodeURIComponent(row.uid)+'/inspect';link.target='_blank';link.rel='noopener';link.title='新标签页预览文件及使用位置';card.append(button,link);const image=preview.querySelector('img');if(image)watchMediaPreview(image,{host:card});return card;
 });
 el('grid').replaceChildren(...(cards.length?cards:[text('p','没有符合条件的媒体，可调整筛选或本地上传。','native-muted')]));selection(s);
}
function drawPages(s,result){
 el('page-info').textContent=`第 ${result.page} / ${result.pages} 页 · 本页 ${result.rows.length} 项 · 共 ${result.total} 项`;
 const list=el('pages');list.replaceChildren();const pageItem=(p,label,disabled=false,current=false)=>{
  const li=text('li','','page-item'+(current?' active':'')),button=text('button',label,'page-link');button.type='button';button.disabled=disabled;button.title='第 '+p+' 页';button.setAttribute('aria-label',button.title);if(current)button.setAttribute('aria-current','page');button.addEventListener('click',()=>{if(!s.busy)search(s,p)});li.append(button);list.append(li);
 };
 pageItem(Math.max(1,result.page-1),'‹',result.page===1);let last=0;
 const pages=result.pages<=9?Array.from({length:result.pages},(_,i)=>i+1):[1,...Array.from({length:5},(_,i)=>result.page-2+i).filter(p=>p>1&&p<result.pages),result.pages];
 for(const p of [...new Set(pages)]){if(last&&p>last+1)pageItem(Math.min(p-1,last+5),'…');pageItem(p,String(p),false,p===result.page);last=p}pageItem(Math.min(result.pages,result.page+1),'›',result.page===result.pages);
}
async function search(s,page=1){
 if(active!==s)return;s.query?.abort();s.query=new AbortController();const epoch=++s.epoch;feedback('正在查询媒体…');el('grid').setAttribute('aria-busy','true');clearMediaPreviews(el('grid'));el('grid').replaceChildren();
 try{
  const params=new URLSearchParams({...s.context,q:el('q').value,category:el('category').value,kind:el('kind').value,page,size:el('size').value});
  const result=await responseJSON(await adminFetch('/api/admin/media-picker/items/list?'+params,{headers:{Accept:'application/json'},signal:s.query.signal}));
  if(active!==s||epoch!==s.epoch)return;s.options=result.options;s.page=result.page;
  const types=el('link-type'),oldType=types.value;types.replaceChildren(new Option('请选择外链类型',''),...s.options.types.map(value=>new Option(s.options.type_labels[value]||value,value)));types.value=oldType;
  const datalist=dialog.querySelector('#picker-categories');datalist.replaceChildren(...s.options.categories.map(value=>{const option=document.createElement('option');option.value=value;return option}));
  el('file').accept=s.options.extensions.map(ext=>'.'+ext).join(',');el('upload-help').textContent=`允许：${s.options.extensions.join('、')||'当前没有可上传类型'}；每个文件不超过 ${(s.options.max_bytes/1048576).toFixed(0)} MiB。`;
  dialog.querySelector('[data-picker-tab=upload]').disabled=!s.options.can_upload;busy(s,s.busy);drawRows(s,result.rows);drawPages(s,result);feedback('选择文件后点击“使用所选媒体”；当前内容尚未保存。');
  if(s.startTab==='upload'&&!s.options.can_upload){tab('library');feedback('当前权限、上传设置或固定范围不允许上传；可选择已有媒体。','warning')}s.startTab='library';
  if(s.editCurrent){
   s.editCurrent=false;const row=await responseJSON(await lookupMedia(s.currentKey,dialog.dataset.csrf,s.query.signal));
   if(active!==s||epoch!==s.epoch)return;addSelected(s,row);editSelected(s);
  }
 }catch(error){if(active===s&&epoch===s.epoch&&error.name!=='AbortError'){feedback(error.message,'error');el('grid').replaceChildren(text('p','查询未完成，点击搜索可重试。'))}}
 finally{if(active===s&&epoch===s.epoch)el('grid').removeAttribute('aria-busy')}
}
function tab(name){dialog.querySelectorAll('[data-picker-panel]').forEach(panel=>panel.hidden=panel.dataset.pickerPanel!==name);dialog.querySelectorAll('[data-picker-tab]').forEach(button=>{const current=button.dataset.pickerTab===name;button.setAttribute('aria-pressed',String(current));button.className='btn btn-sm '+(current?'btn-primary':'btn-outline-primary')})}
function filesChanged(s,files){
 localCleanup(s);s.files=[...files];s.cropped=false;s.cropSource=null;s.replacing=null;el('local-preview').replaceChildren();el('title').value=s.files.length===1?s.files[0].name.slice(0,200):'';el('title').disabled=s.files.length>1;
 el('file-list').replaceChildren(...s.files.map(file=>text('li',file.name+' · '+(file.size/1024).toFixed(1)+' KiB')));
 if(s.files.length===1&&s.files[0].type.startsWith('image/')){const image=document.createElement('img');const url=URL.createObjectURL(s.files[0]);s.urls.push(url);image.src=url;image.alt='本地待上传图片';el('local-preview').append(image)}
 busy(s,s.busy);
}
/** Crop generation only changes the upload draft; the old selection survives until upload succeeds. */
async function editSelected(s,local=false){
 if(active!==s||s.busy)return;
 if(!s.options?.can_upload){feedback('当前权限或导航范围不允许新增媒体，可继续选择已有文件。','warning');return}
 const row=!local&&s.selected.size===1?[...s.selected.values()][0]:null;if(!local&&!row)return;
 let file=local?s.files[0]:null;const source=local?s.cropSource:{source_uid:row.uid,source_stamp:row.updated_at},replacing=local?s.replacing:row.uid;
 const title=local?el('title').value:(row.title||''),category=local?el('upload-category').value:(row.category||'');s.operation=new AbortController();busy(s,true);clearTimeout(s.timer);
 try{
  if(!local){
   await responseJSON(await adminFetch('/api/admin/media-picker/items/select',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':dialog.dataset.csrf},body:JSON.stringify({...s.context,media_uid:row.uid,stamp:row.updated_at}),signal:s.operation.signal}));
   if(row.size>20*1048576)throw Error('原图文件不能超过20 MiB');
   file=await imageFile(row,s.operation.signal);
  }
  if(active!==s)return;
  const result=await editImage({file,extensions:s.options.extensions,maxBytes:s.options.max_bytes});if(active!==s||!result)return;
  filesChanged(s,[result]);s.cropped=true;s.cropSource=source;s.replacing=replacing;el('title').value=(title?title+' · 裁剪':result.name).slice(0,200);el('upload-category').value=category;tab('upload');feedback('裁剪图片已生成，请上传到媒体库；原内容和原图片尚未改变。','success');
 }catch(error){if(active===s&&error.name!=='AbortError')feedback(error.message,'error')}
 finally{if(active===s)busy(s,false)}
}
export function chooseMedia({context,currentKey='',multiple=false,files=[],editCurrent=false,startTab='library'}){
 if(!dialog)return Promise.reject(Error('媒体选择器不可用，请刷新页面'));
 if(active)return Promise.reject(Error('请先完成当前媒体选择'));
 return new Promise(resolve=>{
  const s=active={id:++serial,resolve,context,currentKey,editCurrent,startTab,multiple,maximum:multiple?10:1,selected:new Map(),files:[],urls:[],epoch:0,page:1,busy:false,captionEdited:false,focus:document.activeElement};
  el('q').value=editCurrent&&!/^https?:/.test(currentKey)&&currentKey.length<=120?currentKey:'';el('link-url').value='';el('link-type').value='';el('link-preview').replaceChildren();el('category').value='';el('kind').value='';el('size').value='10';el('file').value='';el('file').multiple=multiple;el('caption').value='';el('upload-category').value='';el('page-info').textContent='';el('pages').replaceChildren();
  el('caption-label').hidden=!context.field.startsWith('body_')||multiple;selection(s);filesChanged(s,files);tab(files.length||startTab==='upload'?'upload':'library');dialog.showModal();(startTab==='upload'?el('file'):el('q')).focus();search(s);
 });
}
async function resolveLink(s,register=false){
 // Preview is read-only; only the labelled register action creates a library entry.
 if(active!==s||s.busy)return;s.operation=new AbortController();busy(s,true);clearTimeout(s.timer);el('link-preview').replaceChildren();
 try{
  const row=await responseJSON(await adminFetch('/api/admin/media-picker/links/'+(register?'register':'resolve'),{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':dialog.dataset.csrf},body:JSON.stringify({...s.context,url:el('link-url').value,mime_type:el('link-type').value}),signal:s.operation.signal}));
  if(active!==s)return;
  showLinkPreview(el('link-preview'),row);
  if(register){addSelected(s,row);feedback('✓ 媒体已登记或复用，请确认使用；取消不会删除登记。','success')}
  else feedback(row.storage_kind==='external'?'链接格式有效；类型由您声明、远程大小未核验，此预览未保存。':'本站媒体已找到；确认后选择，不重复登记。');
 }catch(error){if(active===s&&error.name!=='AbortError')feedback(error.message+'；原选择和内容保持不变。','error')}
 finally{if(active===s)busy(s,false)}
}
if(dialog){
 el('link-url').addEventListener('input',()=>{const value=suggestedType(el('link-url').value);el('link-type').value=value;el('link-preview').replaceChildren()});
 el('link-check').addEventListener('click',()=>{if(active)resolveLink(active)});el('link-register').addEventListener('click',()=>{if(active)resolveLink(active,true)});
 dialog.querySelectorAll('[data-picker-close]').forEach(button=>button.addEventListener('click',()=>finish()));dialog.addEventListener('cancel',event=>{event.preventDefault();finish()});
 dialog.querySelectorAll('[data-picker-tab]').forEach(button=>button.addEventListener('click',()=>{if(active&&!active.busy)tab(button.dataset.pickerTab)}));
 el('search').addEventListener('submit',event=>{event.preventDefault();if(active&&!active.busy){clearTimeout(active.timer);search(active)}});
 for(const name of ['q','category'])el(name).addEventListener('input',event=>{const s=active;if(!s||s.busy||event.isComposing)return;clearTimeout(s.timer);s.timer=setTimeout(()=>search(s),240)});
 for(const name of ['kind','size'])el(name).addEventListener('change',()=>{if(active&&!active.busy)search(active)});
 el('file').addEventListener('change',()=>{if(active&&!active.busy)filesChanged(active,el('file').files)});
 el('caption').addEventListener('input',()=>{if(active)active.captionEdited=true});
 el('reset').addEventListener('click',()=>{if(active&&!active.busy){active.selected.clear();selection(active)}});
 el('stop').addEventListener('click',()=>active?.operation?.abort());
 el('edit').addEventListener('click',()=>{if(active)editSelected(active)});el('edit-local').addEventListener('click',()=>{if(active)editSelected(active,true)});
 el('upload').addEventListener('click',async()=>{
  const s=active;if(!s||s.busy||!s.options?.can_upload)return;
  if(!s.files.length||s.files.length>s.maximum){feedback(`请选择1至${s.maximum}个文件`,'warning');return}
  if(s.files.length+s.selected.size-(s.replacing&&s.selected.has(s.replacing)?1:0)>s.maximum){feedback('请先清除待选项，或减少本次文件数量','warning');return}
  for(const file of s.files){const ext=file.name.split('.').pop().toLowerCase();if(!s.options.extensions.includes(ext)||file.size>s.options.max_bytes){feedback('文件类型或大小不适用：'+file.name,'error');return}}
  s.operation=new AbortController();s.uploading=true;busy(s,true);s.query?.abort();clearTimeout(s.timer);let completed=0;
  try{
   while(s.files.length){
    const file=s.files[0],params=new URLSearchParams({...s.context,...(s.cropped?s.cropSource:{}),category:el('upload-category').value,title:!s.multiple?el('title').value:file.name.slice(0,200)});
    feedback(`正在上传第 ${completed+1} 个文件…`);
    const row=await responseJSON(await adminFetch('/api/admin/media-picker/'+(s.cropped?'crop':'upload')+'/file?'+params,{method:'POST',headers:{Accept:'application/json','X-CSRF-Token':dialog.dataset.csrf,'X-Filename':encodeURIComponent(file.name)},body:file,signal:s.operation.signal}));
    if(active!==s)return;if(s.replacing)s.selected.delete(s.replacing);s.replacing=null;s.cropped=false;s.cropSource=null;s.selected.set(row.uid,row);s.files.shift();completed++;selection(s);
   }
   localCleanup(s);el('local-preview').replaceChildren();el('file-list').replaceChildren();el('file').value='';feedback(`✓ 已上传 ${completed} 项，请确认使用`,'success');
  }catch(error){if(active===s)feedback(`已收到 ${completed} 项上传成功确认。`+(error.name==='AbortError'?'已停止等待；服务器可能已完成正在传输的文件，请先查看媒体库。':error.message+'；请核对媒体库后再重试。'),'warning')}
  finally{if(active===s){s.uploading=false;busy(s,false)}}
 });
 el('confirm').addEventListener('click',async()=>{
  const s=active;if(!s||s.busy||!s.selected.size)return;s.operation=new AbortController();busy(s,true);clearTimeout(s.timer);s.query?.abort();const selected=[];
  try{
   for(const row of s.selected.values()){
    const value=await responseJSON(await adminFetch('/api/admin/media-picker/items/select',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':dialog.dataset.csrf},body:JSON.stringify({...s.context,media_uid:row.uid,stamp:row.updated_at}),signal:s.operation.signal}));
    if(active!==s)return;selected.push({...value,label:!el('caption-label').hidden?(el('caption').value||value.title):value.title});
   }
   finish(selected);
  }catch(error){if(active===s&&error.name!=='AbortError')feedback(error.message+'；请重新搜索并选择，原内容保持不变。','error')}
  finally{if(active===s)busy(s,false)}
 });
}
