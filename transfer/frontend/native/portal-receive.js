import {registerCodeReceiver,codeResolving} from './portal-codes.js?v=0.15.96';
import {t as tr,joinText,errorText,setText,setAttr,getText} from './transfer-i18n.js?v=0.15.96';
import {readBlock} from './chunk-client.js?v=0.15.96';
import {shareURL,transferPath,transferBase,request,bytes} from './portal-core.js?v=0.15.158';
import {receive} from './receive-core.js?v=0.15.96';
import {readManifest,folderSink} from './folder-receive.js?v=0.15.96';
const root=document.querySelector('[data-portal]'),area=document.querySelector('[data-stream-receive]'),message=document.querySelector('#stream-feedback'),inspect=document.querySelector('#inspect-share'),start=document.querySelector('#stream-start'),pause=document.querySelector('#stream-pause'),cancel=document.querySelector('#stream-cancel'),link=document.querySelector('#receive-link');
const csrf=root.dataset.csrf;let metadata=null,token='',session=null,sink=null,busy=false,paused=false,source='',key='',destination=null,manifest=null,heartbeat=null;
const canFile=window.isSecureContext&&typeof window.showSaveFilePicker==='function',canFolder=window.isSecureContext&&typeof window.showDirectoryPicker==='function';
const baseHeaders={'Content-Type':'application/json','X-CSRF-Token':csrf};
const post=(path,value)=>request(path,{method:'POST',headers:baseHeaders,body:JSON.stringify(value)});
const call=(action,value={})=>request('/api/receive/'+session.id+'/'+action,{method:'POST',headers:{...baseHeaders,'X-Receive-Key':key},body:JSON.stringify(value)});
const digest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
const isFolder=()=>metadata?.kind==='folder';
function controls(){const active=!!(sink||session||destination);inspect.disabled=busy||active;start.disabled=busy||!metadata||!!sink?.broken||(isFolder()?!canFolder:!canFile);pause.disabled=!busy;cancel.disabled=busy||!active;link.readOnly=busy||active;root.dataset.receiving=busy||active?'true':'false'}
if(transferBase&&(canFile||canFolder))area.hidden=false;
else if(transferBase)document.querySelector('#stream-unavailable').hidden=false;
inspect.addEventListener('click',async()=>{
 if(busy||sink||session||destination||codeResolving())return;busy=true;controls();
 try{source=shareURL(link.value.trim(),location.origin);link.value=source;token=new URL(source).pathname.split('/').pop();metadata=await post('/api/share-info',{token});
 setText(message,joinText(metadata.name+' · '+bytes(metadata.size),isFolder()?tr(" · {0} 个文件、{1} 个目录。将在所选位置新建文件夹，同名自动加后缀。",[metadata.fileCount,metadata.directoryCount]):tr("。确认后选择保存位置。")));
 if(isFolder()&&!canFolder)setText(message,joinText(getText(message),tr(" 当前浏览器不支持目录写入，请在支持目录选择的浏览器中，通过 HTTPS 或 localhost 打开此链接。不会改为压缩包下载。")));
 if(!isFolder()&&!canFile)setText(message,joinText(getText(message),tr(" 当前浏览器不支持逐块保存，请使用上方浏览器下载。")));
 setText(start,isFolder()?tr("选择目录并保存"):tr("选择位置并保存"));
 }catch(e){metadata=null;setText(message,errorText(e.message))}finally{busy=false;controls()}
});
async function read(offset){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try{return await readBlock(await fetch(transferPath('/api/receive/'+session.id+'/chunk'),{method:'POST',credentials:'same-origin',signal:controller.signal,headers:{...baseHeaders,'X-Receive-Key':key},body:JSON.stringify({offset})}))}finally{clearTimeout(timer)}
}
function makeKey(){return btoa(Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>String.fromCharCode(x)).join('')).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
start.addEventListener('click',async()=>{
 if(busy||!metadata||sink?.broken||codeResolving())return;
 if(!sink&&!destination&&link.value.trim()!==source){metadata=null;setText(message,tr("链接已修改，请重新检查"));controls();return}
 busy=true;paused=false;controls();let savedName='';
 try{
  if(!sink&&!destination){
   // User gesture must invoke the picker before the first network await.
   if(isFolder())destination=await window.showDirectoryPicker({mode:'readwrite'});
   else{const handle=await window.showSaveFilePicker({suggestedName:metadata.name});sink=await handle.createWritable({mode:'exclusive'})}
   key=makeKey();session=null;
  }
  if(!session){session=await post('/api/receive',{token,key,folder:isFolder()});if(session.size!==metadata.size||session.name!==metadata.name||(session.kind||'file')!==(metadata.kind||'file'))throw Error(tr("分享信息已变化，请取消并重新检查"))}
  if(isFolder()){
   let renewing=false;heartbeat=setInterval(async()=>{if(renewing||!session)return;renewing=true;try{await call('touch')}catch{paused=true}finally{renewing=false}},30000);
   if(!manifest){setText(message,tr("正在分批核对目录清单…"));manifest=await readManifest(call,metadata,()=>paused);if(!manifest){setText(message,tr("已暂停清单读取，保留本页可继续。"));return}}
   if(!sink)sink=await folderSink(destination,manifest,{touch:()=>call('touch'),progress:(n,path)=>{setText(message,tr("已保存 {0} / {1} 个文件 · {2}",[n,metadata.fileCount,path]))}});
   savedName=sink.name;
  }
  const done=await receive({session,sink,call,read,hash:digest,stopped:()=>paused,sleep:async ms=>{while(ms>0&&!paused){const delay=Math.min(1000,ms);await new Promise(resolve=>setTimeout(resolve,delay));ms-=delay}},progress:(n,total)=>{document.querySelector('#receive-progress').value=total?n/total*100:0;setText(message,joinText(joinText(joinText(joinText(tr("已校验写入 "),bytes(n)),' / '),bytes(total)),isFolder()?tr(" · 已保存 {0} 个文件",[sink.completed]):''))}});
  if(done){
   if(isFolder()){if(!await sink.finish(()=>paused)){setText(message,tr("已暂停，保留本页可继续创建剩余空目录/空文件。"));return}await call('finish')}
   else await sink.close();
   sink=null;session=null;destination=null;manifest=null;metadata=null;document.querySelector('#receive-progress').value=100;setText(message,savedName?joinText(tr("文件夹已完整保存："),savedName):tr("文件已保存。"));
  }else setText(message,tr("已暂停。请保留本页并及时继续；已完成文件已保存，未完成文件仍可能处于临时写入状态。"));
 }catch(e){setText(message,joinText(e.name==='AbortError'?tr("已取消选择或请求超时。"):errorText(e.message),sink?.broken?tr(" 本地写入失败；请取消接收、检查磁盘空间或权限后重新接收，已完成文件保留。"):tr(" 可在本页继续核对；不会自动创建新接收会话。")))}
 finally{if(heartbeat){clearInterval(heartbeat);heartbeat=null}busy=false;setText(start,sink||destination?tr("继续接收"):isFolder()?tr("选择目录并保存"):tr("选择位置并保存"));controls()}
});
pause.addEventListener('click',()=>{paused=true;pause.disabled=true;setText(message,tr("当前分块确认后暂停。"))});
cancel.addEventListener('click',async()=>{
 if(busy)return;busy=true;controls();let serverError=null;const folder=isFolder();
 try{if(session)await call('cancel')}catch(e){serverError=e}
 try{if(sink)await sink.abort();sink=null;session=null;destination=null;manifest=null;metadata=null;
 setText(message,joinText(folder?tr("已停止目录接收；已保存的文件、目录及可能的空占位文件保留，不会删除已有内容。"):tr("已取消本地接收。"),serverError?tr(" 服务器释放未确认，将在会话超时后释放未用额度。"):tr(" 未使用的接收额度已释放；创建结果未知时会超时释放。")));
 }catch(e){setText(message,joinText(errorText(e.message),tr("；本地接收流未确认关闭，请核对后重试。")))}finally{busy=false;controls()}
});
window.addEventListener('beforeunload',event=>{if(sink||destination){event.preventDefault();event.returnValue=''}});
function shareLanding(){const value=new URL(location.href).searchParams.get('folder');if(!value||!/^(?:[A-Za-z0-9_-]{43}|tc\.[a-f0-9]{32}\.[a-f0-9]{64})$/.test(value))return;link.value=new URL(transferPath('/s/'+value),location.origin).href;document.querySelector('[data-mode="cache"]')?.click();document.querySelector('[data-view="receive"]')?.click();setText(message,tr("已填入目录分享链接，请先检查目录，再选择保存位置。"));if(!canFolder){const hint=document.querySelector('#stream-unavailable');hint.hidden=false;setText(hint,tr("这是目录分享。当前浏览器或连接不支持目录写入，请使用支持目录选择的浏览器，并通过 HTTPS 或 localhost 打开。不会强制下载压缩包。"))}link.focus()}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',shareLanding);else setTimeout(shareLanding,0);
controls();

registerCodeReceiver('offline',{busy:()=>busy||!!(sink||session||destination),accept:async result=>{
 metadata=result.file;token=result.token;source=new URL(transferPath('/s/'+token),location.origin).href;link.value=source;
 setText(message,metadata.name+' · '+bytes(metadata.size));setText(start,isFolder()?tr('选择目录并保存'):tr('选择位置并保存'));
 setText(document.querySelector('#receive-feedback'),tr('分享已核对，请选择浏览器下载或逐块保存。'));
 if(isFolder()&&!canFolder){const hint=document.querySelector('#stream-unavailable');hint.hidden=false;setText(hint,tr('这是目录分享。当前浏览器或连接不支持目录写入，请使用支持目录选择的浏览器，并通过 HTTPS 或 localhost 打开。不会强制下载压缩包。'))}
 controls();(isFolder()||canFile?start:document.querySelector('#receive button')).focus();
}});
