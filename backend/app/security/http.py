from dataclasses import dataclass,field
import json,os
from urllib.parse import urlsplit,parse_qs
from backend.app.native.catalog import Error
from .origins import OriginPolicy
class AuthError(Error):
    """HTTP config errors retain a status and human-readable message."""
    def __init__(self,status,code,message):"""保存构造参数和适配器，供此对象后续操作复用。""";super().__init__(message,status)

@dataclass(frozen=True)
class AuthConfig:
    origin:str
    secure:bool

    allowed_origins:tuple=()
    _origins:OriginPolicy=field(init=False,repr=False,compare=False)

    def __post_init__(self):
        policy=OriginPolicy(self.origin,self.allowed_origins)
        if self.secure!=(urlsplit(policy.primary).scheme=='https'):
            raise ValueError('Cookie security must match configured origin')
        object.__setattr__(self,'origin',policy.primary)
        object.__setattr__(self,'allowed_origins',policy.allowed)
        object.__setattr__(self,'_origins',policy)

    @classmethod
    def from_origin(cls,origin,allowed_origins=()):
        if not isinstance(origin,str):raise ValueError('Expected one site origin')
        return cls(origin,urlsplit(origin).scheme=='https',allowed_origins)

    @classmethod
    def from_env(cls):
        """读取环境配置并生成来源与Cookie策略。"""
        return cls.from_origin(os.environ.get('TEACHER_ORIGIN','http://127.0.0.1:'+os.environ.get('TEACHER_PORT','8003')),os.environ.get('TEACHER_ALLOWED_ORIGINS',''))

    def name(self,kind):"""根据HTTPS状态选择安全Cookie名称。""";return ('__Host-' if self.secure else '')+'ts_'+kind

    def set_cookie(self,response,kind,value,max_age):
        """写入受HttpOnly、Secure和SameSite约束的Cookie。"""
        response.set_cookie(self.name(kind),value,max_age=max_age,secure=self.secure,httponly=True,samesite='strict',path='/')

    def clear(self,response):
        """清除本服务指定的身份或防伪Cookie。"""
        for kind in ('session','csrf','login'):
            response.delete_cookie(self.name(kind),path='/',secure=self.secure,httponly=True,samesite='strict')

    def request_origin(self,request):
        try:return self._origins.request_origin(request)
        except ValueError:raise AuthError(400,'HOST_INVALID','请使用配置的网站地址访问') from None

    def same_origin(self,request):
        self.request_origin(request)
        try:return self._origins.require_same_origin(request)
        except ValueError:raise AuthError(403,'ORIGIN_INVALID','请求来源不正确') from None

    def valid_host(self,request):
        self.request_origin(request)

    def is_site_url(self,url):
        return self._origins.is_site_url(url)

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
