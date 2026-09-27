"""固定学术HTTPS地址和请求头校验，两个平台共享，不接受任意服务地址。"""
from urllib.parse import urlsplit
HOST_PATHS={'api.crossref.org':('/works',),'api.openalex.org':('/works',),'api.semanticscholar.org':('/graph/v1/paper/',),'api.datacite.org':('/dois',),'www.ebi.ac.uk':('/europepmc/webservices/rest/search',),'eutils.ncbi.nlm.nih.gov':('/entrez/eutils/esearch.fcgi','/entrez/eutils/esummary.fcgi')}
MAX_BYTES=1048576
TIMEOUT=6

def validate_request(url,headers=None):
    """验证精确主机、允许路径和有限请求头，禁止凭据地址、重定向及换行注入。"""
    p=urlsplit(url)
    if p.scheme!='https' or p.netloc not in HOST_PATHS or p.fragment or len(url)>6000 or any(ord(c)<32 for c in url):raise ValueError('Invalid provider URL')
    if not any(p.path==base or p.path.startswith(base.rstrip('/')+'/') for base in HOST_PATHS[p.netloc]):raise ValueError('Invalid provider path')
    headers=headers or {}
    if set(headers)-{'x-api-key'} or any(not isinstance(v,str) or len(v)>4096 or any(ord(c)<32 or ord(c)>126 for c in v) for v in headers.values()):raise ValueError('Invalid provider headers')
    if headers and p.netloc!='api.semanticscholar.org':raise ValueError('Invalid credential destination')
    return {'Accept':'application/json','User-Agent':'TeacherSite metadata assistant',**headers}
