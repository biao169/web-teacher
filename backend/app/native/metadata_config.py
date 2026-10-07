"""论文服务白名单、原生设置转换与部署密钥状态；不扩展数据库结构。"""
import json,re
from .catalog import Error
PROVIDERS={'crossref':'Crossref','openalex':'OpenAlex','semantic-scholar':'Semantic Scholar','datacite':'DataCite','europe-pmc':'Europe PMC','pubmed':'PubMed'}
ENV_KEYS={'openalex':'TEACHER_OPENALEX_API_KEY','semantic-scholar':'TEACHER_SEMANTIC_SCHOLAR_API_KEY','pubmed':'TEACHER_PUBMED_API_KEY'}

def credentials(source):
    """只读取固定部署变量；密钥仅供后端请求使用，不放入页面或查询结果。"""
    return {key:str(source.get(env) or '') for key,env in ENV_KEYS.items()}|{'email':str(source.get('TEACHER_METADATA_EMAIL') or '')}

def parse_settings(values):
    """保留显式默认和启用顺序；全空配置提供Crossref及公共来源预设，不写库。"""
    from .service_config import provider_settings
    settings=provider_settings(values,'publication_metadata_provider','publication_metadata_providers',PROVIDERS,['crossref','datacite','europe-pmc','pubmed'])
    ttl=values.get('publication_suggestion_cache_seconds',60)
    if isinstance(ttl,bool) or not isinstance(ttl,int) or not 0<=ttl<=86400:raise Error('论文查询缓存时长应为0–86400秒')
    return settings|{'ttl':ttl}

async def load_settings(r):
    """使用最早一条全局设置，与现有网站配置读取策略一致。"""
    rows=await r.sql.query('SELECT updated_at,publication_metadata_provider,publication_metadata_providers,publication_suggestion_cache_seconds FROM global_settings ORDER BY id LIMIT 1')
    # Every settings save/restore invalidates old candidate-cache fingerprints.
    return parse_settings(rows[0] if rows else {})|{'stamp':rows[0]['updated_at'] if rows else ''}

def display_options(r,settings):
    """返回名称、顺序和密钥是否存在；不返回密钥内容或用户联系邮箱。"""
    secrets=getattr(r,'metadata_credentials',{})
    endpoints={'crossref':'https://api.crossref.org/works','openalex':'https://api.openalex.org/works','semantic-scholar':'https://api.semanticscholar.org/graph/v1/paper','datacite':'https://api.datacite.org/dois','europe-pmc':'https://www.ebi.ac.uk/europepmc/webservices/rest/search','pubmed':'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'}
    return [{'id':key,'label':name,'enabled':key in settings['enabled'],'position':settings['enabled'].index(key)+1 if key in settings['enabled'] else 0,'key_set':bool(secrets.get(key)),'env':ENV_KEYS.get(key,''),'endpoint':endpoints[key],'credential':('✓ 部署密钥已配置' if secrets.get(key) else '可尝试免密钥基础查询；常用查询建议配置API密钥' if key=='openalex' else '可尝试公共访问，额度由供应商控制' if key in ENV_KEYS else '公共查询，无需密钥'),'details':'默认查询只用所选服务；明确选择按配置回退时才依次尝试。'} for key,name in PROVIDERS.items()]


def form_settings(data):
    """将后端表单的启用复选项和排序输入转换成原生服务数组，无JavaScript也可提交。"""
    from .service_config import provider_form
    provider_form(data,'metadata','publication_metadata_providers',PROVIDERS)


async def page_options(r,values=None):
    """无效服务配置不阻塞论文手工编辑；选项显示禁用并允许管理员重新选择修复。"""
    try:settings=parse_settings(values) if values is not None else await load_settings(r)
    except Error:settings={'default':'crossref','enabled':[],'ttl':60}
    return display_options(r,settings)
