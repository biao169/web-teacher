import {hmac,sha} from './transport.mjs';
const enc=new TextEncoder();
export async function sourceMedia(env,request){
 let object,storage=false;
 try{
  if(request.method!=='POST'||new URL(request.url).pathname!=='/sync/v1/read')return new Response('Not found',{status:404});
  const key=env.TEACHER_SYNC_KEY;
  if(typeof key!=='string'||!/^[a-fA-F0-9]{64}$/.test(key))return new Response('Disabled',{status:403});
  const secret=Uint8Array.from(key.match(/../g),x=>parseInt(x,16));
  const reader=request.body?.getReader();if(!reader)throw Error('Body');
  const bytes=new Uint8Array(2048);let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;if(size+value.length>2048)throw Error('Bound');bytes.set(value,size);size+=value.length;}}
  catch(e){await reader.cancel();throw e;}finally{reader.releaseLock();}
  const body=bytes.subarray(0,size),stamp=request.headers.get('x-sync-time')||'',nonce=request.headers.get('x-sync-nonce')||'',signature=request.headers.get('x-sync-signature')||'';
  if(!/^\d{1,12}$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>120||!/^[a-f0-9]{32}$/.test(nonce)||!/^[a-f0-9]{64}$/.test(signature))return new Response('Denied',{status:403});
  const k=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('HMAC',k,Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)),enc.encode(['sync-v1-request',stamp,nonce,'POST','/sync/v1/read',await sha(body)].join('\n'))))return new Response('Denied',{status:403});
  const q=JSON.parse(new TextDecoder().decode(body));
  if((q.task!==undefined&&(typeof q.task!=='string'||q.task.length>128))||(q.snapshot_hash!=null&&(typeof q.snapshot_hash!=='string'||!/^[a-f0-9]{64}$/.test(q.snapshot_hash)))||(q.record_version!=null&&(typeof q.record_version!=='string'||!q.record_version.length||q.record_version.length>256)))throw Error('Identity');
  if(q.kind!=='media'||!['module','record','version','file'].every(x=>typeof q[x]==='string'&&q[x].length>0&&q[x].length<=256)||![q.offset,q.length,q.total].every(Number.isSafeInteger)||q.offset<0||q.length<=0||q.length>5*1024*1024||q.total>20*1024*1024||q.offset+q.length>q.total)throw Error('Range');
  storage=true;
  const allowed=await env.DB.prepare(`SELECT 1 FROM sync_connections c JOIN sync_peers p ON p.peer_id=c.peer_id JOIN sync_grants g ON g.principal_id=c.owner_uid WHERE p.enabled=1 AND g.enabled=1 AND g.can_write=1 AND (g.expires_at=0 OR g.expires_at>?) AND ? IN (SELECT value FROM json_each(c.export_scope_json)) AND ? IN (SELECT value FROM json_each(g.scopes_json)) LIMIT 1`).bind(Math.floor(Date.now()/1000),q.module,q.module).first();
  if(!allowed)return new Response('Denied',{status:403});
  const f=await env.DB.prepare(`SELECT a.object_key,a.size,e.version record_version,e.body_sha256 FROM sync_exports e,json_each(e.files_json) f JOIN media_assets a ON a.uid=json_extract(f.value,'$.id') AND a.updated_at=json_extract(f.value,'$.version') WHERE e.module=? AND e.record_id=? AND e.request_id=? AND a.uid=? AND a.updated_at=? AND a.size=? AND a.status='active' AND a.storage_kind='r2' LIMIT 1`).bind(q.module,q.record,q.task||'',q.file,q.version,q.total).first();
  if(!f){
    const snapshot=await env.DB.prepare('SELECT 1 FROM sync_exports WHERE module=? AND record_id=? AND request_id=? LIMIT 1').bind(q.module,q.record,q.task||'').first();
    return new Response(snapshot?'Media version changed':'Snapshot unavailable',{status:snapshot?409:410});
  }
  if((q.record_version&&q.record_version!==f.record_version)||(q.snapshot_hash&&q.snapshot_hash!==f.body_sha256))return new Response('Snapshot changed',{status:409});
  await env.DB.prepare('UPDATE sync_exports SET expires_at=? WHERE module=? AND record_id=? AND request_id=? AND version=?').bind(Math.floor(Date.now()/1000)+604800,q.module,q.record,q.task||'',f.record_version).run();
  object=await env.MEDIA.get((env.TEACHER_MEDIA_PREFIX||'media/')+f.object_key,{range:{offset:q.offset,length:q.length}});
  if(!object||object.size!==q.total){if(object?.body)await object.body.cancel();return new Response('Object changed',{status:409});}
  const meta=JSON.stringify({length:q.length,offset:q.offset,total:q.total,version:q.version});
  const sig=await hmac(secret,['sync-v1-response',nonce,'200',meta,'stream'].join('\n'));
  return new Response(object.body,{headers:{'x-sync-meta':meta,'x-sync-signature':sig,'content-length':String(q.length),'content-type':'application/octet-stream','cache-control':'no-store'}});
 }catch(e){if(object?.body)try{await object.body.cancel();}catch{}return new Response(storage?'Storage temporarily unavailable':'Invalid range or request',{status:storage?503:409});}
}
export function mediaBucket(env){
 const prefix=env.TEACHER_MEDIA_PREFIX||'media/',b=env.MEDIA;
 return {head:key=>b.head(prefix+key),get:key=>b.get(prefix+key),delete:key=>b.delete(prefix+key),
  createMultipartUpload:(key,opts)=>b.createMultipartUpload(prefix+key,opts),
  resumeMultipartUpload:(key,id)=>b.resumeMultipartUpload(prefix+key,id)};
}
