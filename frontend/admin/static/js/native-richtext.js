import {richtextWindow} from './native-richtext-window.js?v=0.15.43';
import {registerImage,imageSize,moveImage,dropIndex} from './native-image-format.js?v=0.15.42';
import {adminFetch} from './native-access.js?v=0.15.28';
/** Single-page news editor. Shared chooser, server renderer and explicit draft conversion preserve one save boundary. */
import {chooseMedia,mediaContext} from './native-media-picker.js?v=0.15.33';
import {mountNewsReader} from '/assets/shared/js/news-reader.js';
import {attachHelp} from './native-field-help.js?v=0.15.88';
function initialize(){
 const format=document.querySelector('[name=content_format]'),body=document.querySelector('[name=content]');if(!format||!body)return;
 const form=body.form,host=document.createElement('div'),tools=document.createElement('div'),notice=document.createElement('p'),imageTools=document.createElement('fieldset'),preview=document.createElement('section');
 let editor,toolbar,selection={index:0,length:0},current=format.value,backup,selectedImage,request,dispose=()=>{},changing=false;
 host.className='native-richtext-host';tools.className='native-helper-actions';notice.className='media-picker-feedback';notice.setAttribute('role','status');imageTools.className='native-richtext-image-tools';imageTools.hidden=true;preview.className='native-richtext-preview news-body';preview.hidden=true;preview.setAttribute('aria-label','新闻实际效果预览');const workspace=richtextWindow({form,body,tools,notice,host,imageTools,preview,beforeClose:()=>{if(current==='html')syncBody()}});
 const message=(value,state='info')=>{notice.textContent=value;notice.dataset.uiState=state};
 function button(label,action,title=label){const node=document.createElement('button');node.type='button';node.className='btn btn-outline-primary btn-sm';node.textContent=label;node.title=title;node.addEventListener('click',action);tools.append(node);return node}
 function invalidate(){request?.abort();dispose();preview.hidden=true;preview.replaceChildren()}
 function syncBody(){if(!editor)return;const value=editor.getSemanticHTML();if(body.value!==value){body.value=value;body.dispatchEvent(new Event('input',{bubbles:true}))}}
 function snapshot(){return JSON.stringify([format.value,body.value,...['_uid','_stamp','_nav','_nav_stamp'].map(name=>form.elements[name]?.value||'')])}
 async function server(extra={}){
  request?.abort();request=new AbortController();const data={content:body.value,content_format:current,...extra};for(const name of ['_csrf','_uid','_stamp','_nav','_nav_stamp'])data[name]=form.elements[name]?.value||'';
  const response=await adminFetch('/api/assistance/news-body',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(data),signal:request.signal});const result=await response.json();if(!response.ok)throw new Error(result.error||'操作失败，请重试');return result;
 }
 async function showPreview(){
  if(changing)return;if(current==='html')syncBody();const before=snapshot();previewButton.disabled=true;message('正在生成实际效果预览…');
  try{const result=await server();if(before!==snapshot())return;dispose();preview.innerHTML=result.html;preview.hidden=false;dispose=mountNewsReader(preview);message('✓ 以下为当前草稿效果；尚未保存或发布。','success')}
  catch(error){if(error.name!=='AbortError')message(error.message,'error')}
  finally{previewButton.disabled=false}
 }
 const imageButton=button('▧ 插入图片',()=>insert('image'),'从媒体库选择、上传或裁剪图片，最多引用10个不同文件');imageButton.dataset.richMedia='image';
 const pdfButton=button('▤ 插入PDF',()=>insert('pdf'),'选择PDF并填写文档标题，保存后在正文位置按页展开');pdfButton.dataset.richMedia='pdf';
 const previewButton=button('◉ 实际效果预览',showPreview,'读取当前草稿，使用与新闻详情相同的渲染，不保存数据');previewButton.dataset.richPreview='';
 const restoreButton=button('↶ 恢复转换前草稿',()=>{if(!backup||!confirm('恢复转换前草稿会替换当前正文，是否继续？'))return;invalidate();body.value=backup.content;current=backup.format;format.value=current;backup=null;restoreButton.hidden=true;sync();message('已恢复转换前草稿，其他字段保持当前输入。');body.dispatchEvent(new Event('input',{bubbles:true}))});restoreButton.hidden=true;
 const retry=button('重试编辑器',async()=>{retry.disabled=true;try{if(!window.Quill)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/shared/vendor/quill-2.0.3/dist/quill.js';script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('编辑器资源仍不可用，草稿已保留。'))};document.head.append(script)});sync();if(editor)message('编辑器已就绪。')}catch(error){message(error.message,'error')}finally{retry.disabled=false}});retry.hidden=true;
 function imageInspector(node){selectedImage=node;imageTools.hidden=!node;if(node){alt.value=node.getAttribute('alt')||'';layout.value=[...node.classList].find(c=>c.startsWith('image-'))||'';for(const [key,input] of sizeInputs){const value=node.getAttribute(sizeAttributes[key])||'';input.value=parseInt(value,10)||'';if(key==='imageWidth')unit.value=value.endsWith('%')?'%':'px'}}}
 const legend=document.createElement('legend');legend.textContent='当前图片';imageTools.append(legend);
 const altLabel=document.createElement('label');altLabel.textContent='图片替代文字（最多500字符）';const alt=document.createElement('input');alt.className='form-control';alt.maxLength=500;alt.dataset.richImageAlt='';altLabel.append(alt);
 const layoutLabel=document.createElement('label');layoutLabel.textContent='图片排版';const layout=document.createElement('select');layout.className='form-select';layout.dataset.richImageLayout='';for(const [value,label] of [['','普通'],['image-align-left','靠左'],['image-align-right','靠右'],['image-left','左浮动（文字环绕）'],['image-right','右浮动（文字环绕）'],['image-center','居中'],['image-wide','宽图']])layout.add(new Option(label,value));layoutLabel.append(layout);imageTools.append(altLabel,layoutLabel);
 const sizeInputs=new Map(),sizeAttributes={imageWidth:'data-image-width',imageHeight:'data-image-height',imageMinWidth:'data-image-min-width',imageMinHeight:'data-image-min-height'};
 const unit=document.createElement('select');unit.className='form-select';unit.setAttribute('aria-label','图片宽度单位');for(const value of ['px','%'])unit.add(new Option(value,value));
 for(const [key,label] of [['imageWidth','宽度（留空为自动）'],['imageHeight','高度 / px（留空等比）'],['imageMinWidth','最小宽度 / px'],['imageMinHeight','最小高度 / px']]){
  const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type='number';input.className='form-control';input.min='1';input.max='4096';input.step='1';input.dataset.richImageSize=key;wrap.append(input);if(key==='imageWidth')wrap.append(unit);sizeInputs.set(key,input);imageTools.append(wrap);
 }
 const applySize=document.createElement('button');applySize.type='button';applySize.className='btn btn-outline-primary btn-sm';applySize.textContent='确认图片尺寸';applySize.dataset.richImageApply='';imageTools.append(applySize);
 const hint=document.createElement('p');hint.textContent='尺寸输入后即时更新，无需另点应用。宽度支持1–4096px或1–100%；高度留空时等比缩放。最小宽度不超过正文容器。可拖动图片到正文新位置，撤销可恢复。';imageTools.append(hint);
 unit.addEventListener('change',()=>{sizeInputs.get('imageWidth').max=unit.value==='%'?'100':'4096';applyDimensions(false)});
 for(const input of sizeInputs.values())input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();applySize.click()}});
 function applyDimensions(explicit=false){
  if(form.inert||!selectedImage?.isConnected)return;const values={};
  for(const [key,input] of sizeInputs){input.max=key==='imageWidth'&&unit.value==='%'?'100':'4096';if(!(explicit?input.reportValidity():input.checkValidity()))return;const value=input.value?input.value+(key==='imageWidth'?unit.value:'px'):'';if(value&&!imageSize(key,value)){message('图片尺寸无效','warning');return}values[key]=value}
  const index=editor.getIndex(Quill.find(selectedImage));if(explicit)editor.history.cutoff();editor.formatText(index,1,values,'user');if(explicit)editor.history.cutoff();syncBody();message('图片尺寸已实时更新，保存新闻后正式生效。','success');
 }
 applySize.addEventListener('click',()=>applyDimensions(true));
 for(const input of sizeInputs.values()){input.addEventListener('input',()=>applyDimensions(false));input.addEventListener('change',()=>applyDimensions(false));input.addEventListener('focus',()=>editor?.history.cutoff());input.addEventListener('blur',()=>editor?.history.cutoff())}
 attachHelp(alt,'描述图片内容，供图片无法显示和屏幕阅读器使用；最多500字符，留空移除说明。',{group:true});
 attachHelp(layout,'控制正文图片的普通、左右浮动、居中或宽图呈现；手机上浮动图片独立显示，不裁剪原图。',{group:true});
 alt.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();alt.blur()}});
 for(const control of [alt,layout])control.addEventListener('change',()=>{if(form.inert||!selectedImage?.isConnected)return;const index=editor.getIndex(Quill.find(selectedImage));editor.formatText(index,1,control===alt?'alt':'layout',control.value,'user');syncBody()});
 async function insert(kind,files=[]){
  if(!editor||current!=='html')return;if(files.length>10){message('一次最多上传10张图片','warning');return}
  const saved=editor.getSelection()||selection,before=editor.getSemanticHTML();
  try{
   const rows=await chooseMedia({context:mediaContext(form,kind==='image'?'body_image':'body_pdf'),multiple:files.length>1,files});if(!rows?.length)return;
   if(current!=='html'||editor.getSemanticHTML()!==before){message('正文已变化，媒体已保留在库中，请重新选择插入位置','warning');return}
   const ids=new Set([...editor.root.querySelectorAll('img[src],a[href]')].map(node=>(node.getAttribute('src')||node.getAttribute('href')).match(/^\/media\/([a-f0-9]{32})$/)?.[1]).filter(Boolean));rows.forEach(row=>ids.add(row.uid));if(ids.size>10){message('正文最多引用10个不同文件；已上传文件保留在媒体库','warning');return}
   const Delta=Quill.import('delta'),index=Math.min(saved.index,editor.getLength()-1);let delta=new Delta().retain(index).delete(saved.length),length=0;
   for(const row of rows){const url='/media/'+row.uid,label=(row.label||row.title||(kind==='image'?'图片':'PDF文档')).slice(0,500);if(kind==='image'){delta=delta.insert({image:url},{alt:label}).insert('\n');length+=2}else{delta=delta.insert(label,{link:url}).insert('\n');length+=label.length+1}}
   editor.history.cutoff();editor.updateContents(delta,'user');editor.history.cutoff();editor.setSelection(index+length,0,'silent');if(kind==='image')imageInspector([...editor.root.querySelectorAll('img')].find(node=>editor.getIndex(Quill.find(node))===index)||null);syncBody();message('✓ 媒体已插入草稿，保存后建立正式引用','success');
  }catch(error){message(error.message,'error')}
 }
 function createEditor(){
  if(!window.Quill)throw new Error('编辑器资源未加载，正文保留在输入框中。请检查网络后刷新或重试。');
  const Delta=Quill.import('delta'),Block=Quill.import('blots/block/embed');registerImage(Quill);
  class Divider extends Block{static blotName='divider';static tagName='HR'}
  Quill.register(Divider,true);
  editor=new Quill(host,{theme:'snow',modules:{toolbar:[[{header:[2,3,4,false]}],['bold','italic','underline','strike'],[{list:'ordered'},{list:'bullet'}],[{align:[]}],['link','blockquote','code-block','clean']]}});toolbar=host.previousElementSibling;workspace.setToolbar(toolbar);
  editor.clipboard.addMatcher('IMG',(node,delta)=>/^\/media\/[a-f0-9]{32}$/.test(node.getAttribute('src')||'')?delta:new Delta());
  editor.on('text-change',()=>{syncBody();if(selectedImage&&!selectedImage.isConnected)imageInspector(null)});editor.on('selection-change',range=>{if(range)selection=range});
  const tooltips={header:'正文标题级别',bold:'加粗',italic:'斜体',underline:'下划线',strike:'删除线',list:'列表',align:'段落对齐',link:'链接（HTTP、HTTPS、邮箱）',blockquote:'引用段落','code-block':'代码块',clean:'清除格式'};
  for(const control of toolbar.querySelectorAll('button,select,.ql-picker-label')){const key=[...control.classList].find(c=>c.startsWith('ql-'))?.slice(3);if(tooltips[key]){control.title=tooltips[key];control.setAttribute('aria-label',tooltips[key])}}
  for(const [label,action] of [['撤销',()=>editor.history.undo()],['重做',()=>editor.history.redo()],['分隔线',()=>{const index=(editor.getSelection()||selection).index;editor.insertEmbed(index,'divider',true,'user');editor.setSelection(index+1,0,'silent')}]]){const node=document.createElement('button');node.type='button';node.textContent=label;node.title=label;node.className='native-richtext-command';node.addEventListener('click',action);toolbar.append(node)}
  editor.root.addEventListener('click',event=>imageInspector(event.target.closest('img')));
  let dragging;
  editor.root.addEventListener('dragstart',event=>{const img=event.target.closest('img');if(img){dragging=img;event.dataTransfer.items?.clear();event.dataTransfer.clearData();event.dataTransfer.setData('application/x-teacher-image','move');event.dataTransfer.effectAllowed='move'}});
  editor.root.addEventListener('dragend',()=>{dragging=null});
  for(const eventName of ['paste','drop'])editor.root.addEventListener(eventName,event=>{
   const data=event.clipboardData||event.dataTransfer,files=[...(data?.files||[])];
   if(eventName==='drop'&&dragging&&[...data.types].includes('application/x-teacher-image')){
    event.preventDefault();event.stopImmediatePropagation();const to=dropIndex(editor,Quill,event.clientX,event.clientY);if(!form.inert&&to!==null&&moveImage(editor,Quill,dragging,to)){syncBody();imageInspector(null);message('图片位置已移动，可使用撤销恢复。')}dragging=null;return;
   }
   if(!files.length)return;event.preventDefault();event.stopImmediatePropagation();if(files.some(file=>!file.type.startsWith('image/'))){message('正文粘贴或拖入仅接收图片；PDF请使用插入PDF按钮','warning');return}insert('image',files);
  },true);
  editor.root.addEventListener('dragover',event=>{if([...event.dataTransfer.types].some(t=>['Files','application/x-teacher-image'].includes(t)))event.preventDefault()});
 }
 function sync(){
  const html=current==='html';workspace.setEnabled(html);host.hidden=!html;body.hidden=false;imageButton.hidden=pdfButton.hidden=!html;imageInspector(null);if(toolbar)toolbar.hidden=!html;if(!html)return;
  try{if(!editor)createEditor();if(body.value!==editor.getSemanticHTML())editor.clipboard.dangerouslyPasteHTML(body.value,'silent');body.hidden=true;toolbar.hidden=false;retry.hidden=true;syncBody()}
  catch(error){host.hidden=true;if(toolbar)toolbar.hidden=true;imageButton.hidden=pdfButton.hidden=true;retry.hidden=false;message(error.message,'error')}
 }
 format.addEventListener('change',async()=>{
  if(changing){format.value=current;return}const target=format.value;if(target===current)return;
  if(!(current==='plain'&&target==='html')&&!confirm('转换正文格式可能丢失图片排版、下划线等格式。转换后可恢复原草稿，是否继续？')){format.value=current;return}
  if(current==='html')syncBody();const original={content:body.value,format:current},before=body.value;changing=true;format.disabled=true;previewButton.disabled=true;
  try{const result=await server({target_format:target});if(body.value!==before)throw new Error('正文已变化，已取消转换。请重试');backup=original;body.value=result.content;current=target;restoreButton.hidden=false;sync();message('格式已转换。可预览或恢复转换前草稿；保存后正式生效。');body.dispatchEvent(new Event('input',{bubbles:true}))}
  catch(error){format.value=current;if(error.name!=='AbortError')message(error.message,'error')}
  finally{changing=false;format.disabled=false;previewButton.disabled=false}
 });
 body.addEventListener('input',invalidate);sync();form.addEventListener('submit',event=>{if(changing){event.preventDefault();event.stopImmediatePropagation();message('正文正在转换，请完成后保存。','warning')}else if(editor&&current==='html')syncBody()},true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
