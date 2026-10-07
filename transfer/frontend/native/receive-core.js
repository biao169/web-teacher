import {t as tr,joinText,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
/** One received block awaits sink.write and ACK before the next read. No whole-file Blob. */
export async function receive({session,sink,call,read,hash,stopped=()=>false,progress=()=>{},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 while(session.offset<session.size){
  if(stopped())return false;
  if(session.pending){
   const ack=await call('ack',session.pending);
   if(ack.offset!==session.pending.end)throw Error(tr("接收确认位置异常"));
   const wait=session.pending.wait;session.offset=ack.offset;session.pending=null;progress(session.offset,session.size);if(session.offset<session.size&&wait>0)await sleep(wait);continue;
  }
  const part=await read(session.offset);
  if(part.offset!==session.offset||part.data.byteLength<1||part.data.byteLength>1048576||session.offset+part.data.byteLength>session.size||await hash(part.data)!==part.sha256)throw Error(tr("接收分块校验失败"));
  // The browser write stream can still be a temporary file. Only close() means final save.
  await sink.write({type:'write',position:session.offset,data:part.data});
  session.pending={offset:session.offset,end:session.offset+part.data.byteLength,sha256:part.sha256,wait:part.wait};
  const ack=await call('ack',session.pending);
  if(ack.offset!==session.pending.end)throw Error(tr("接收确认位置异常"));
  session.offset=ack.offset;session.pending=null;progress(session.offset,session.size);
  if(session.offset<session.size&&part.wait>0)await sleep(Math.min(part.wait,86400000));
 }
 return true;
}
