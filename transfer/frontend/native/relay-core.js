import {t as tr,joinText,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
/** Sender progresses only after server state confirms the receiver's write ACK. */
export async function relaySend({file,call,put,stopped=()=>false,progress=()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 while(!stopped()){
  const state=await call('status');
  if(state.size!==file.size||state.name!==file.name||!Number.isSafeInteger(state.offset)||state.offset<0||state.offset>file.size)throw Error(tr("中转检查点不匹配"));
  progress(state.offset,file.size);
  if(state.saved)return true;
  if(!state.ready||state.pending||state.offset===file.size||state.wait_ms>0){await sleep(Math.min(Math.max(state.wait_ms||0,500),1000));continue}
  if(stopped())return false;
  await put(state.offset,file.slice(state.offset,Math.min(state.offset+1048576,file.size)));
 }
 return false;
}
