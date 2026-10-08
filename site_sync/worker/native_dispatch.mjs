import {paused} from './control.mjs';
import {CODES,RELEASE,frames} from './diagnostics.mjs';
import {resolveSecret} from './credentials.mjs';
import {mediaBucket} from './source_media.mjs';
import {SignedPeer} from './transport.mjs';
import {R2Media} from './r2_media.mjs';
async function peer(env,value,mark=()=>{}){
  mark('peer_config');
  if(!value||typeof value.secret_ref!=='string'||!/^env:[A-Z][A-Z0-9_]{0,63}$/.test(value.secret_ref))throw new Error('Secret reference');
  mark('credential_read');const key=await resolveSecret(env);
  mark('peer_config');return new SignedPeer(value.origin,key);
}
export async function dispatch(env,method,raw){
  let trace={};
  let stage='control';const mark=value=>{stage=value;};
  try {
    if(typeof raw!=='string'||raw.length>16384||new TextEncoder().encode(raw).length>16384)throw new Error('Control bound');
    const q=JSON.parse(raw);let value;
    for(const k of ['request_id','task_id','stage','attempt_id'])if(typeof q.trace?.[k]==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(q.trace[k]))trace[k]=q.trace[k];
    if(method==='status'){mark('credential_read');const key=await resolveSecret(env);const fingerprint=await (await import('./transport.mjs')).sha(key);return JSON.stringify({ok:true,value:{release:RELEASE,credential_fingerprint:fingerprint.slice(0,16)}});}
    stage='admission';if(method!=='discard'&&await paused(env))return JSON.stringify({ok:false,kind:'temporary',stage:'admission',code:'SYNC_PAUSED',component:'local-native',release:RELEASE});
    if(method==='read'){
      if(!['manifest','slice','candidates','proposal','clone_check','probe'].includes(q.request?.kind))throw new Error('Read kind');
      const client=await peer(env,q.peer,mark);mark('peer_read');
      const body=await client.read(q.request);mark('response_encode');
      if(body.length>4*1024*1024)throw new Error('Body bound');
      return body; // Structured-clone Uint8Array: no Base64 or body-sized JSON.
    }else if(method==='step'){
      let parts=[];
      if(q.file?.upload_id&&q.file.committed_bytes===q.file.total_bytes){
        const result=await env.DB.prepare('SELECT part_number AS partNumber,etag FROM sync_file_parts WHERE task_id=? AND file_id=? ORDER BY part_number LIMIT 206').bind(q.file.task_id,q.file.file_id).all();
        parts=result.results;
      }
      value=await new R2Media(env.TEACHER_MEDIA_PREFIX?mediaBucket(env):env.MEDIA,await peer(env,q.peer)).step(q.file,q.item,parts);
    }
    else if(method==='snapshot_hash'){
      const row=await env.DB.prepare('SELECT body FROM sync_exports WHERE module=? AND record_id=? AND version=? AND request_id=? AND length(body)<=1048576').bind(...q.identity).first();
      if(!row)throw new Error('Snapshot missing');
      const bytes=row.body instanceof ArrayBuffer?new Uint8Array(row.body):new Uint8Array(row.body);
      if(bytes.length>1048576)throw new Error('Snapshot bound');
      value=await (await import('./transport.mjs')).sha(bytes);
    }else if(method==='discard'){
      if(!q.file||q.file.staging_key!=='sync/'+q.file.operation_id||!/^[a-f0-9]{64}$/.test(q.file.operation_id)||q.file.status==='published'||q.file.status==='done')throw new Error('Invalid cleanup intent');
      await new R2Media(env.TEACHER_MEDIA_PREFIX?mediaBucket(env):env.MEDIA,null).discard(q.file);value=null;
    }else throw new Error('Unknown method');
    return JSON.stringify({ok:true,value});
  }catch(e){console.warn(JSON.stringify({component:'local-native',release:RELEASE,...trace,sub_stage:e.stage||stage,error_type:/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(e.name)?e.name:'Error',code:CODES.has(e.code)?e.code:undefined,peer_request_id:e.request_id,http_status:e.http_status,platform_code:e.platform_code,native_frames:frames(e)}));return JSON.stringify({ok:false,stage:['request_encode','request_sign','fetch_request','response_headers','response_body','response_verify','response_metadata'].includes(e.stage)?e.stage:stage,code:CODES.has(e.code)?e.code:undefined,component:'local-native',release:RELEASE,request_id:e.request_id,peer_request_id:e.peer_request_id,peer_component:e.peer_component,peer_stage:e.peer_stage,peer_release:e.peer_release,native_frames:frames(e),error_type:/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(e.name)?e.name:'Error',reason:({control:'控制参数无效',credential_read:'原生辅助服务读取同步密钥失败；检查密钥配置及数据库结构',peer_config:'对端地址或密钥引用配置无效',peer_read:'对端请求失败；检查 HTTP 状态、签名及导出权限',response_encode:'候选或正文响应编码失败'})[stage]||'原生操作失败',kind:['authorization','credential','conflict','resource'].includes(e.kind)?e.kind:'temporary',http_status:e.http_status,platform_code:e.platform_code,ray_id:e.ray_id});}
}
