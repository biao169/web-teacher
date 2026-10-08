// Private service-binding RPC only. Website retains authentication, CSRF and registry ownership.
import {RELEASE,frames} from './diagnostics.mjs';
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
function fault(code,status=400){return Object.assign(new Error(code),{code,status});}
function signature(b,ext){
 const eq=(a,offset=0)=>a.every((v,i)=>b[offset+i]===v);
 if(ext==='pdf'&&eq([37,80,68,70,45]))return 'application/pdf';
 if(ext==='png'&&eq([137,80,78,71,13,10,26,10]))return 'image/png';
 if(['jpg','jpeg'].includes(ext)&&eq([255,216,255]))return 'image/jpeg';
 if(ext==='webp'&&eq([82,73,70,70])&&eq([87,69,66,80],8))return 'image/webp';
 if(ext==='gif'&&(eq([71,73,70,56,55,97])||eq([71,73,70,56,57,97])))return 'image/gif';
 if(ext==='zip'&&eq([80,75,3,4]))return 'application/zip';
 if(ext==='mp4'&&eq([102,116,121,112],4))return 'video/mp4';
 if(ext==='webm'&&eq([26,69,223,163]))return 'video/webm';
 return null;
}
export async function uploadMedia(env,body,raw){
 let q,session,reader,writer,digestWriter,stored=false,putTask,digestTask,phase='admission',count=0,putError;
 const started=Date.now();let prefix;
 try{
  if(typeof raw!=='string'||raw.length>4096)throw fault('MEDIA_REQUEST');
  q=JSON.parse(raw);
  if(!/^[a-f0-9]{32}\.(jpg|jpeg|png|webp|gif|pdf|zip|mp4|webm)$/.test(q.key)||q.key.split('.').at(-1)!==q.extension||!Number.isSafeInteger(q.size)||q.size<=0||!Number.isSafeInteger(q.limit)||q.limit<=0||q.limit>20*1024*1024||q.size>q.limit||!Array.isArray(q.allowed_mimes)||q.allowed_mimes.length>12)throw fault('MEDIA_REQUEST');
  phase='session-read';
  if(!/^media:upload-session:[0-9]{12}:[a-f0-9]{32}$/.test(q.session))throw fault('MEDIA_SESSION',409);
  const row=await env.DB.prepare('SELECT value FROM service_meta WHERE key=?').bind(q.session).first();
  if(!row||row.value.length>4096)throw fault('MEDIA_SESSION',409);
  session=JSON.parse(row.value);
  if(session.version!==1||session.object_key!==q.key||session.status!=='receiving'||!Number.isSafeInteger(session.expires_at))throw fault('MEDIA_SESSION',409);
  if(session.expires_at<Math.floor(Date.now()/1000))throw fault('MEDIA_EXPIRED',409);
  prefix=String(env.TEACHER_MEDIA_PREFIX||'media/');
  if(!/^[A-Za-z0-9_/-]+\/$/.test(prefix)||prefix.startsWith('/')||prefix.includes('..'))throw fault('MEDIA_REQUEST');
  // BYOB keeps each read at 64 KiB. No tee, whole-body buffers, or Python byte conversion.
  phase='stream-read';reader=body.getReader({mode:'byob'});
  const head=new Uint8Array(q.crop?65536:12);let headCount=0;let tail=new Uint8Array(0),mime;
  const digest=new crypto.DigestStream('SHA-256');digestTask=digest.digest;digestTask.catch(()=>{});digestWriter=digest.getWriter();
  const fixed=new FixedLengthStream(q.size);writer=fixed.writable.getWriter();
  putTask=env.MEDIA.put(prefix+q.key,fixed.readable).then(obj=>{stored=!!obj;return obj;});putTask.catch(e=>{putError=e;reader.cancel(e).catch(()=>{});writer.abort(e).catch(()=>{});});
  while(true){
   if(Math.floor(Date.now()/1000)>session.expires_at)throw fault('MEDIA_EXPIRED',409);
   phase='stream-read';const {value,done}=await reader.read(new Uint8Array(65536));if(putError)throw putError;
   if(value?.byteLength){
    count+=value.byteLength;if(count>q.size||count>q.limit)throw fault('MEDIA_SIZE',413);
    const n=Math.min(head.length-headCount,value.byteLength);head.set(value.subarray(0,n),headCount);headCount+=n;
    if(value.byteLength>=2)tail=value.slice(-2);else tail=new Uint8Array([...tail.slice(-1),...value]);
    if(!mime&&headCount>=Math.min(12,q.size)){
     mime=signature(head.subarray(0,headCount),q.extension);
     if(!mime||(q.allowed_mimes.length&&!q.allowed_mimes.includes(mime)))throw fault('MEDIA_TYPE');
    }
    phase='digest';await digestWriter.write(value);
    phase='r2-write';await writer.write(value);
   }
   if(done)break;
  }
  if(count!==q.size)throw fault('MEDIA_LENGTH');
  if(!mime)throw fault('MEDIA_TYPE');
  phase='r2-finish';await writer.close();const obj=await putTask;if(!obj)throw fault('MEDIA_STORAGE',503);stored=true;
  phase='digest-finish';await digestWriter.close();const checksum=hex(new Uint8Array(await digestTask));
  phase='session-stored';
  const receipt=await env.DB.prepare("UPDATE service_meta SET value=json_set(value,'$.status','stored','$.size',?,'$.mime',?,'$.checksum',?) WHERE key=? AND json_extract(value,'$.object_key')=? AND json_extract(value,'$.status')='receiving' AND json_extract(value,'$.expires_at')>=unixepoch() RETURNING key").bind(count,mime,checksum,q.session,q.key).first();
  if(!receipt)throw fault('MEDIA_EXPIRED',409);
  console.log(JSON.stringify({event:'MEDIA-NATIVE-END',release:RELEASE,request_id:/^[a-f0-9]{32}$/.test(q.request_id)?q.request_id:undefined,stage:phase,bytes:count,duration_ms:Date.now()-started}));
  return JSON.stringify({ok:true,size:count,mime,checksum,prefix:q.crop?hex(head.subarray(0,headCount)):'',tail:q.crop?hex(tail):''});
 }catch(e){
  const storageFailed=!!putError;
  // Settle all stream branches so an aborted upload does not keep pending work alive.
  await Promise.allSettled([reader?reader.cancel(e):body?.cancel(e),writer?.abort(e),digestWriter?.abort(e)]);
  if(putTask)await putTask.catch(()=>{});
  if(stored)await env.MEDIA.delete(prefix+q.key).catch(cleanup=>console.warn(JSON.stringify({event:'MEDIA-NATIVE-CLEANUP-ERROR',release:RELEASE,stage:'r2-cleanup',error_type:cleanup.name,native_frames:frames(cleanup)})));
  const code=/^MEDIA_(REQUEST|TYPE|SIZE|LENGTH|STORAGE|SESSION|EXPIRED)$/.test(e.code)?e.code:(phase.startsWith('session-')?'MEDIA_SESSION':((storageFailed||phase.startsWith('r2-'))?'MEDIA_STORAGE':'MEDIA_STREAM'));
  console.warn(JSON.stringify({event:'MEDIA-NATIVE-ERROR',release:RELEASE,request_id:/^[a-f0-9]{32}$/.test(q?.request_id)?q.request_id:undefined,stage:phase,bytes:count,error_type:e.name,native_frames:frames(e),code,duration_ms:Date.now()-started}));
  return JSON.stringify({ok:false,code,status:e.status||503});
 }finally{reader?.releaseLock();writer?.releaseLock();digestWriter?.releaseLock();}
}
