import {codeCard,receiveCode,registerCodeReceiver,codeResolving} from './portal-codes.js?v=0.15.96';
import {t as tr,joinText,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
import {selectedFolder,submitManifest,directoryStream} from './live-folder.js?v=0.15.96';
import {request,bytes,transferBase} from './portal-core.js?v=0.15.158';
import {Wire,sendFile,receiveFile,connectionPath} from './lan-core.js?v=0.15.96';
const root=document.querySelector('[data-portal]'),section=document.querySelector('[data-lan]');
if(root&&section&&transferBase){
 const q=id=>section.querySelector('#lan-'+id),say=text=>{setText(q('status'),text)},sleep=ms=>new Promise(r=>setTimeout(r,ms));
 let current=null,busy=false;
 const shortCode=codeCard(q('pair-box'),{input:q('pair')});q('copy').hidden=true;
 const capable=window.isSecureContext&&typeof window.RTCPeerConnection==='function'&&Boolean(window.crypto?.subtle);
 const receiverCapable=capable&&(typeof window.showSaveFilePicker==='function'||typeof window.showDirectoryPicker==='function');
 const key=()=>{const a=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')};
 const call=(op,data)=>request('/api/lan/'+op,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':root.dataset.csrf},body:JSON.stringify(data)});
 function controls(){q('send').disabled=busy||!capable;q('folder-send').disabled=busy||!capable||!document.querySelector('[data-folder-preview]')?.folderSelection;q('join').disabled=busy||!receiverCapable;q('save').disabled=!current||current.role!=='receive'||Boolean(current.pc)||Boolean(current.choosing);q('cancel').disabled=!current;q('file').disabled=busy;q('code').readOnly=busy}
 async function cleanup(task=current,notify=true){
  if(!task)return;if(current===task){current=null;shortCode.clear();q('pair-box').hidden=true;}task.stopped=true;clearTimeout(task.timer);task.wire?.fail(Error(tr("直连已取消")));task.pc?.close();
  if(task.sink&&!task.saved)try{await task.sink.abort()}catch{}
  if(notify&&task.code)try{await call('cancel',{code:task.code,key:task.key})}catch{}
  busy=false;controls();
 }
 async function fail(error,task=current){if(task&&task!==current)return;const saved=task?.saved;await cleanup(task);say(saved?tr("文件已保存，但完成通知中断，请告知发送方"):joinText(errorText(error.message)||tr("直连失败，请重新配对"),task?.kind==='folder'?tr("；目录中已完成文件保留。"):''))}
 function schedule(task,ms){clearTimeout(task.timer);if(!task.stopped&&!task.finished)task.timer=setTimeout(()=>poll(task),ms)}
 async function signal(task,description){await sleep(250);if(task.stopped)throw Error(tr("配对已取消"));return call('signal',{code:task.code,key:task.key,description:{type:description.type,sdp:description.sdp}})}
 async function gather(pc){
  if(pc.iceGatheringState==='complete')return;
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>end(Error(tr("收集连接地址超时"))),15000);const changed=()=>{if(pc.iceGatheringState==='complete')end()};function end(error){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',changed);error?reject(error):resolve()}pc.addEventListener('icegatheringstatechange',changed);changed()});
 }
 async function channel(task,dc){
  if(task.stopped){dc.close();return}if(task.wire){dc.close();return}
  task.wire=new Wire(dc,task.pc.sctp?.maxMessageSize);
  try{
   if(dc.readyState!=='open')await new Promise((resolve,reject)=>{const timer=setTimeout(()=>end(Error(tr("直连未建立；请检查双方网络、防火墙或访客 Wi-Fi 隔离"))),task.role==='send'?120000:30000);const opened=()=>end(),closed=()=>end(Error(tr("连接提前关闭")));function end(error){clearTimeout(timer);dc.removeEventListener('open',opened);dc.removeEventListener('close',closed);error?reject(error):resolve()}dc.addEventListener('open',opened);dc.addEventListener('close',closed)});
   task.wire.frame=Math.min(task.wire.frame,task.pc.sctp?.maxMessageSize||16384);
   task.wire.timeout=Math.max(120000,task.rate?1048576/task.rate*1000+30000:0);
   setText(q('path'),await connectionPath(task.pc));say(tr("直连传输中，请保持双方页面在线"));
   const progress=(n,total)=>{q('progress').value=total?n/total*100:0;setText(q('detail'),tr("已确认 {0} / {1}",[bytes(n),bytes(total)]))};
   if(task.role==='send')await sendFile({wire:task.wire,file:task.file,rate:task.rate,progress});
   else {await receiveFile({wire:task.wire,size:task.size,sink:task.sink,progress,onSaved:()=>{task.saved=true}})}
   task.finished=true;q('progress').value=100;clearTimeout(task.timer);say(task.role==='send'?tr("接收方已完成校验并保存文件"):tr("文件已完整保存"));
   // Allow the final ordered control message to leave before closing SCTP.
   await sleep(1500);await cleanup(task,true);
  }catch(error){if(!task.stopped)await fail(error,task)}
 }
 async function connect(task,offer=null){
  if(task.stopped)return;
  const pc=task.pc=new RTCPeerConnection({iceServers:[],iceTransportPolicy:'all',bundlePolicy:'max-bundle'});
  pc.addEventListener('connectionstatechange',()=>{if(pc.connectionState==='failed'&&!task.stopped)fail(Error(tr("无法直连，请检查网络隔离或防火墙；未切换到服务器中转")),task)});
  if(task.role==='send'){const dc=pc.createDataChannel('teacher-file-v1',{ordered:true});channel(task,dc);await pc.setLocalDescription(await pc.createOffer())}
  else {pc.addEventListener('datachannel',event=>channel(task,event.channel));await pc.setRemoteDescription(offer);await pc.setLocalDescription(await pc.createAnswer())}
  await gather(pc);await signal(task,pc.localDescription);
 }
 async function poll(task){
  if(task.stopped||task.finished||task.polling)return;
  if(task.connecting){schedule(task,2000);return}
  task.polling=true;
  try{
   const state=await call('poll',{code:task.code,key:task.key});if(task.stopped)return;task.rate=state.rate;
   if(state.description){task.description=state.description;if(task.role==='send'&&!task.remote&&task.pc){task.remote=true;await task.pc.setRemoteDescription(state.description)}}
   if(task.role==='send'&&state.paired&&!task.pc){say(tr("对方已加入，正在建立直连"));await connect(task)}
   if(task.role==='receive'&&!task.pc){setText(q('detail'),`${state.name} · ${bytes(state.size)}`);q('save').disabled=task.choosing||!task.description;say(task.description?tr("请核对文件后，选择保存位置并接收"):tr("已配对，等待发送方准备连接"))}
   schedule(task,task.wire?.channel.readyState==='open'?10000:2000);
  }catch(error){if(!task.stopped&&!task.finished)await fail(error,task)}finally{task.polling=false}
 }
 async function send(folder=false){
  if(busy||codeResolving())return;let selection,file;
  try{selection=folder?selectedFolder():null;file=selection?.file||q('file').files[0];if(!file)throw Error(tr("请先选择一个文件"))}catch(error){say(errorText(error.message));return}
  busy=true;controls();const task={role:'send',key:key(),file};current=task;
  try{
   Object.assign(task,await call('create',{key:task.key,name:file.name,size:file.size,...(selection?{folder:selection.descriptor}:{})}));
   if(task.stopped){await call('cancel',{code:task.code,key:task.key});return}
   if(selection)await submitManifest((op,data={})=>call(op,{key:task.key,code:task.code,...data}),selection.manifest,()=>task.stopped,n=>say(tr("正在提交目录清单：{0} 项",[n])));
   q('pair-box').hidden=false;shortCode.show({mode:'lan',target:task.code,key:task.key});q('progress').value=0;setText(q('path'),tr("等待连接；文件内容尚未发送"));say(tr("请将配对码发给接收方；双方都需保持此页面在线"));controls();schedule(task,1000);
  }catch(error){await fail(error,task)}
 }
 q('send').addEventListener('click',()=>send());q('folder-send').addEventListener('click',()=>send(true));
 for(const event of ['folder-selection-ready','folder-selection-reset'])document.querySelector('[data-folder-preview]')?.addEventListener(event,controls);
 q('join').addEventListener('click',async()=>{
  if(busy||codeResolving())return;const value=q('code').value.trim();if(/^[A-Za-z]{2}[0-9]{4}$/.test(value)){try{await receiveCode(value)}catch(error){say(errorText(error.message))}return}
  const code=value.toLowerCase();if(!/^[a-f0-9]{32}$/.test(code)){say(tr("请粘贴发送方提供的完整配对码"));return}busy=true;controls();const task={role:'receive',key:key(),code};current=task;
  try{Object.assign(task,await call('join',{code,key:task.key}));if(typeof window[task.kind==='folder'?'showDirectoryPicker':'showSaveFilePicker']!=='function')throw Error(tr("当前浏览器不支持此类型的保存，请使用支持目录/文件写入的浏览器"));q('progress').value=0;controls();q('save').disabled=true;schedule(task,1000)}catch(error){await fail(error,task)}
 });
 registerCodeReceiver('lan',{busy:()=>busy||!!current,accept:async(result,receiveKey)=>{
  const task={...result.session,key:receiveKey,role:'receive'};current=task;busy=true;
  try{if(!receiverCapable||typeof window[task.kind==='folder'?'showDirectoryPicker':'showSaveFilePicker']!=='function')throw Error(tr('当前浏览器不支持此类型的保存，请使用支持目录/文件写入的浏览器'));q('progress').value=0;controls();q('save').disabled=true;say(tr('已配对，等待发送方准备连接'));schedule(task,1000)}catch(error){await fail(error,task);throw error}
 }});
 q('save').addEventListener('click',async()=>{
  const task=current;if(!task?.description||task.pc||task.choosing)return;task.choosing=true;q('save').disabled=true;
  try{
   const handle=await (task.kind==='folder'?window.showDirectoryPicker({mode:'readwrite'}):window.showSaveFilePicker({suggestedName:task.name}));
   if(task.stopped)return;task.sink=task.kind==='folder'?await directoryStream(handle,task,(op,data={})=>call(op,{code:task.code,key:task.key,...data}),{stopped:()=>task.stopped,progress:(n,path)=>say(tr("已保存 {0} 个文件 · {1}",[n,path]))}):await handle.createWritable({mode:'exclusive'});
   if(task.stopped){await task.sink.abort();return}
   clearTimeout(task.timer);task.connecting=true;await connect(task,task.description);task.connecting=false;schedule(task,1000);say(tr("正在建立直连，等待文件传输"));
  }catch(error){if(error.name==='AbortError'&&!task.pc){task.choosing=false;say(tr("已取消选择位置，可重新选择"));controls()}else await fail(error,task)}
 });
 q('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(q('pair').value);say(tr("配对码已复制；请仅发给目标接收方"))}catch{q('pair').focus();q('pair').select();say(tr("请手动复制选中的配对码"))}});
 q('cancel').addEventListener('click',async()=>{await cleanup();say(tr("直连已取消；目录中已完成文件保留，未完成文件不标为成功"))});
 window.addEventListener('pagehide',()=>{if(current){current.stopped=true;current.pc?.close();current.sink?.abort().catch(()=>{})}});
 window.addEventListener('beforeunload',event=>{if(current&&!current.finished){event.preventDefault();event.returnValue=''}});
 controls();if(!capable)say(tr("直连需要 HTTPS 和支持 WebRTC 的浏览器；临时分享仍可使用"));else if(!receiverCapable)say(tr("当前浏览器可发送；接收需要支持文件流式保存的桌面浏览器（如 Chrome/Edge）。不会将整个文件缓存在网页内。"));
}
