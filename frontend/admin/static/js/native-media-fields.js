import {adminFetch} from './native-access.js?v=0.15.28';
/** One link input, native key, chooser and complete preview for every media field. */
import {chooseMedia,mediaContext} from './native-media-picker.js?v=0.15.33';
import {mediaURL,showLinkPreview,suggestedType,lookupMedia} from './native-media-links.js?v=0.15.33';
import {clearMediaPreviews} from './native-media.js?v=0.15.33';
for(const field of document.querySelectorAll('[data-media-field]')){
 const select=field.querySelector('[data-media-key]'),input=field.querySelector('[data-media-link]'),mime=field.querySelector('[data-media-type]'),stamp=field.querySelector('[data-media-stamp]'),box=field.querySelector('[data-field-canvas]'),status=field.querySelector('[data-field-preview-status]'),open=field.querySelector('[data-field-preview-open]');let epoch=0,controller,timer,current=null;
 const message=text=>{clearMediaPreviews(box);box.replaceChildren(Object.assign(document.createElement('span'),{className:'native-muted',textContent:text}))};
 function externalControls(){let external=false;try{const url=new URL(input.value,location.origin);external=url.origin!==location.origin}catch{}field.querySelector('[data-media-type-label]').hidden=!external;return external}
 function assign(row){
  let option=[...select.options].find(item=>item.value===row.object_key);if(!option){option=new Option(row.title||row.object_key,row.object_key);select.append(option)}
  select.value=row.object_key;input.value=mediaURL(row);stamp.value=row.updated_at;mime.value=row.mime_type;externalControls();current=row;
 }
 async function update(fromKey=false){
  clearTimeout(timer);const version=++epoch;controller?.abort();controller=new AbortController();open.hidden=true;field.querySelector('[data-media-edit]').hidden=true;status.textContent='';current=null;
  if(!(fromKey?select.value:input.value.trim())){message('未选择媒体');return}message('加载预览…');
  try{
   const response=fromKey?await lookupMedia(select.value,select.form.elements.namedItem('_csrf').value,controller.signal):await adminFetch('/api/admin/media-picker/links/resolve',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':select.form.elements.namedItem('_csrf').value},body:JSON.stringify({...mediaContext(select.form,select.name),url:input.value,mime_type:mime.value}),signal:controller.signal});
   const data=await response.json();if(version!==epoch)return;if(!response.ok)throw Error(data.error||'预览不可用');
   if(fromKey)assign(data);current=data;
   const external=data.storage_kind==='external',registered=data.registered!==false;
   open.href=registered?'/admin/media/'+encodeURIComponent(data.uid)+'/inspect':data.object_key;open.rel='noopener noreferrer';open.hidden=false;open.title=registered?'新标签页打开完整预览及使用位置':'打开外部资源；尚未登记到媒体库';
   status.textContent=data.status==='trash'?'此媒体已在回收站，请重新选择':external?'外部链接 · 类型由您声明，大小未核验'+(registered?'':'；保存后登记'):(data.title||'');status.title=status.textContent;
   field.querySelector('[data-media-edit]').hidden=!(data.mime_type.startsWith('image/')&&registered&&data.status!=='trash');
   showLinkPreview(box,data);
  }catch(error){if(version===epoch&&error.name!=='AbortError'){message('预览不可用');status.textContent=error.message}}
 }
 select.addEventListener('change',()=>{if(!select.value){input.value='';stamp.value=''}update(true)});
 input.addEventListener('input',event=>{
  controller?.abort();epoch++;stamp.value='';select.value='';current=null;open.hidden=true;field.querySelector('[data-media-edit]').hidden=true;
  if(externalControls()){const hint=suggestedType(input.value);mime.value=[...mime.options].some(o=>o.value===hint)?hint:''}
  clearTimeout(timer);if(!event.isComposing)timer=setTimeout(()=>update(),400);
 });
 input.addEventListener('compositionend',()=>{clearTimeout(timer);timer=setTimeout(()=>update(),400)});
 mime.addEventListener('change',()=>{stamp.value='';update()});
 field.querySelector('[data-media-field-actions]').hidden=false;
 field.querySelectorAll('[data-media-permitted]').forEach(button=>button.disabled=button.dataset.mediaPermitted!=='1');
 const startup=field.querySelector('[data-media-startup]');if(startup)startup.hidden=true;
 async function choose(editCurrent=false,startTab='library'){
  try{const rows=await chooseMedia({context:mediaContext(select.form,select.name),currentKey:current?.object_key||select.value,editCurrent,startTab});if(!rows?.length)return;
   assign(rows[0]);select.dispatchEvent(new Event('change',{bubbles:true}));
  }catch(error){status.textContent=error.message}
 }
 field.querySelector('[data-media-choose]').addEventListener('click',()=>choose());field.querySelector('[data-media-edit]').addEventListener('click',()=>choose(true));
 field.querySelector('[data-media-upload-direct]')?.addEventListener('click',()=>choose(false,'upload'));
 const clear=field.querySelector('[data-media-clear]');clear.disabled=input.required;
 clear.addEventListener('click',()=>{select.value='';input.value='';stamp.value='';mime.value='';externalControls();select.dispatchEvent(new Event('change',{bubbles:true}))});
 externalControls();update(Boolean(select.value));
}
