"""One bounded HTTPS transport; no redirects or arbitrary database commands."""
import asyncio,hashlib,hmac,ipaddress,json,secrets,time,logging
from urllib.parse import urlsplit
from .catalog import Error
from .data_tools import encoded
LIMIT=1100000
TIMEOUT=30
from .site_sync_work import MEDIA_CHUNK_BYTES
BINARY_TYPE='application/vnd.teacher-site.sync-chunk'
FRAME_HEADER_LIMIT=8192
FRAME_LIMIT=8+FRAME_HEADER_LIMIT+MEDIA_CHUNK_BYTES

class BinaryReply:
    def __init__(self,metadata,raw):self.metadata=metadata;self.raw=raw

def binary_frame(secret,metadata,raw):
    # Only the small metadata is canonicalized/HMACed; its signed digest binds the body.
    header=encoded(envelope(secret,metadata))
    if len(header)>FRAME_HEADER_LIMIT or not 0<len(raw)<=MEDIA_CHUNK_BYTES:raise failure('size','媒体分片超过读取上限')
    return b'TSC1'+len(header).to_bytes(4,'big')+header+raw

def binary_reply(body):
    if len(body)<9 or len(body)>FRAME_LIMIT or body[:4]!=b'TSC1':raise failure('protocol','二进制分片格式无效')
    length=int.from_bytes(body[4:8],'big')
    if not 0<length<=FRAME_HEADER_LIMIT or not 0<len(body)-8-length<=MEDIA_CHUNK_BYTES:raise failure('size','二进制分片长度无效')
    return BinaryReply(response_json(200,body[8:8+length]),body[8+length:])

def failure(code,message,status=502):return Error(message,status,'sync_'+code)

def classify(exc,stage='request'):
    if isinstance(exc,Error):return exc
    name=type(exc).__name__
    if isinstance(exc,TimeoutError):return failure('timeout',f'读取对端超时（最多{TIMEOUT}秒）；请检查对端负载与网络后重试')
    if name=='gaierror':return failure('dns','无法解析对端域名；请检查 DNS 和域名拼写')
    if name=='SSLCertVerificationError':return failure('certificate','对端 HTTPS 证书验证失败；请检查证书域名、有效期和证书链')
    if name in ('SSLError','CertificateError'):return failure('tls','对端 TLS 握手失败；请检查 HTTPS 配置')
    if isinstance(exc,ConnectionRefusedError):return failure('refused','对端拒绝连接；请检查 HTTPS 服务及443端口')
    if isinstance(exc,(ConnectionError,OSError)):return failure('network','对端连接中断或网络不可达；请检查网络、代理及防火墙')
    if isinstance(exc,(ValueError,UnicodeError)) and stage=='parse':return failure('json','对端返回的内容不是有效 JSON；可能是登录页、验证页或代理错误页')
    if stage=='fetch':return failure('worker_fetch','Worker 请求对端失败；请检查对端可达性、HTTPS及平台请求限制')
    if stage=='stream':return failure('stream','读取对端响应流失败；请检查网络及 Worker 运行日志')
    return failure('runtime','同步请求运行异常；请按诊断编号查看日志')

def diagnosed(exc,kind,url,op,started):
    error=classify(exc);ref=secrets.token_hex(6)
    code=error.code or 'sync_request'
    cause=exc
    for _ in range(5):
        if cause.__context__ is None:break
        cause=cause.__context__
    frame=cause.__traceback__
    while frame and frame.tb_next:frame=frame.tb_next
    location=(frame.tb_frame.f_code.co_filename.rsplit('/',1)[-1]+':'+str(frame.tb_lineno)) if frame else 'unknown'
    logging.getLogger(__name__).warning('sync_transport id=%s code=%s platform=%s host=%s operation=%s elapsed_ms=%d exception=%s location=%s',
        ref,code,kind,urlsplit(url).hostname,op if op in ('hello','inspect','revision-page','page','media-head','media-range','media-range-binary','media-record','proposal-submit','proposal-status') else 'request',int((time.monotonic()-started)*1000),type(cause).__name__,location)
    return Error(error.message+'；诊断编号：'+ref,error.status,code)


