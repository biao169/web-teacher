"""Native field registry, shared editor sections and server-side validation."""
import json,re
from datetime import datetime,timezone,timedelta
from pathlib import Path
from urllib.parse import urlsplit
try:
    from generated_native_resources import NATIVE
except ImportError:
    root=Path(__file__).resolve().parents[3]/'database/native'
    NATIVE={n:json.loads((root/(n+'.json')).read_text(encoding='utf-8')) for n in ('schema-spec','editor-contract')}
TABLES=NATIVE['schema-spec']['tables']
EDITORS=NATIVE['editor-contract']['tables']
MODULES={'profiles':'教师与团队','students':'学生','student_category_displays':'学生分类','research_interests':'研究方向','projects':'科研项目','publications':'论文','patents':'专利软著','courses':'课程','news':'新闻动态','navigation_items':'导航与按钮','site_settings':'网站设置','global_settings':'全局设置','translation_cache':'翻译','media_assets':'媒体库','messages':'留言','auth_users':'账号与权限','auth_roles':'角色与权限','operation_logs':'操作日志','data_tools':'数据与备份','transfer':'文件快传'}
CONTENT=('profiles','students','research_interests','projects','publications','patents','courses','news')
SECRET={f for t in TABLES.values() for f in t['columns'] if any(s in f for s in ('password_hash','api_key','client_secret','translator_key','token_hash'))}
READONLY={'id','uid','created_at','updated_at','last_login_at','is_system','translation_job_state','source_hash','source_ref_key','source_refs','error_message'}|SECRET
TITLE={t:next((f for f in ('name','title','label','site_name','username','source_ref_key','subject','action') if f in s['columns']),'uid') for t,s in TABLES.items()}
class Error(Exception):
    """Expected domain error rendered without SQL, credentials or tracebacks."""
    def __init__(self,message,status=422,code=None):"""保存构造参数和适配器，供此对象后续操作复用。""";self.message=message;self.status=status;self.code=code;super().__init__(message)
def now(after=None,seconds=0):
    """Canonical 24-character timestamps; strict monotonic update tokens avoid lost writes."""
    value=datetime.now(timezone.utc)+timedelta(seconds=seconds)
    if after:value=max(value,datetime.fromisoformat(after.replace('Z','+00:00'))+timedelta(milliseconds=1))
    return value.isoformat(timespec='milliseconds').replace('+00:00','Z')
def deletable(table):
    """Application delete capability; account deletion adds guards, not schema changes."""
    return table in ('auth_users','auth_roles') or TABLES.get(table,{}).get('deletable',False)

def fields(table):
    """Return only approved editable native fields, retaining hidden columns in storage."""
    if table not in TABLES:raise Error('功能不存在',404)
    e=EDITORS.get(table,{}).get('fields',{})
    # Activate the existing reserved cache field for metadata only; historical suggestions stay uncached.
    active_reserved={'publication_suggestion_cache_seconds'} if table=='global_settings' else set()
    return {k:v for k,v in TABLES[table]['columns'].items() if k not in READONLY and (k in active_reserved or e.get(k,{}).get('disposition','edit') in ('edit','generated_editable'))}
def label(table,field):"""从共享字段元数据取得后台中文标签。""";return EDITORS.get(table,{}).get('fields',{}).get(field,{}).get('label',field)
def sections(table):
    """One record editor with common section metadata; no separate relationship page."""
    valid=fields(table);result=[];used=set()
    for section in EDITORS.get(table,{}).get('sections',[]):
        names=[f for f in dict.fromkeys(section['fields']) if f in valid and f not in used]
        if names:result.append({'label':section['label'],'fields':names});used.update(names)
    rest=[f for f in valid if f not in used]
    if rest:result.append({'label':'其他设置','fields':rest})
    return result
def defaults(table):
    """Display schema defaults without inserting a record."""
    return {k:v.get('default',None) for k,v in TABLES[table]['columns'].items() if k!='id'}
