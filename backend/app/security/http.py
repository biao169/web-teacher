from dataclasses import dataclass
import json,os
from urllib.parse import urlsplit,parse_qs
from backend.app.native.catalog import Error
class AuthError(Error):
    """HTTP config errors retain a status and human-readable message."""
    def __init__(self,status,code,message):"""保存构造参数和适配器，供此对象后续操作复用。""";super().__init__(message,status)

@dataclass(frozen=True)
class AuthConfig:
    origin:str
    secure:bool

    allowed_origins:tuple[str,...]=()

    @classmethod
    def from_origin(cls,origin,allowed_origins=''):
        from .origins import parse_origins
        values=parse_origins(origin,allowed_origins)
        return cls(values[0],values[0].startswith('https:'),values)

    @classmethod
    def from_env(cls,env=None):
        env=os.environ if env is None else env
        return cls.from_origin(env.get('TEACHER_ORIGIN','http://127.0.0.1:'+env.get('TEACHER_PORT','8003')),env.get('TEACHER_ALLOWED_ORIGINS',''))

    def request_origin(self,request):
        """Resolve only an explicitly allowed Host, including behind a TLS proxy."""
        from .origins import normalize_origin
        host=request.headers.get('host','')
        try:
            value=normalize_origin(self.origin.split(':',1)[0]+'://'+host)
            if not host or any(c in host for c in '/?#@'):raise ValueError()
        except ValueError:
            raise AuthError(400,'HOST_INVALID','请使用允许的网站地址访问') from None
        if value not in (self.allowed_origins or (self.origin,)):
            raise AuthError(400,'HOST_INVALID','请使用允许的网站地址访问')
        return value

    def origin_matches(self,request):
        from .origins import normalize_origin
        try:
            value=normalize_origin(request.headers.get('origin',''))
            return value==self.request_origin(request) and request.headers.get('sec-fetch-site') in (None,'same-origin','none')
        except (ValueError,AuthError):return False

    def name(self,kind):"""根据HTTPS状态选择安全Cookie名称。""";return ('__Host-' if self.secure else '')+'ts_'+kind

    def set_cookie(self,response,kind,value,max_age):
        """写入受HttpOnly、Secure和SameSite约束的Cookie。"""
        response.set_cookie(self.name(kind),value,max_age=max_age,secure=self.secure,httponly=True,samesite='strict',path='/')

    def clear(self,response):
        """清除本服务指定的身份或防伪Cookie。"""
        for kind in ('session','csrf','login'):
            response.delete_cookie(self.name(kind),path='/',secure=self.secure,httponly=True,samesite='strict')

    def same_origin(self,request):
        if not self.origin_matches(request):
            raise AuthError(403,'ORIGIN_INVALID','请求来源不正确')

    def valid_host(self,request):
        self.request_origin(request)

async def payload(request,form=False,limit=16384,max_fields=20):
    """读取有大小限制的表单或JSON正文，并拒绝重复字段。"""
    expected='application/x-www-form-urlencoded' if form else 'application/json'
    if request.headers.get('content-type','').split(';')[0].strip()!=expected:
        raise AuthError(415,'CONTENT_TYPE_INVALID','请求格式不正确')
    buf=bytearray()
    async for chunk in request.stream():
        if len(buf)+len(chunk)>limit:raise AuthError(413,'BODY_TOO_LARGE','请求内容过大')
        buf.extend(chunk)
    try:
        if form:
            parsed=parse_qs(buf.decode('utf-8'),keep_blank_values=True,max_num_fields=max_fields,strict_parsing=True)
            if any(len(v)!=1 for v in parsed.values()):raise ValueError()
            return {k:v[0] for k,v in parsed.items()}
        def no_duplicates(pairs):
            """拒绝表单中重复的字段名，避免参数解释歧义。"""
            result={}
            for k,v in pairs:
                if k in result:raise ValueError()
                result[k]=v
            return result
        parsed=json.loads(buf.decode('utf-8'),object_pairs_hook=no_duplicates)
        if not isinstance(parsed,dict):raise ValueError()
        return parsed
    except (ValueError,UnicodeDecodeError):
        raise AuthError(400,'INPUT_INVALID','请求结构不正确') from None