def origin(value):
    try:
        p=urlsplit(value.strip());host=p.hostname
        if p.scheme!='https' or not host or p.username or p.password or p.query or p.fragment or p.path not in ('','/') or p.port not in (None,443):raise ValueError()
        if host.lower()=='localhost' or '.' not in host or host.lower().endswith(('.localhost','.local','.internal')):raise ValueError()
        try:
            if not ipaddress.ip_address(host).is_global:raise ValueError()
        except ValueError:
            # A literal IPv4/IPv6 address must pass is_global, not fall through as DNS.
            if ':' in host or all(c in '0123456789.' for c in host):raise
        return 'https://'+host.encode('idna').decode().lower()
    except (ValueError,AttributeError,UnicodeError):raise Error('对端地址须为公网 HTTPS 根域名，不能包含路径、账号或非443端口') from None

def signature(secret,value):return hmac.new(secret.encode(),encoded(value),hashlib.sha256).hexdigest()

def envelope(secret,payload):
    value={'time':int(time.time()),'nonce':secrets.token_hex(16),'payload':payload}
    return {**value,'signature':signature(secret,value)}

def verify(secret,value):
    if not isinstance(value,dict):raise failure('protocol','对端响应结构无效，请确认两站版本和接口地址',403)
    fields={k:value.get(k) for k in ('time','nonce','payload')}
    if type(fields['time']) is not int:raise failure('protocol','对端响应缺少有效时间戳',403)
    if abs(time.time()-fields['time'])>120:raise failure('clock','两站服务器时钟误差超过120秒；请同步系统时间（不是修改显示时区）',403)
    if not isinstance(fields['nonce'],str) or len(fields['nonce'])!=32:raise failure('protocol','对端认证格式无效',403)
    if not hmac.compare_digest(str(value.get('signature','')),signature(secret,fields)):
        raise failure('signature','对端签名校验失败；请确认两站共享密钥完全一致',403)
    return fields['payload']

def response_json(status,body,headers=None):
    headers={str(k).lower():str(v) for k,v in (headers or {}).items()}
    if 300<=status<400:raise failure('redirect','对端返回HTTP '+str(status)+' 重定向；请配置最终 HTTPS 根域名，接口不能跳转')
    if status!=200:
        hints={401:'对端要求认证，请检查同步配置或前置访问认证',403:'对端拒绝请求，请检查共享密钥、服务器时间或访问规则',404:'请求未找到接口，也可能未进入目标Worker；请检查公网地址、Worker间请求配置及部署版本',429:'对端请求过于频繁，请稍后重试'}
        hint=hints.get(status,'对端服务异常，请查看对端运行日志' if status>=500 else '请检查对端服务')
        ray=headers.get('cf-ray','');platform=headers.get('cf-error-type','')
        try:
            value=json.loads(body)
            if isinstance(value,dict):
                platform=str(value.get('error_code') or platform)
                ray=ray or str(value.get('ray_id') or value.get('instance') or '')
                for key in ('error','title','detail'):
                    message=value.get(key)
                    if isinstance(message,dict):message=message.get('message')
                    if isinstance(message,str) and message:hint+='；'+''.join(c for c in message[:240] if c.isprintable())
        except (ValueError,UnicodeError):pass
        descriptions={'1010':'Cloudflare按客户端签名拦截，请检查安全事件','1101':'对端Worker未处理异常，请查看对端堆栈','1102':'对端Worker CPU或内存超限，请查看对端调用状态'}
        if platform in descriptions:hint+='；'+platform+' '+descriptions[platform]
        if ray and len(ray)<=64 and all(c.isalnum() or c=='-' for c in ray):hint+='；对端Ray ID：'+ray
        raise failure('http_'+str(status),'对端返回HTTP '+str(status)+'：'+hint)
    if (headers or {}).get('content-type','').split(';')[0]==BINARY_TYPE:return binary_reply(body)
    try:result=json.loads(body)
    except (ValueError,UnicodeError) as exc:raise classify(exc,'parse') from None
    if not isinstance(result,dict):raise failure('protocol','对端 JSON 结构不正确，预期为同步接口对象')
    return result

async def post(kind,url,data):
    raw=encoded(data);url=origin(url)+'/api/site-sync/peer';started=time.monotonic()
    try:
        payload=data.get('payload',{})
        width=payload.get('chunk_bytes',MEDIA_CHUNK_BYTES)
        if type(width) is not int or not 0<width<=MEDIA_CHUNK_BYTES:raise failure('size','媒体分片大小无效')
        limit=8+FRAME_HEADER_LIMIT+width if payload.get('op')=='media-range-binary' else LIMIT
        if kind=='local':return await asyncio.to_thread(_local,url,raw,limit)
        return await _worker(url,raw,limit)
    except Exception as exc:
        raise diagnosed(exc,kind,url,data.get('payload',{}).get('op'),started) from None

