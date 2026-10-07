"""共用媒体输出：先鉴权，本地一次打开并连续读取，R2保留有界区间读取。"""
import re
from pathlib import PurePosixPath
from fastapi.responses import Response,StreamingResponse,RedirectResponse
from starlette.concurrency import run_in_threadpool
from .catalog import Error
from .media import signature
from .media_policy import EXTENSIONS
from .media_inventory_store import inventory

def content_type(prefix,key):
    """以文件头识别所有已支持类型，兼容历史错误后缀；不信任登记MIME。"""
    suffix=PurePosixPath(key).suffix.lower().lstrip('.')
    return signature(prefix,suffix) or next((mime for mime,extensions in EXTENSIONS.items()
        if signature(prefix,extensions[0])==mime),'application/octet-stream')

class LocalMediaResponse(StreamingResponse):
    """复用框架流式响应和线程池；正常结束、异常或断开都释放同一个句柄。"""
    def __init__(self,handle,start,length,**kwargs):
        self.handle=handle
        def chunks():
            handle.seek(start);remaining=length
            while remaining:
                data=handle.read(min(65536,remaining))
                if not data:raise OSError('媒体传输中断：文件被截断，请重新打开')
                remaining-=len(data)
                yield data
        super().__init__(chunks(),**kwargs)
    async def __call__(self,scope,receive,send):
        try:await super().__call__(scope,receive,send)
        finally:self.handle.close()

async def preview_details(store,row):
    """后台详情按需读一次文件头，显示真实类型和媒体目录内的绝对路径。"""
    if row['storage_kind']!='local' or not hasattr(store,'root'):return
    source=inventory(store)
    try:
        row['disk_path']=source.absolute_path(row['object_key'])
        handle,info,prefix=await run_in_threadpool(source.open_reader,row['object_key'])
        try:row.update(preview_mime=content_type(prefix,row['object_key']),actual_size=info['size'])
        finally:handle.close()
    except FileNotFoundError:row['preview_note']='该路径下没有文件，请核对媒体目录配置。'
    except PermissionError:row['preview_note']='网站运行账号没有读取此文件的权限。'
    except (Error,OSError) as exc:row['preview_note']=exc.message if isinstance(exc,Error) else '媒体文件暂不可读取，请检查目录与磁盘状态。'

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
    """权限保持原规则；预览只读原文件，不再把上传体积上限用作流式读取上限。"""
    row=await r.media.inspect(r.p,uid) if private else await r.media.readable(uid,r.p)
    return await media_file_response(request,r,row)

async def media_file_response(request,r,row):
    """已授权记录或核对条目共用同一文件读取流程，调用方负责授权。"""
    if row['storage_kind']=='external':
        from .media_links import external_url
        return RedirectResponse(external_url(row['object_key']),307,headers={'Referrer-Policy':'no-referrer'})
    if row['storage_kind']!=r.kind:raise Error('此存储类型未接入当前媒体目录',404)
    store=inventory(r.media_store);key=row['object_key'];handle=None
    try:
        if hasattr(store,'open_reader'):
            handle,info,prefix=await run_in_threadpool(store.open_reader,key)
        else:
            info=await store.head(key)
            if info is None:raise Error('文件正文不存在，请核对媒体目录',404)
            prefix=await store.read_range(key,0,min(info['size'],512),info['version']) if info['size'] else b''
        size=info['size'];version=info['version'];mime=content_type(prefix,key)
        suffix=EXTENSIONS[mime][0] if mime in EXTENSIONS else PurePosixPath(key).suffix.lower().lstrip('.')
        from .media_names import disposition
        inline=(mime.startswith(('image/','video/')) or mime=='application/pdf') and request.query_params.get('download')!='1'
        headers={'Accept-Ranges':'bytes','ETag':'"'+version+'"','Content-Type':mime,
                 'Content-Disposition':disposition(row,mime,suffix,inline),
                 'Content-Security-Policy':"default-src 'none'; frame-ancestors 'self'",'Cache-Control':'private, no-store'}
        start,end=0,size-1;status=200
        selected=request.headers.get('range')
        if request.method!='HEAD' and selected and request.headers.get('if-range',headers['ETag'])==headers['ETag']:
            try:start,end=byte_range(selected,size)
            except ValueError:return Response(status_code=416,headers=headers|{'Content-Range':f'bytes */{size}'})
            status=206;headers['Content-Range']=f'bytes {start}-{end}/{size}'
        headers['Content-Length']=str(max(0,end-start+1))
        if request.method=='HEAD':return Response(status_code=200,headers=headers)
        if handle is not None:
            response=LocalMediaResponse(handle,start,max(0,end-start+1),status_code=status,headers=headers)
            handle=None # 响应接管句柄，包含尚未开始迭代即断开的情形。
            return response
        async def chunks():
            """R2每块最多1MiB，继续验证远端版本，避免拼接不同版本内容。"""
            offset=start
            while offset<=end:
                data=await store.read_range(key,offset,min(1048576,end-offset+1),version)
                yield data;offset+=len(data)
        return StreamingResponse(chunks(),status_code=status,headers=headers)
    except FileNotFoundError:raise Error('文件正文不存在，请核对媒体目录',404) from None
    except PermissionError:raise Error('网站运行账号没有读取此媒体文件的权限',503,'media_read_denied') from None
    except OSError:raise Error('媒体文件暂不可读取，请检查磁盘与目录状态后重试',503,'media_read_failed') from None
    finally:
        if handle is not None:handle.close()
