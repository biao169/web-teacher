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
  let stage='control';const mark=value=>{stage=value;};
  try {
    if(typeof raw!=='string'||new TextEncoder().encode(raw).length>16384)throw new Error('Control bound');
    const q=JSON.parse(raw);let value;
    if(method==='read'){
      if(!['manifest','slice','candidates','proposal','clone_check'].includes(q.request?.kind))throw new Error('Read kind');
      const client=await peer(env,q.peer,mark);mark('peer_read');
      const body=await client.read(q.request);mark('response_encode');
      if(body.length>4*1024*1024)throw new Error('Body bound');
      let binary='';for(let i=0;i<body.length;i+=8192)binary+=String.fromCharCode(...body.subarray(i,i+8192));
      value=btoa(binary);
    }else if(method==='step'){
      const result=await env.DB.prepare('SELECT part_number AS partNumber,etag FROM sync_file_parts WHERE task_id=? AND file_id=? ORDER BY part_number LIMIT 206').bind(q.file.task_id,q.file.file_id).all();
      value=await new R2Media(env.TEACHER_MEDIA_PREFIX?mediaBucket(env):env.MEDIA,await peer(env,q.peer)).step(q.file,q.item,result.results);
    }
    else if(method==='snapshot_hash'){
      const row=await env.DB.prepare('SELECT body FROM sync_exports WHERE module=? AND record_id=? AND version=? AND request_id=?').bind(...q.identity).first();
      if(!row)throw new Error('Snapshot missing');
      const bytes=row.body instanceof ArrayBuffer?new Uint8Array(row.body):new Uint8Array(row.body);
      if(bytes.length>1048576)throw new Error('Snapshot bound');
      value=await (await import('./transport.mjs')).sha(bytes);
    }else if(method==='discard'){
      if(!q.file||q.file.staging_key!=='sync/'+q.file.operation_id||!/^[a-f0-9]{64}$/.test(q.file.operation_id)||q.file.status==='published'||q.file.status==='done')throw new Error('Invalid cleanup intent');
      await new R2Media(env.TEACHER_MEDIA_PREFIX?mediaBucket(env):env.MEDIA,null).discard(q.file);value=null;
    }else throw new Error('Unknown method');
    return JSON.stringify({ok:true,value});
  }catch(e){return JSON.stringify({ok:false,stage:['request_encode','request_sign','fetch_request','response_headers','response_body','response_verify','response_metadata'].includes(e.stage)?e.stage:stage,code:['INVOCATION_CONTEXT','NETWORK_REQUEST_FAILED','STREAM_READ_FAILED','NATIVE_TYPE_ERROR','REQUEST_TIMEOUT'].includes(e.code)?e.code:undefined,error_type:/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(e.name)?e.name:'Error',reason:({control:'控制参数无效',credential_read:'原生辅助服务读取同步密钥失败；检查密钥配置及数据库结构',peer_config:'对端地址或密钥引用配置无效',peer_read:'对端请求失败；检查 HTTP 状态、签名及导出权限',response_encode:'候选或正文响应编码失败'})[stage]||'原生操作失败',kind:['authorization','credential','conflict','resource'].includes(e.kind)?e.kind:'temporary',http_status:e.http_status,platform_code:e.platform_code,ray_id:e.ray_id});}
}
