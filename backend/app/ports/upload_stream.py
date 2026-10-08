"""Request-local native upload handle; never retain a body across requests."""
from contextvars import ContextVar
from contextlib import contextmanager
_current=ContextVar('native_upload',default=None)
PATHS=frozenset(('/api/admin/media/upload/file','/api/admin/media-picker/upload/file','/api/admin/media-picker/crop/file'))
@contextmanager
def bind(request,binding):
    token=_current.set((request,binding))
    try:yield
    finally:_current.reset(token)
def current():return _current.get()

async def put(key,extension,limit,allowed_mimes,validate_bytes,session=None):
    import json,re
    from backend.app.native.catalog import Error
    from backend.app.ports.operations import current as trace,stage
    value=current()
    if value is None:raise Error('原生上传上下文缺失，请核对主站部署版本',503)
    request,binding=value
    if binding is None:raise Error('原生上传服务未绑定，请重新部署完整版本',503)
    size=str(request.headers.get('content-length') or '')
    if not size.isdigit():raise Error('上传需要明确的文件大小，请使用后台文件选择上传',411)
    size=int(size)
    if not 0<size<=limit:raise Error('文件为空或超过上传大小限制',413)
    q={'key':key,'session':session,'extension':extension,'size':size,'limit':limit,'crop':bool(validate_bytes),'allowed_mimes':list(allowed_mimes or []),'request_id':trace().get('request_id','')}
    try:
        with stage('media-native-stream',bytes=size):
            raw=str(await binding.upload_media(request.body,json.dumps(q)))
            if len(raw)>140000:raise ValueError('native result bound')
            result=json.loads(raw)
    except Exception as exc:
        raise Error('原生上传服务调用失败，请按请求 ID 查看媒体上传日志',503) from exc
    if not isinstance(result,dict):raise Error('原生上传响应格式错误',503)
    if not result.get('ok'):
        code=result.get('code','MEDIA_NATIVE_FAILED');status=result.get('status',503)
        if code not in ('MEDIA_TYPE','MEDIA_SIZE','MEDIA_LENGTH','MEDIA_STORAGE','MEDIA_STREAM','MEDIA_REQUEST','MEDIA_SESSION','MEDIA_EXPIRED'):code='MEDIA_NATIVE_FAILED'
        raise Error('原生上传失败：'+code,status if status in (400,409,411,413,503) else 503)
    if result.get('mime') not in ('image/png','image/jpeg','image/webp','image/gif','application/pdf','application/zip','video/mp4','video/webm'):raise Error('原生上传类型响应错误',503)
    if allowed_mimes and result['mime'] not in allowed_mimes:raise Error('媒体类型不适用于当前字段',400)
    if result.get('size')!=size or not re.fullmatch('[a-f0-9]{64}',str(result.get('checksum',''))):raise Error('原生上传响应不完整',503)
    if validate_bytes:
        from backend.app.native.media_image import crop_dimensions
        if validate_bytes is not crop_dimensions:raise Error('原生上传不支持此校验器',400)
        try:
            prefix=bytes.fromhex(result['prefix']);tail=bytes.fromhex(result['tail'])
        except (ValueError,KeyError,TypeError) as exc:raise Error('原生上传头部响应无效',503) from exc
        if len(prefix)!=min(size,65536) or len(tail)!=min(size,2):raise Error('原生上传头部长度无效',503)
        validate_bytes(prefix+(tail if size>len(prefix) else b''),result['mime'])
    return size,result['mime'],result['checksum']
