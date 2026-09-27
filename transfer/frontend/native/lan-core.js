import {t as tr,joinText,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
/** Bounded DataChannel adapter. Logical blocks reuse the existing receive/ACK sink. */
import {receive} from './receive-core.js?v=0.15.96';
export const BLOCK=1048576,FRAME=16384;
export const digest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class Wire{
 constructor(channel,maxMessageSize=FRAME){
  this.timeout=120000;this.channel=channel;this.frame=Math.min(FRAME,maxMessageSize||FRAME);this.queue=[];this.bytes=0;this.pending=null;this.error=null;
  channel.binaryType='arraybuffer';channel.bufferedAmountLowThreshold=65536;
  channel.addEventListener('message',event=>{
   try{
    if(this.error)return;
    const raw=event.data,bytes=typeof raw==='string'?raw.length*2:raw.byteLength;
    if((typeof raw==='string'&&raw.length>2048)||(typeof raw!=='string'&&(!(raw instanceof ArrayBuffer)||bytes<1||bytes>FRAME)))throw Error(tr("直连消息大小异常"));
    const value=typeof raw==='string'?JSON.parse(raw):raw;
    if(this.pending){const pending=this.pending;this.pending=null;pending.resolve(value);return}
    if(this.queue.length>=70||this.bytes+bytes>BLOCK+65536)throw Error(tr("对方超出接收窗口"));
    this.queue.push({value,bytes});this.bytes+=bytes;
   }catch(error){this.fail(error)}
  });
  channel.addEventListener('close',()=>this.fail(Error(tr("直连已断开，请重新配对；未完成的文件不会标为成功"))));
  channel.addEventListener('error',()=>this.fail(Error(tr("数据通道失败，请检查防火墙或网络隔离"))));
 }
 fail(error){if(this.error)return;this.error=error;this.queue=[];this.bytes=0;if(this.pending){this.pending.reject(error);this.pending=null}this.channel.close()}
 next(){
  if(this.error)return Promise.reject(this.error);
  if(this.queue.length){const item=this.queue.shift();this.bytes-=item.bytes;return Promise.resolve(item.value)}
  if(this.pending)return Promise.reject(Error(tr("重复读取接收窗口")));
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.fail(Error(tr("等待对方超时，请保持双方页面在线"))),this.timeout);
   this.pending={resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}};
  });
 }
 async drain(threshold=65536){
  const start=Date.now();while(this.channel.bufferedAmount>threshold){
   if(this.error)throw this.error;if(this.channel.readyState!=='open')throw Error(tr("数据通道未连接"));
   if(Date.now()-start>120000)throw Error(tr("发送缓冲等待超时"));await delay(20);
  }
 }
 async send(value){
  if(this.error)throw this.error;await this.drain();if(this.channel.readyState!=='open')throw Error(tr("数据通道未连接"));
  const data=value instanceof ArrayBuffer||ArrayBuffer.isView(value)?value:JSON.stringify(value);
  if((typeof data==='string'?data.length*2:data.byteLength)>this.frame)throw Error(tr("协商的数据通道消息上限过小"));
  this.channel.send(data);
 }
}
function message(value,type){if(!value||typeof value!=='object'||value.type!==type)throw Error(tr("直连消息顺序异常"));return value}
export async function sendFile({wire,file,rate,progress=()=>{},hash=digest}){
 let offset=0;
 while(offset<file.size){
  const pull=message(await wire.next(),'pull');if(pull.offset!==offset)throw Error(tr("请求位置不正确"));
  const data=await file.slice(offset,Math.min(offset+BLOCK,file.size)).arrayBuffer(),sha256=await hash(data),end=offset+data.byteLength,start=Date.now();
  await wire.send({type:'block',offset,size:data.byteLength,sha256});
  for(let at=0;at<data.byteLength;at+=wire.frame)await wire.send(data.slice(at,at+wire.frame));
  const ack=message(await wire.next(),'ack');if(ack.offset!==end||ack.sha256!==sha256)throw Error(tr("接收确认校验失败"));
  offset=end;progress(offset,file.size);
  if(rate&&offset<file.size){let wait=data.byteLength/rate*1000-(Date.now()-start);while(wait>0){if(wire.error)throw wire.error;await delay(Math.min(wait,1000));wait-=1000}}
 }
 message(await wire.next(),'saved');await wire.send({type:'complete'});await wire.drain(0);
}
export async function receiveFile({wire,size,sink,progress=()=>{},hash=digest,onSaved=()=>{}}){
 const session={offset:0,size};
 await receive({session,sink,hash,progress,read:async offset=>{
  await wire.send({type:'pull',offset});const part=message(await wire.next(),'block');
  if(part.offset!==offset||!Number.isSafeInteger(part.size)||part.size<1||part.size>BLOCK||offset+part.size>size||!/^[a-f0-9]{64}$/.test(part.sha256))throw Error(tr("分块头无效"));
  const data=new Uint8Array(part.size);let at=0;
  while(at<data.length){const frame=await wire.next();if(!(frame instanceof ArrayBuffer)||at+frame.byteLength>data.length)throw Error(tr("分块长度异常"));data.set(new Uint8Array(frame),at);at+=frame.byteLength}
  return {offset,data,sha256:part.sha256,wait:0};
 },call:async(action,part)=>{await wire.send({type:'ack',offset:part.end,sha256:part.sha256});return {offset:part.end}}});
 await sink.close();onSaved();await wire.send({type:'saved'});message(await wire.next(),'complete');
}
export async function connectionPath(pc){
 const stats=await pc.getStats();let pair;
 for(const row of stats.values())if(row.type==='transport'&&row.selectedCandidatePairId)pair=stats.get(row.selectedCandidatePairId);
 if(!pair)for(const row of stats.values())if(row.type==='candidate-pair'&&row.state==='succeeded'&&row.nominated)pair=row;
 if(!pair)return tr("浏览器直连已建立；浏览器未提供所选路径详情");
 const local=stats.get(pair.localCandidateId),remote=stats.get(pair.remoteCandidateId);
 if(local?.candidateType==='relay'||remote?.candidateType==='relay')throw Error(tr("检测到中继候选，本模式已停止"));
 return tr("浏览器直连 · {0} ↔ {1} · {2}；未使用本站文件中转，物理局域网/VPN路径需实测确认",[local?.candidateType||tr("未知"),remote?.candidateType||tr("未知"),local?.protocol||tr("协议未知")]);
}
