"""Five translation presets over native fields, with deployment secrets taking precedence."""
import re
from urllib.parse import urlsplit
from .catalog import Error
from .service_config import provider_settings,provider_form
from .media_links import external_url

PROVIDERS={'mymemory':'MyMemory','google':'Google Translate','deepl':'DeepL','microsoft':'Microsoft Translator','libretranslate':'LibreTranslate'}
KEY_FIELDS={'google':'google_translate_api_key','deepl':'deepl_api_key','microsoft':'microsoft_translator_key','libretranslate':'libretranslate_api_key'}
ENV_KEYS={'google':'TEACHER_GOOGLE_TRANSLATE_KEY','deepl':'TEACHER_DEEPL_API_KEY','microsoft':'TEACHER_MICROSOFT_TRANSLATOR_KEY','libretranslate':'TEACHER_LIBRETRANSLATE_API_KEY'}
DEPLOY_VARS=(*ENV_KEYS.values(),'TEACHER_TRANSLATION_HOSTS')
DEFAULT_ENDPOINTS={'mymemory':'https://api.mymemory.translated.net/get','google':'https://translation.googleapis.com/language/translate/v2','deepl':'https://api.deepl.com/v2/translate','microsoft':'https://api.cognitive.microsofttranslator.com','libretranslate':'https://libretranslate.com'}
PUBLIC_FIELDS=('translation_provider','translation_providers','translation_timeout_seconds','libretranslate_url','microsoft_translator_region','microsoft_translator_endpoint','mymemory_email')
SQL_FIELDS=(*PUBLIC_FIELDS,*KEY_FIELDS.values())

def credentials(source):
    """Read a fixed set of backend-only variables without exposing their values in UI DTOs."""
    return {k:str(source.get(v) or '') for k,v in ENV_KEYS.items()}

def allowed_hosts(source):
    """Custom translation hosts require an explicit deployment allowlist, not a form URL alone."""
    raw=str(source.get('TEACHER_TRANSLATION_HOSTS') or '')
    if len(raw)>2000:raise ValueError('Too many custom translation hosts')
    result=set()
    for name in raw.split(','):
        if not name.strip():continue
        parsed=urlsplit(external_url('https://'+name.strip()))
        if parsed.path not in ('','/') or parsed.query or parsed.fragment or parsed.port:raise ValueError('Invalid custom translation host')
        result.add(parsed.hostname)
    return result

def endpoint(value,default):
    """Retain a public HTTPS base path but reject userinfo, queries, fragments and custom ports."""
    normalized=external_url(value or default);p=urlsplit(normalized)
    if p.scheme!='https' or p.query or p.fragment or p.port not in (None,443):raise Error('翻译地址须为HTTPS服务根地址，不含参数、锚点或非标准端口')
    return normalized.rstrip('/')

def parse_settings(values,secrets=None):
    """Use MyMemory when empty; a previously configured Google key retains the old effective default."""
    secrets=secrets or {};keys={k:secrets.get(k) or values.get(f) or '' for k,f in KEY_FIELDS.items()}
    for key in keys.values():
        if not isinstance(key,str) or len(key)>4096 or any(ord(c)<33 or ord(c)>126 for c in key):raise Error('翻译密钥须为不含空白的ASCII文本，最多4096字符')
    recommended=['google'] if keys['google'] else ['mymemory']
    settings=provider_settings(values,'translation_provider','translation_providers',PROVIDERS,recommended)
    timeout=values.get('translation_timeout_seconds',15)
    if isinstance(timeout,bool) or not isinstance(timeout,int) or not 1<=timeout<=120:raise Error('翻译总等待时间须为1–120秒')
    email=values.get('mymemory_email') or '';region=values.get('microsoft_translator_region') or ''
    if not isinstance(email,str) or (email and (len(email)>254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email))):raise Error('MyMemory联系邮箱格式无效')
    if not isinstance(region,str) or (region and not re.fullmatch('[a-z][a-z0-9-]{0,49}',region)):raise Error('Microsoft区域须与资源一致，例如eastasia；全球资源可留空')
    endpoints=DEFAULT_ENDPOINTS|{'libretranslate':endpoint(values.get('libretranslate_url'),DEFAULT_ENDPOINTS['libretranslate']),'microsoft':endpoint(values.get('microsoft_translator_endpoint'),DEFAULT_ENDPOINTS['microsoft'])}
    if keys['deepl'].endswith(':fx'):endpoints['deepl']='https://api-free.deepl.com/v2/translate'
    return settings|{'timeout':timeout,'keys':keys,'endpoints':endpoints,'email':email,'region':region}

async def load_settings(r):
    """Read only the earliest global settings row and resolve backend-only effective credentials."""
    rows=await r.sql.query('SELECT '+','.join(SQL_FIELDS)+' FROM global_settings ORDER BY id LIMIT 1')
    return parse_settings(rows[0] if rows else {},getattr(r,'translation_credentials',{}))

def form_settings(data):
    """Reuse the native shared checkbox/order parser for the five translation services."""
    provider_form(data,'translation','translation_providers',PROVIDERS)

def availability(config,provider,hosts=()):
    """Separate disabled, missing credentials and unapproved custom hosts before sending text."""
    if provider not in config['enabled']:return 'disabled','未启用'
    host=urlsplit(config['endpoints'][provider]).hostname
    official=urlsplit(DEFAULT_ENDPOINTS[provider]).hostname
    if host not in (official,'api-free.deepl.com' if provider=='deepl' else official) and host not in hosts:return 'not_configured','自建服务域名尚未在部署配置中允许'
    if provider in ('google','deepl','microsoft') and not config['keys'][provider]:return 'not_configured','需要配置服务密钥'
    if provider=='libretranslate' and host=='libretranslate.com' and not config['keys'][provider]:return 'not_configured','官方托管服务需要密钥；自建实例按其规则配置'
    return 'ready',('免密钥通道，仍受来源额度和可用性限制' if provider=='mymemory' else '参数已准备，可显式测试连接')

def display_options(r,config):
    """Return effective addresses and credential presence, never key contents or contacts."""
    rows=[]
    for key,label in PROVIDERS.items():
        state,message=availability(config,key,getattr(r,'translation_hosts',()))
        rows.append({'id':key,'label':label,'enabled':key in config['enabled'],'position':config['enabled'].index(key)+1 if key in config['enabled'] else 0,'key_set':bool(config['keys'].get(key)),'env':ENV_KEYS.get(key,''),'endpoint':config['endpoints'][key],'state':state,'credential':(('✓ 密钥已配置 · ' if config['keys'].get(key) else '○ 未配置密钥 · ') if key in KEY_FIELDS else '')+message,'details':('每段最多500字节；本站单次最多20请求，逐段串行。' if key=='mymemory' else '仅显式调用；不会自动把原文发送给其他服务。')})
    return rows

async def page_options(r,values=None):
    """Decorate settings with stored-key presence while retaining an invalid draft for repair."""
    try:
        if values is None:config=await load_settings(r)
        else:
            saved=await r.sql.query('SELECT '+','.join(KEY_FIELDS.values())+' FROM global_settings WHERE uid=?',(values.get('uid',''),))
            config=parse_settings((saved[0] if saved else {})|values,getattr(r,'translation_credentials',{}))
        return display_options(r,config),config['default']
    except Error:
        config=parse_settings({});config['enabled']=[]
        return display_options(r,config),''
