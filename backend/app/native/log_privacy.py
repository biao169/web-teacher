"""操作日志的有界脱敏展示；未知详情字段默认隐藏，不输出原始请求或凭据。"""
import json,re,math
from urllib.parse import urlsplit,urlunsplit

HIDDEN='[已隐藏]'
DETAIL_LIMIT=65536
SAFE_KEYS={'fields','changes','before','after','old','new','status','action','module','target_uid','uid','user_uid',
           'source_uid','news_uid','source','source_title','source_url','title','url','field','count','total','affected',
           'success','failed','skipped','created','updated','deleted','reason','code','error_code','message','items',
           'format','filename','size','mime_type','tables','table','provider','duration_ms','elapsed_ms','page','pages'}
SECRET_KEY=re.compile(r'password|passwd|passphrase|secret|token|credential|authorization|cookie|apikey|privatekey|csrf|fingerprint|useragent|connectionstring|dsn|^session$|^headers$|^body$|^content$|^payload$|^request$|^response$',re.I)
ASSIGNMENT=re.compile(r'(?i)\b(?:password|passwd|passphrase|secret|token|api[_-]?key|authorization|cookie|csrf|credential)\b[\w-]*[\s"\']*[:=][^\r\n]*')
EMAIL=re.compile(r'(?i)[\w.+-]+@[\w.-]+\.[a-z]{2,}')
BEARER=re.compile(r'(?i)\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=~-]+')
JWT=re.compile(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b')

def text(value):
    """隐藏文本中的常见凭据、邮箱和网络地址，剥除URL认证、查询及片段。"""
    if not isinstance(value,str):return value
    if len(value)>2048:return '[文本超过展示上限，未输出原文]'
    value=BEARER.sub(HIDDEN,value);value=JWT.sub(HIDDEN,value)
    def url(match):
        """保留可读来源路径，URL用户信息、查询值和锚点不进入日志界面。"""
        try:
            parsed=urlsplit(match.group());host=parsed.hostname or ''
            return urlunsplit((parsed.scheme,host,parsed.path,'[已隐藏]' if parsed.query else '',''))
        except ValueError:return HIDDEN
    value=re.sub(r'https?://[^\s<>"\']+',url,value)
    value=ASSIGNMENT.sub(HIDDEN,value);value=EMAIL.sub('[邮箱已隐藏]',value)
    value=re.sub(r'(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])','[IP已隐藏]',value)
    value=re.sub(r'(?<!\w)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\w)','[电话已隐藏]',value)
    return value

def detail(raw):
    """只公开已知诊断键，限制64Ki字符、深度8和1000节点；异常JSON不回显原文。"""
    if not isinstance(raw,str) or len(raw)>DETAIL_LIMIT:return {'notice':'详情超过展示上限，未输出原文'}
    try:value=json.loads(raw)
    except (ValueError,RecursionError):return {'notice':'详情格式无效，未输出原文'}
    if not isinstance(value,dict):return {'notice':'详情格式无效，未输出原文'}
    budget=[1000]
    def walk(item,depth=0):
        """递归脱敏；嵌套JSON字符串同样校验，预算耗尽时终止展开。"""
        budget[0]-=1
        if depth>8 or budget[0]<0:return '[详情已截断]'
        if isinstance(item,dict):
            result={}
            for key,child in list(item.items())[:100]:
                normalized=re.sub(r'[^a-z0-9]','',key.lower());safe_key=text(key)[:100]
                if SECRET_KEY.search(normalized):result[safe_key]=HIDDEN
                elif key not in SAFE_KEYS:result[safe_key]='[未公开字段]'
                else:result[safe_key]=walk(child,depth+1)
            if len(item)>100:result['_notice']='[其余字段已省略]'
            return result
        if isinstance(item,list):
            values=[walk(child,depth+1) for child in item[:100]]
            return values+(['[其余项目已省略]'] if len(item)>100 else [])
        if isinstance(item,str):
            if item.lstrip().startswith(('{','[')):
                try:return walk(json.loads(item),depth+1)
                except (ValueError,RecursionError):return '[嵌套详情格式无效，未输出原文]'
            return text(item)
        if isinstance(item,float) and not math.isfinite(item):return '[无效数值]'
        return item
    return walk(value)

def record(row,include_detail=False):
    """列表、详情和导出共享同一脱敏结果，不改变数据库原始日志。"""
    result={key:text(value) for key,value in row.items() if key!='detail_json'}
    if include_detail:result['detail_json']=detail(row.get('detail_json','{}'))
    return result
