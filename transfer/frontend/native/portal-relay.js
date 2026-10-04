import {codeCard,receiveCode,registerCodeReceiver,codeResolving} from './portal-codes.js?v=0.15.96';
import {t as tr,joinText,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
import {selectedFolder,submitManifest,directoryStream} from './live-folder.js?v=0.15.96';
import {request,transferPath,transferBase,bytes} from './portal-core.js?v=0.15.158';
import {receive} from './receive-core.js?v=0.15.96';
import {readBlock} from './chunk-client.js?v=0.15.96';
import {relaySend} from './relay-core.js?v=0.15.96';
import {digest} from './lan-core.js?v=0.15.96';
const root=document.querySelector('[data-portal]'),area=document.querySelector('[data-relay]');
if(root&&area&&transferBase){
 const q=id=>area.querySelector('#relay-'+id),say=t=>{setText(q('status'),t)},sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const canSave=window.isSecureContext&&(typeof window.showSaveFilePicker==='function'||typeof window.showDirectoryPicker==='function')&&Boolean(window.crypto?.subtle);
 let task=null,busy=false;
 const shortCode=codeCard(q('pair-box'),{input:q('pair')});q('copy').hidden=true;
 const key=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
 const post=(op,data)=>request('/api/relay/'+op,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':root.dataset.csrf},body:JSON.stringify(data)});
 const call=(t,op,data={})=>post(op,{key:t.key,code:t.code,...data});
 function controls(){if(!task){shortCode.clear();q('pair-box').hidden=true;}q('send').disabled=busy||!!task;q('folder-send').disabled=busy||!!task||!document.querySelector('[data-folder-preview]')?.folderSelection;q('join').disabled=busy||!!task||!canSave;q('run').disabled=busy||!task||!!task?.sink?.broken;q('pause').disabled=!busy||!task;q('cancel').disabled=!task;q('file').disabled=busy||!!task;q('code').readOnly=busy||!!task}
 async function binary(t,offset,body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);t.request=controller;
  try{
   const response=await fetch(transferPath('/api/relay/chunk'),{method:'POST',credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/octet-stream','X-CSRF-Token':root.dataset.csrf,'X-Relay-Code':t.code,'X-Relay-Key':t.key,'X-Offset':String(offset)},body});
   if(body){const value=await response.json();if(!response.ok)throw Error(value.error||tr("中转发送失败"));return value}
   return await readBlock(response);
  }finally{clearTimeout(timer);t.request=null}
 }
 async function heartbeat(t){
  if(t.closed||t.done)return;
  try{await call(t,'status')}catch(error){t.paused=true;say(joinText(joinText(tr("连接或权限检查失败："),errorText(error.message)),tr("。请保留本页，恢复连接后点击继续；离线约3分钟会过期。")))}
  if(!t.closed&&!t.done)t.timer=setTimeout(()=>heartbeat(t),10000);
 }
 function init(t){task=t;busy=false;q('progress').value=0;setText(q('detail'),t.name+' · '+bytes(t.size));controls();t.timer=setTimeout(()=>heartbeat(t),10000)}
 async function send(folder=false){
  if(busy||task||codeResolving())return;let selection,file;
  try{selection=folder?selectedFolder():null;file=selection?.file||q('file').files[0];if(!file)throw Error(tr("请选择文件"))}catch(error){say(errorText(error.message));return}
  busy=true;const t={key:key(),file,role:'send'};task=t;controls();
  try{
   Object.assign(t,await post('create',{key:t.key,name:file.name,size:file.size,...(selection?{folder:selection.descriptor}:{})}));if(t.closed){await call(t,'cancel');return}
   if(selection)await submitManifest((op,data={})=>call(t,op,data),selection.manifest,()=>t.closed,n=>say(tr("正在提交目录清单：{0} 项",[n])));
   init(t);q('pair-box').hidden=false;shortCode.show({mode:'relay',target:t.code,key:t.key});say(tr("将配对码发给对方，然后点击开始 / 继续；对方选择保存位置后才开始发送。"));
  }catch(error){if(t.code)try{await call(t,'cancel')}catch{}if(task===t)task=null;if(!t.closed)say(joinText(errorText(error.message),tr("；创建结果未知时请等待3分钟过期后重试。")))}finally{if(task===t||!task){busy=false;controls()}}
 }
 q('send').addEventListener('click',()=>send());q('folder-send').addEventListener('click',()=>send(true));
 for(const event of ['folder-selection-ready','folder-selection-reset'])document.querySelector('[data-folder-preview]')?.addEventListener(event,controls);
 q('join').addEventListener('click',async()=>{
  if(busy||task||codeResolving())return;const value=q('code').value.trim();if(/^[A-Za-z]{2}[0-9]{4}$/.test(value)){try{await receiveCode(value)}catch(error){say(errorText(error.message))}return}
  const code=value.toLowerCase();if(!/^[a-f0-9]{32}$/.test(code)){say(tr("请输入完整中转配对码"));return}busy=true;controls();const t={key:key(),code,role:'receive',offset:0};
  try{Object.assign(t,await post('join',{key:t.key,code}));if(typeof window[t.kind==='folder'?'showDirectoryPicker':'showSaveFilePicker']!=='function')throw Error(tr("当前浏览器不支持此类型的保存"));init(t);say(tr("请核对文件名和大小，点击开始 / 继续选择保存位置；确认后预留双方额度。"))}
  catch(error){try{await call(t,'cancel')}catch{}say(errorText(error.message))}finally{busy=false;controls()}
 });
 registerCodeReceiver('relay',{busy:()=>busy||!!task,accept:async(result,receiveKey)=>{
  const t={...result.session,key:receiveKey,role:'receive',offset:result.session.offset||0};
  try{if(!canSave||typeof window[t.kind==='folder'?'showDirectoryPicker':'showSaveFilePicker']!=='function')throw Error(tr('当前浏览器不支持此类型的保存'));init(t);say(tr('请核对文件名和大小，点击开始 / 继续选择保存位置；确认后预留双方额度。'))}catch(error){try{await call(t,'cancel')}catch{}throw error}
 }});
 q('run').addEventListener('click',async()=>{
  const t=task;if(!t||busy||t.closed||t.sink?.broken)return;busy=true;t.paused=false;controls();
  const progress=(n,total)=>{q('progress').value=total?n/total*100:0;setText(q('detail'),tr("{0} · 已确认 {1} / {2}",[t.name,bytes(n),bytes(total)]))};
  try{
   let done;
   if(t.role==='send')done=await relaySend({file:t.file,call:op=>call(t,op),put:(offset,body)=>binary(t,offset,body),stopped:()=>t.paused||t.closed,progress,sleep});
   else{
    if(!t.sink&&!t.saved){const handle=await (t.kind==='folder'?window.showDirectoryPicker({mode:'readwrite'}):window.showSaveFilePicker({suggestedName:t.name}));if(t.closed)return;t.sink=t.kind==='folder'?await directoryStream(handle,t,(op,data={})=>call(t,op,data),{stopped:()=>t.closed,progress:(n,path)=>say(tr("已保存 {0} 个文件 · {1}",[n,path]))}):await handle.createWritable({mode:'exclusive'});if(t.closed){await t.sink.abort();return}}
    await call(t,'ready');
    if(!t.saved){
     done=await receive({session:t,sink:t.sink,hash:digest,stopped:()=>t.paused||t.closed,progress,sleep:async ms=>{while(ms>0&&!t.paused&&!t.closed){await sleep(Math.min(ms,1000));ms-=1000}},read:async offset=>{
      while(!t.closed&&!t.paused){const state=await call(t,'status');if(state.offset!==offset)throw Error(tr("接收位置不一致，请先核对确认状态"));if(state.pending&&state.wait_ms===0)return binary(t,offset);await sleep(Math.min(Math.max(state.wait_ms||0,500),1000))}throw Error(tr("已暂停，确认位置保留在本页"));
     },call:async(op,pending)=>{const result=await call(t,'ack',{offset:pending.offset,sha256:pending.sha256});return {offset:result.offset}}});
     if(done){await t.sink.close();t.saved=true;t.sink=null}
    }
    if(t.saved){await call(t,'saved');done=true}
   }
   if(done){t.done=true;q('progress').value=100;clearTimeout(t.timer);say(t.role==='send'?tr("对方已完成校验并保存文件"):tr("文件已保存；服务器没有保留整份文件"));if(t.role==='send')try{await call(t,'cancel')}catch{}task=null}
   else say(tr("已暂停，可在本页继续；双方需保持在线。"));
  }catch(error){if(!t.closed)say(t.saved?tr("文件已保存，完成通知未确认；点击继续仅重试通知。"):joinText(errorText(error.message),t.sink?.broken?tr("。本地写入失败，请取消并检查磁盘/权限后重新配对；已完成文件保留。"):tr("。可在本页继续核对，不会自动重复发送或拼接整个文件。")))}
  finally{if(task===t||!task){busy=false;controls()}}
 });
 q('pause').addEventListener('click',()=>{if(task){task.paused=true;say(tr("将在当前分块处理后暂停。"))}});
 q('cancel').addEventListener('click',async()=>{
  const t=task;if(!t)return;t.closed=true;clearTimeout(t.timer);t.request?.abort();task=null;
  try{if(t.sink)await t.sink.abort()}catch{}
  try{await call(t,'cancel');say(tr("已取消，未使用额度已释放；目录中已完成文件保留。"))}catch{say(tr("本地已停止；未用额度在会话到期后释放。"))}
  busy=false;controls();
 });
 q('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(q('pair').value);say(tr("中转配对码已复制"))}catch{q('pair').focus();q('pair').select();say(tr("请手动复制配对码"))}});
 window.addEventListener('beforeunload',event=>{if(task&&!task.done){event.preventDefault();event.returnValue=''}});
 window.addEventListener('pagehide',()=>{if(task){task.closed=true;task.request?.abort();task.sink?.abort().catch(()=>{})}});
 controls();if(!canSave)say(tr("接收需要HTTPS与支持流式保存的桌面浏览器；发送及下方临时分享仍可使用。"));
}
