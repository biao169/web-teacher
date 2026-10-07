// Worker-native signed peer reads. A pair has its own random >=32-byte key.
// Bodies <=4 MiB are hashed; media bytes stay in the native TLS stream.
const enc=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
export async function sha(bytes){return hex(await crypto.subtle.digest('SHA-256',bytes));}
export async function hmac(secret,text){
  if (!(secret instanceof Uint8Array) || secret.byteLength<32) throw new Error('Invalid pair secret');
  const k=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',k,enc.encode(text)));
}
export class PeerError extends Error {constructor(message,kind){super(message);this.kind=kind;}}
async function bounded(response,limit){
  const reader=response.body.getReader(),out=new Uint8Array(limit);let total=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;
    if(total+value.byteLength>limit)throw new PeerError('Body exceeded bound','conflict');
    out.set(value,total);total+=value.byteLength;}
  }catch(e){await reader.cancel();throw e;}finally{reader.releaseLock();}
  return out.subarray(0,total);
}
async function errorPrefix(response){
  if(!response.body)return '';
  const reader=response.body.getReader(),out=new Uint8Array(4096);let used=0;
  try{while(used<out.length){const {value,done}=await reader.read();if(done)break;const n=Math.min(value.length,out.length-used);out.set(value.subarray(0,n),used);used+=n;}}
  finally{try{await reader.cancel();}finally{reader.releaseLock();}}
  return new TextDecoder().decode(out.subarray(0,used));
}
const responseCleanup=new WeakMap();
export function releasePeerResponse(response){const release=responseCleanup.get(response);if(release){responseCleanup.delete(response);release();}}
export class SignedPeer {
  constructor(origin,secret,{fetcher=fetch,clock=()=>Date.now()/1000,timeoutMs=15000}={}) {
    const u=new URL(origin);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('Explicit HTTPS origin required');
    if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>60000)throw new Error('Invalid timeout');this.timeoutMs=timeoutMs;
    this.origin=u.origin;this.secret=secret;this.fetcher=fetcher;this.clock=clock;
  }
  async read(request,options={}) {
    const controller=new AbortController();let handedOff=false;
    const error=Object.assign(new PeerError('Peer request deadline exceeded','resource'),{stage:'peer_read'});
    const timer=setTimeout(()=>controller.abort(error),this.timeoutMs);
    timer.unref?.();
    const release=()=>{clearTimeout(timer);controller.abort();};
    try{
      const result=await this._read(request,{...options,signal:controller.signal});
      if(controller.signal.aborted)throw error;
      if(options.stream){responseCleanup.set(result,release);handedOff=true;}
      return result;
    }catch(e){if(controller.signal.aborted)throw error;throw e;}
    finally{if(!handedOff)clearTimeout(timer);}
  }
  async _read(request,{stream=false,recovered=false,signal}={}) {
    const body=JSON.stringify(request);if(enc.encode(body).length>2048)throw new Error('Request bound');
    const nonce=hex(crypto.getRandomValues(new Uint8Array(16))),stamp=String(Math.floor(this.clock()));
    const sig=await hmac(this.secret,['sync-v1-request',stamp,nonce,'POST','/sync/v1/read',await sha(enc.encode(body))].join('\n'));
    const response=await this.fetcher(this.origin+'/sync/v1/read',{method:'POST',body,signal,redirect:'manual',headers:{'x-sync-stream':stream?'1':'0','x-sync-time':stamp,'x-sync-nonce':nonce,'x-sync-signature':sig,'accept-encoding':'identity','content-type':'application/json'}});
    try {
      if(response.status===410&&stream&&request.record_version&&request.snapshot_hash){
        if(response.body)await response.body.cancel();
        if(recovered)throw new PeerError('Snapshot not yet available','resource');
        const manifest=await this._read({kind:'manifest',task:request.task,module:request.module,record:request.record,version:request.record_version,snapshot_hash:request.snapshot_hash},{signal});
        const value=JSON.parse(new TextDecoder().decode(manifest));
        if(value.snapshot_hash!==request.snapshot_hash)throw new PeerError('Snapshot changed','conflict');
        return this._read(request,{stream:true,recovered:true,signal});
      }
      if(response.status===429||response.status>=500){
        const error=new PeerError('Peer transient/resource failure','resource');error.http_status=response.status;
        const ray=response.headers.get('cf-ray')||'';if(/^[a-fA-F0-9]{8,32}-[A-Z]{3}$/.test(ray))error.ray_id=ray;
        try{const text=await errorPrefix(response),code=text.match(/\b110[12]\b/);if(code)error.platform_code=Number(code[0]);}catch{}
        throw error;
      }
      if([401,403].includes(response.status))throw Object.assign(new PeerError('Peer authentication unavailable','credential'),{http_status:response.status});
      if(response.status!==200)throw Object.assign(new PeerError('Peer version/route rejected','conflict'),{http_status:response.status});
      const text=response.headers.get('x-sync-meta')||'',size=response.headers.get('content-length')||'';
      const limit=stream?request.length:['manifest','candidates','proposal','clone_check'].includes(request.kind)?8192:request.length;
      if(text.length>2048||!/^\d+$/.test(size)||Number(size)>limit||!response.body||!['identity',null].includes(response.headers.get('content-encoding')))throw new PeerError('Response bounds','conflict');
      const data=stream?null:await bounded(response,limit);
      const value=stream?'stream':await sha(data);
      // Verify using WebCrypto rather than early-exit string comparison.
      const k=await crypto.subtle.importKey('raw',this.secret,{name:'HMAC',hash:'SHA-256'},false,['verify']);
      const supplied=response.headers.get('x-sync-signature')||'';
      if(!/^[a-f0-9]{64}$/.test(supplied)||!await crypto.subtle.verify('HMAC',k,Uint8Array.from(supplied.match(/../g),x=>parseInt(x,16)),enc.encode(['sync-v1-response',nonce,'200',text,value].join('\n'))))throw new PeerError('Invalid signature','authorization');
      let meta;try{meta=JSON.parse(text);}catch{throw new PeerError('Invalid metadata','conflict');}
      if(!meta||typeof meta!=='object')throw new PeerError('Invalid metadata','conflict');
      if(meta.version!==request.version||(!stream&&data.length!==Number(size)))throw new PeerError('Version/length changed','conflict');
      if(!['manifest','candidates','proposal','clone_check'].includes(request.kind)&&(meta.offset!==request.offset||Number(size)!==request.length))throw new PeerError('Range changed','conflict');
      if(stream&&(meta.length!==request.length||meta.total!==request.total))throw new PeerError('Media changed','conflict');
      return stream?response:data;
    } catch(e) {if(response.body&&!response.bodyUsed)await response.body.cancel();throw e;}
  }
}
