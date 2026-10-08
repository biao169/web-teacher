// Diagnostic metadata is advisory, never a grant or an authentication result.
export const RELEASE='0.16.043';
const codeNames=Object.freeze(['SYNC_PROPOSAL_PENDING','SYNC_PROPOSAL_CHANGED','SYNC_NATIVE_KEY_MISMATCH','SYNC_NATIVE_VERSION','SYNC_RESPONSE_SIGNATURE','PEER_REDIRECT','PEER_ACCESS_CHALLENGE','SYNC_PROPOSAL_FAILED','SYNC_NATIVE_PROTOCOL','SYNC_CLEANUP_FAILED','SYNC_EXECUTOR_UNAVAILABLE','SYNC_PAUSED',"SYNC_KEY_MISSING", "SYNC_KEY_INVALID", "SYNC_SIGNATURE_INVALID", "SYNC_CLOCK_SKEW", "SYNC_ENVELOPE_INVALID", "SYNC_EXPORT_DISABLED", "SYNC_SCOPE_DENIED", "SYNC_SCOPE_INVALID", "SYNC_REQUEST_INVALID", "SYNC_SOURCE_CONFLICT", "SYNC_SOURCE_FAILED", "SYNC_RESOURCE_FAILED", "SYNC_SCHEMA_MISSING", "SYNC_STORAGE_FAILED", "SYNC_LOCAL_CONNECTION", "SYNC_RPC_FAILED", "SYNC_ADMIN_FAILED", "PEER_HTTP_FORBIDDEN", "PEER_HTTP_FAILED", "INVOCATION_CONTEXT", "NETWORK_REQUEST_FAILED", "STREAM_READ_FAILED", "NATIVE_TYPE_ERROR", "REQUEST_TIMEOUT"]);
export const CODES=Object.freeze({has:code=>codeNames.includes(code)});
export function peerDiagnostics(response){
 const out={},fields={'peer_request_id':['trace',/^[a-f0-9]{32}$/],'peer_component':['component',/^(peer-site|peer-native)$/],'peer_stage':['stage',/^[a-z_]{1,40}$/],'peer_release':['release',/^0\.\d{1,3}\.\d{1,4}$/]};
 for(const [key,[header,pattern]] of Object.entries(fields)){const value=response.headers?.get?.('x-sync-'+header)||'';if(pattern.test(value))out[key]=value;}
 const code=response.headers?.get?.('x-sync-error');if(CODES.has(code))out.code=code;
 const ray=response.headers?.get?.('cf-ray')||'';if(/^[a-fA-F0-9]{8,32}-[A-Z]{3}$/.test(ray))out.ray_id=ray;
 return out;
}
export function frames(error){return String(error?.stack||'').split('\n').slice(1,7).flatMap(line=>{const m=line.match(/(?:at ([A-Za-z0-9_.<>]+) )?.*?([A-Za-z0-9_.-]{1,80}\.m?js):(\d+):\d+/);return m?[{file:m[2],line:Number(m[3]),function:m[1]||''}]:[]}).slice(0,4);}
export function diagnosticResponse(status,code,stage,trace,error){
 const result={component:'peer-native',release:RELEASE,code:CODES.has(code)?code:'SYNC_SOURCE_FAILED',stage,request_id:trace};
 console.warn(JSON.stringify({...result,native_frames:error?frames(error):[]}));
 return new Response(null,{status,headers:{'cache-control':'no-store','x-sync-error':result.code,'x-sync-trace':trace,'x-sync-stage':stage,'x-sync-component':result.component,'x-sync-release':RELEASE}});
}