def normalize(table,values,*,restore=False):
    """Reject unknown input; validate types, required values, links and native constraints."""
    # Full-record restore is internal-only; HTTP editors retain their existing allowlist.
    spec=({k:v for k,v in TABLES[table]['columns'].items() if k!='id'} if restore else fields(table));result={}
    if set(values)-set(spec):raise Error('不允许修改字段：'+', '.join(sorted(set(values)-set(spec))))
    for field,value in values.items():
        s=spec[field];kind=s['kind'];name=label(table,field)
        if value is None or value=='':
            if s.get('nullable'):result[field]=None;continue
            if 'default' in s:value=s['default']
            elif s.get('required'):raise Error(name+'不能为空')
            else:value=''
        if kind in ('integer','boolean'):
            if kind=='boolean' and isinstance(value,str):value={'true':1,'false':0,'on':1}.get(value,value)
            if isinstance(value,float) and not value.is_integer():raise Error(name+'必须是整数')
            try:value=int(value)
            except (TypeError,ValueError):raise Error(name+'必须是整数') from None
            if kind=='boolean' and value not in (0,1):raise Error(name+'必须为0或1')
            if not s.get('min',-9007199254740991)<=value<=s.get('max',9007199254740991):raise Error(name+'超出范围')
        elif kind=='json':
            try:value=json.loads(value) if isinstance(value,str) else value
            except ValueError:raise Error(name+'必须为有效JSON') from None
            wanted=list if s.get('jsonType')=='array' else dict
            if not isinstance(value,wanted):raise Error(name+'的JSON类型不正确')
            if field=='visibility_scopes' and (len(value)>5 or any(not isinstance(v,str) for v in value) or set(value)-{'public','authenticated','staff','owner','hidden'}):raise Error('可见范围不正确')
            value=json.dumps(value,ensure_ascii=False,separators=(',',':'))
        else:
            if not isinstance(value,str):raise Error(name+'必须是文本')
            value=value.strip()
            if '\x00' in value or len(value)>s.get('maxLength',200000):raise Error(name+'过长或包含无效字符')
            if s.get('required') and not value:raise Error(name+'不能为空')
            if len(value)<s.get('minLength',0):raise Error(name+'长度不足')
            if s.get('format')=='decimal' and not re.fullmatch(r'\d+(?:\.\d{1,4})?',value):raise Error(name+'使用非负金额，最多4位小数；单位万元')
            if s.get('format')=='date':
                try:datetime.strptime(value,'%Y-%m-%d')
                except ValueError:raise Error(name+'使用YYYY-MM-DD') from None
            if s.get('format')=='timestamp':
                try:parsed=datetime.fromisoformat(value.replace('Z','+00:00'));value=(parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)).isoformat(timespec='milliseconds').replace('+00:00','Z')
                except ValueError:raise Error(name+'日期时间无效') from None
            if field in ('url','homepage','personal_homepage','google_scholar','dblp','github','cnki','orcid') and value:
                p=urlsplit(value)
                if field=='orcid' and re.fullmatch(r'\d{4}-\d{4}-\d{4}-[\dX]{4}',value):pass
                elif p.scheme not in ('https','http') or not p.hostname or p.username or p.password:raise Error(name+'需要完整HTTP/HTTPS地址')
        if s.get('enum') and value not in s['enum']:raise Error(name+'选项无效')
        result[field]=value
    if table=='navigation_items':
        if result.get('url_name') and not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,79}',result['url_name']):raise Error('导航标识仅支持小写字母、数字、下划线和短横线')
        if result.get('path') and not result['path'].startswith(('/', 'https://','http://')):raise Error('导航路径无效')
        if (result.get('path') or '').startswith('//'):raise Error('不允许协议相对地址')
    if table=='news' and result.get('content_format')=='html' and 'content' in result:
        from backend.app.domain.richtext import clean
        result['content']=clean(result['content'] or '')[0]
    return result
