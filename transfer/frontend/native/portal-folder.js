import {t as tr,joinText,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
import {fromHandle,fromFileList,captureDrop,LIMITS} from './folder-manifest.js?v=0.15.96';
import {bytes} from './portal-core.js?v=0.15.96';
const panel=document.querySelector('[data-folder-preview]');
if(panel){
 const q=id=>panel.querySelector('#folder-'+id);let manifest=null,controller=null,generation=0,page=0;
 const native=window.isSecureContext&&typeof window.showDirectoryPicker==='function',fallback='webkitdirectory' in q('input');
 const message=text=>{setText(q('status'),text)};
 q('choose').disabled=!native&&!fallback;
 if(!native&&!fallback)message(tr("当前浏览器不能选择文件夹；可尝试拖入文件夹或使用支持目录选择的浏览器。"));
 function reset(){generation++;controller?.abort();controller=null;manifest=null;panel.folderSelection=null;panel.folderProgress=null;q('input').value='';q('list').replaceChildren();setText(q('summary'),tr("尚未选择文件夹"));q('preview').hidden=true;q('choose').disabled=!native&&!fallback;panel.removeAttribute('aria-busy');panel.dispatchEvent(new CustomEvent('folder-selection-reset'))}
 function render(){
  const entries=manifest.entries,start=page*100;q('list').replaceChildren();let offset=entries.slice(0,start).reduce((n,e)=>n+(e.size||0),0);
  for(const entry of entries.slice(start,start+100)){
   const li=document.createElement('li'),icon=document.createElement('span'),path=document.createElement('span'),size=document.createElement('small');
   setText(icon,entry.kind==='directory'?'▸':'·');setAttr(icon,'aria-hidden','true');setText(path,entry.path+(entry.kind==='directory'?'/':''));path.className='folder-path';setText(size,entry.kind==='file'?bytes(entry.size):tr("目录"));
   if(entry.kind==='file'){offset+=entry.size;if(panel.folderProgress){setText(size,joinText(size.textContent,joinText(' · ',offset<=panel.folderProgress.bytes?tr("已完成"):offset-entry.size<panel.folderProgress.bytes?tr("上传中"):tr("待上传"))))}}
   li.style.setProperty('--folder-depth',String(Math.min(8,entry.path.split('/').length-1)));li.append(icon,path,size);q('list').append(li);
  }
  setText(q('page'),entries.length?tr("{0}–{1} / {2} 项",[start+1,Math.min(start+100,entries.length),entries.length]):tr("空文件夹"));q('previous').disabled=page===0;q('next').disabled=(page+1)*100>=entries.length;
 }
 async function scan(read){
  reset();const id=generation;controller=new AbortController();const signal=controller.signal;q('choose').disabled=true;setAttr(panel,'aria-busy','true');message(tr("正在读取目录清单，不读取文件内容、不上传。"));
  try{
   const next=await read({signal,onProgress:s=>{if(id===generation)setText(q('summary'),tr("扫描中：{0} 个文件 · {1} 个目录 · {2}",[s.fileCount,s.directoryCount,bytes(s.totalBytes)]))}});
   if(id!==generation)return;manifest=next;panel.folderSelection=manifest;page=0;setText(q('summary'),tr("{0} · {1} 个文件 · {2} 个目录（含根目录） · {3}",[manifest.rootName,manifest.fileCount,manifest.directoryCount,bytes(manifest.totalBytes)]));q('preview').hidden=false;render();
   message(joinText(tr("目录清单已就绪，尚未开始传输。"),manifest.emptyDirectoriesKnown?tr("已记录空目录。"):tr("兼容选择模式不能识别空目录，仅保留文件及其父目录。")));
   panel.dispatchEvent(new CustomEvent('folder-selection-ready',{detail:manifest}));
  }catch(error){if(id===generation){manifest=null;panel.folderSelection=null;setText(q('summary'),tr("未生成目录清单"));message(error.name==='AbortError'?tr("已取消选择文件夹。"):errorText(error.message)||tr("无法读取文件夹，请检查权限。"))}}
  finally{if(id===generation){controller=null;q('choose').disabled=!native&&!fallback;panel.removeAttribute('aria-busy')}}
 }
 q('choose').addEventListener('click',()=>{
  if(native){let picked;try{picked=window.showDirectoryPicker({mode:'read'})}catch(error){message(errorText(error.message));return}scan(async options=>fromHandle(await picked,options))}
  else{q('input').value='';q('input').click()}
 });
 q('input').addEventListener('change',()=>{if(q('input').files.length>LIMITS.files){reset();message(joinText(tr("文件数量超过预览上限 "),LIMITS.files));return}const files=Array.from(q('input').files||[]);if(files.length)scan(options=>fromFileList(files,options))});
 q('clear').addEventListener('click',()=>{reset();message(tr("已清除本地目录清单。"))});
 for(const name of ['dragover','dragleave','drop'])q('drop').addEventListener(name,event=>{
  event.preventDefault();event.stopPropagation();q('drop').classList.toggle('dragging',name==='dragover');
  if(panel.folderBusy)return;
  if(name==='drop'){try{const read=captureDrop(event.dataTransfer?.items);scan(read)}catch(error){reset();message(errorText(error.message))}}
 });
 panel.addEventListener('folder-upload-progress',()=>{if(manifest)render()});
 q('previous').addEventListener('click',()=>{if(manifest&&page>0){page--;render()}});q('next').addEventListener('click',()=>{if(manifest&&(page+1)*100<manifest.entries.length){page++;render()}});
 setText(q('limits'),tr("本地预览上限：{0} 个文件、{1} 个目录、{2} 层。不是后台传输额度。",[LIMITS.files,LIMITS.directories,LIMITS.depth]));
}
