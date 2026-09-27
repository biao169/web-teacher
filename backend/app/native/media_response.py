"""媒体授权后的HTTP输出；本地与R2均实际分段读取，不在应用内存聚合整文件。"""
import re
from pathlib import PurePosixPath
from fastapi.responses import Response,StreamingResponse,RedirectResponse
from .catalog import Error
from .media import signature
from .media_policy import IMAGE_TYPES,EXTENSIONS
from .media_inventory_store import inventory

def byte_range(value,size):
    """解析单一区间和后缀范围，拒绝多区间、空后缀、越界及异常长数字。"""
    match=re.fullmatch(r'bytes=(\d{0,16})-(\d{0,16})',value)
    if not match or not any(match.groups()) or size==0:raise ValueError()
    left,right=match.groups()
    if not left:
        if int(right)==0:raise ValueError()
        return max(0,size-int(right)),size-1
    start=int(left);end=min(size-1,int(right)) if right else size-1
    if start>end or start>=size:raise ValueError()
    return start,end

async def media_response(request,r,uid,private=False):
    """先核对公开引用或媒体查看权限，再校验实际大小、签名及每个分段的对象版本。"""
    row=await r.media.inspect(r.p,uid) if private else await r.media.readable(uid,r.p)
    if row['storage_kind']=='external':
        from .media_links import external_url
        return RedirectResponse(external_url(row['object_key']),307,headers={'Referrer-Policy':'no-referrer'})
    if row['storage_kind']!=r.kind:raise Error('此存储类型未接入当前媒体目录',404)
    store=inventory(r.media_store);key=row['object_key'];info=await store.head(key)
    if info is None:raise Error('文件正文不存在，请核对媒体目录',404)
    size=info['size'];version=info['version']
    if size>20*1024*1024:raise Error('媒体读取超过20MiB上限',413)
    suffix=PurePosixPath(key).suffix.lower().lstrip('.')
    prefix=await store.read_range(key,0,min(size,512),version) if size else b''
    mime=signature(prefix,suffix)
    # Legacy keys may have a missing/wrong suffix. Recover only passive image
    # signatures; uploads still require matching extensions. Never trust SQL MIME.
    if not mime:
        mime=next((kind for kind in IMAGE_TYPES if signature(prefix,EXTENSIONS[kind][0])==kind),None)
    mime=mime or 'application/octet-stream'
    download_suffix=EXTENSIONS[mime][0] if mime in IMAGE_TYPES else suffix
    from .media_names import disposition
    inline=(mime.startswith(('image/','video/')) or mime=='application/pdf') and request.query_params.get('download')!='1'
    headers={'Accept-Ranges':'bytes','ETag':'"'+version+'"','Content-Type':mime,
             'Content-Disposition':disposition(row,mime,download_suffix,inline),
             'Content-Security-Policy':"default-src 'none'; frame-ancestors 'self'",'Cache-Control':'private, no-store'}
    start,end=0,size-1;status=200
    selected=request.headers.get('range')
    # A stale If-Range never mixes bytes from two object versions.
    if request.method!='HEAD' and selected and request.headers.get('if-range',headers['ETag'])==headers['ETag']:
        try:start,end=byte_range(selected,size)
        except ValueError:return Response(status_code=416,headers=headers|{'Content-Range':f'bytes */{size}'})
        status=206;headers['Content-Range']=f'bytes {start}-{end}/{size}'
    headers['Content-Length']=str(max(0,end-start+1))
    if request.method=='HEAD':return Response(status_code=200,headers=headers)
    async def chunks():
        """本地每块64KiB、R2每块1MiB；同一响应使用已验证权限，新Range请求会重新核验公开引用。"""
        offset=start
        while offset<=end:
            data=await store.read_range(key,offset,min(65536 if hasattr(r.media_store,'root') else 1048576,end-offset+1),version)
            yield data;offset+=len(data)
    return StreamingResponse(chunks(),status_code=status,headers=headers)
