"""One bounded HTTPS transport; no redirects or arbitrary database commands."""
import asyncio,hashlib,hmac,ipaddress,json,secrets,time
from urllib.parse import urlsplit
from .catalog import Error
from .data_tools import encoded
LIMIT=1100000

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
    if not isinstance(value,dict):raise Error('对端认证失败',403)
    fields={k:value.get(k) for k in ('time','nonce','payload')}
    if type(fields['time']) is not int or abs(time.time()-fields['time'])>120 or not isinstance(fields['nonce'],str) or len(fields['nonce'])!=32 or not hmac.compare_digest(str(value.get('signature','')),signature(secret,fields)):
        raise Error('对端认证失败或服务器时钟误差超过120秒',403)
    return fields['payload']

def response_json(status,body):
    if status!=200:
        try:
            message=json.loads(body).get('error','')
            message=message[:400] if isinstance(message,str) else ''
        except (ValueError,AttributeError):message=''
        raise Error('对端返回HTTP '+str(status)+('：'+message if message else '；请检查连接和对端服务'),502)
    return json.loads(body)


async def post(kind,url,data):
    raw=encoded(data);url=origin(url)+'/api/site-sync/peer'
    try:
        if kind=='local':return await asyncio.to_thread(_local,url,raw)
        return await _worker(url,raw)
    except Error:raise
    except Exception:raise Error('无法读取对端：请检查HTTPS、连接密钥、网络和服务器时间；请查看任务已保存的阶段',502) from None

def _local(url,raw):
    import socket,ssl,http.client
    host=urlsplit(url).hostname
    addresses=socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):raise Error('对端域名解析到非公网地址',403)
    # Pin the checked IP while keeping the original hostname for TLS validation.
    sock=socket.create_connection((addresses[0][4][0],443),timeout=15)
    conn=http.client.HTTPSConnection(host,timeout=15)
    try:
        conn.sock=ssl.create_default_context().wrap_socket(sock,server_hostname=host)
        conn.request('POST','/api/site-sync/peer',body=raw,headers={'Content-Type':'application/json','Accept':'application/json'})
        response=conn.getresponse()
        body=response.read(LIMIT+1)
        if len(body)>LIMIT:raise Error('对端响应过大，已停止本次读取')
        return response_json(response.status,body)
    finally:conn.close();sock.close()

async def _worker(url,raw):
    from js import fetch,AbortController,Object
    from pyodide.ffi import to_js
    controller=AbortController.new()
    async def run():
        opts=to_js({'method':'POST','redirect':'error','headers':{'Content-Type':'application/json','Accept':'application/json'},'body':raw.decode()},dict_converter=Object.fromEntries)
        opts.signal=controller.signal;response=await fetch(url,opts)
        reader=response.body.getReader();parts=[];size=0
        try:
            while True:
                part=await reader.read()
                if part.done:break
                data=bytes(part.value.to_py());size+=len(data)
                if size>LIMIT:raise Error('对端响应过大')
                parts.append(data)
        finally:await reader.cancel()
        return response_json(int(response.status),b''.join(parts))
    try:return await asyncio.wait_for(run(),15)
    finally:controller.abort()

async def call(r,peer,payload):
    message=envelope(peer['secret'],payload)
    response=await post(r.kind,peer['origin'],message)
    answer=verify(peer['secret'],response)
    if not isinstance(answer,dict) or answer.get('request_nonce')!=message['nonce']:raise Error('对端响应与本次请求不匹配',409)
    if answer.get('site_id')==peer['local_id']:raise Error('不能将本站配置为自己的对端')
    return answer
