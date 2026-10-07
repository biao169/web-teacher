import {mediaBucket} from './source_media.mjs';
import {SignedPeer} from './transport.mjs';
import {R2Media} from './r2_media.mjs';
function peer(env,value){
  if(!value||typeof value.secret_ref!=='string'||!/^env:[A-Z][A-Z0-9_]{0,63}$/.test(value.secret_ref))throw new Error('Secret reference');
  const secret=env[value.secret_ref.slice(4)];
  if(typeof secret!=='string'||!/^(?:[a-fA-F0-9]{2}){32,64}$/.test(secret))throw new Error('Pair key');
  return new SignedPeer(value.origin,Uint8Array.from(secret.match(/../g),s=>parseInt(s,16)));
}
export async function dispatch(env,method,raw){
  try {
    if(typeof raw!=='string'||new TextEncoder().encode(raw).length>16384)throw new Error('Control bound');
    const q=JSON.parse(raw);let value;
    if(method==='read'){
      if(!['manifest','slice','candidates','proposal'].includes(q.request?.kind))throw new Error('Read kind');
      const body=await peer(env,q.peer).read(q.request);
      if(body.length>4*1024*1024)throw new Error('Body bound');
      let binary='';for(let i=0;i<body.length;i+=8192)binary+=String.fromCharCode(...body.subarray(i,i+8192));
      value=btoa(binary);
    }else if(method==='step')value=await new R2Media(env.TEACHER_MEDIA_PREFIX?mediaBucket(env):env.MEDIA,peer(env,q.peer)).step(q.file,q.item,q.parts);
    else if(method==='discard'){
      if(!q.file||q.file.staging_key!=='sync/'+q.file.operation_id||!/^[a-f0-9]{64}$/.test(q.file.operation_id)||q.file.status==='published'||q.file.status==='done')throw new Error('Invalid cleanup intent');
      await new R2Media(env.TEACHER_MEDIA_PREFIX?mediaBucket(env):env.MEDIA,null).discard(q.file);value=null;
    }else throw new Error('Unknown method');
    return JSON.stringify({ok:true,value});
  }catch(e){return JSON.stringify({ok:false,kind:['authorization','conflict','resource'].includes(e.kind)?e.kind:'temporary',http_status:e.http_status,platform_code:e.platform_code,ray_id:e.ray_id});}
}