def _local(url,raw,limit=LIMIT):
    import socket,ssl,http.client
    host=urlsplit(url).hostname;deadline=time.monotonic()+TIMEOUT
    addresses=socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)
    if not addresses:raise failure('dns','对端域名没有可连接的 IP 地址')
    if any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):raise failure('address','对端域名解析到非公网地址',403)
    # Only retry TCP/TLS connection establishment. Never replay a submitted proposal.
    ips=list(dict.fromkeys(a[4][0] for a in addresses))[:4];last=None
    for ip in ips:
        sock=None;conn=http.client.HTTPSConnection(host,timeout=TIMEOUT)
        try:
            remaining=deadline-time.monotonic()
            if remaining<=0:raise TimeoutError()
            try:
                sock=socket.create_connection((ip,443),timeout=min(5,remaining))
                sock.settimeout(max(.01,deadline-time.monotonic()))
                conn.sock=ssl.create_default_context().wrap_socket(sock,server_hostname=host)
            except ssl.SSLCertVerificationError:raise
            except (OSError,TimeoutError) as exc:
                last=exc;continue
            conn.sock.settimeout(max(.01,deadline-time.monotonic()))
            tls=conn.sock
            conn.request('POST','/api/site-sync/peer',body=raw,headers={'Content-Type':'application/json','Accept':BINARY_TYPE+', application/json'})
            response=conn.getresponse();chunks=[];size=0
            while not response.isclosed():
                remaining=deadline-time.monotonic()
                if remaining<=0:raise TimeoutError()
                # HTTPResponse may own the socket after Connection: close.
                tls.settimeout(remaining)
                part=response.read1(min(65536,limit+1-size))
                if not part:break
                chunks.append(part);size+=len(part)
                if size>limit:raise failure('size','对端响应超过读取上限，已停止')
            return response_json(response.status,b''.join(chunks),dict(response.getheaders()))
        finally:
            conn.close()
            if sock is not None:sock.close()
    raise last or TimeoutError()

async def _worker(url,raw,limit=LIMIT):
    from js import fetch,AbortController,Object
    from pyodide.ffi import to_js
    controller=AbortController.new()
    async def run():
        opts=to_js({'method':'POST','redirect':'manual','headers':{'Content-Type':'application/json','Accept':BINARY_TYPE+', application/json'},'body':raw.decode()},dict_converter=Object.fromEntries)
        opts.signal=controller.signal
        try:response=await fetch(url,opts)
        except Exception as exc:raise classify(exc,'fetch') from None
        headers={k:response.headers.get(k) or '' for k in ('cf-ray','cf-error-type','content-type')}
        if 300<=int(response.status)<400:return response_json(int(response.status),b'',headers)
        reader=response.body.getReader();parts=[];size=0
        try:
            while True:
                part=await reader.read()
                if part.done:break
                if int(getattr(part.value,'byteLength',0))>limit-size:raise failure('size','对端响应超过读取上限，已停止')
                data=bytes(part.value.to_py());size+=len(data)
                if size>limit:raise failure('size','对端响应超过读取上限，已停止')
                parts.append(data)
        except Exception as exc:raise classify(exc,'stream') from None
        finally:
            try:await reader.cancel()
            except Exception:pass
        return response_json(int(response.status),b''.join(parts),headers)
    try:return await asyncio.wait_for(run(),TIMEOUT)
    finally:
        try:controller.abort()
        except Exception:pass

async def call(r,peer,payload):
    message=envelope(peer['secret'],payload)
    response=await post(r.kind,peer['origin'],message)
    binary=response if isinstance(response,BinaryReply) else None
    if (payload.get('op')=='media-range-binary')!=bool(binary):raise failure('protocol','对端分片响应类型不匹配')
    try:answer=verify(peer['secret'],binary.metadata if binary else response)
    except Error as exc:raise diagnosed(exc,r.kind,peer['origin'],payload.get('op'),time.monotonic()) from None
    if not isinstance(answer,dict) or answer.get('request_nonce')!=message['nonce']:raise Error('对端响应与本次请求不匹配',409)
    if answer.get('site_id')==peer['local_id']:raise Error('不能将本站配置为自己的对端')
    if binary:
        if type(answer.get('size')) is not int or answer['size']!=len(binary.raw) or not hmac.compare_digest(str(answer.get('sha256','')),hashlib.sha256(binary.raw).hexdigest()):raise failure('chunk','媒体分片校验失败')
        answer['raw']=binary.raw
    return answer
