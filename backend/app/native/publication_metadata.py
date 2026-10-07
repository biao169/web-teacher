"""有界 DOI 标准化与 Crossref 字段裁剪，只产生可核对的建议，不写论文。"""
import re
from urllib.parse import urlsplit
from .catalog import Error

LIMITS={'title':4000,'authors':20000,'venue':2000,'volume':200,'issue':200,'pages':500,'doi':200,'url':2000,'publication_type':500,'keywords':4000,'corresponding_authors':4000}

def normalize_doi(value):
    """接受 DOI 或 doi.org 链接，限制长度和字符，避免将任意地址交给服务适配器。"""
    if not isinstance(value,str) or len(value)>240:raise Error('DOI格式无效')
    value=re.sub(r'^(?:doi\s*:\s*|https?://(?:dx\.)?doi\.org/)', '',value.strip(),flags=re.I).lower()
    if not re.fullmatch(r'10\.\d{4,9}/[^\s<>?#]{1,180}',value):raise Error('DOI格式无效')
    return value

def bounded_fields(fields,doi=None):
    """裁剪外部或缓存字段，忽略空值和错误类型，不提供可执行链接及数据库额外字段。"""
    if not isinstance(fields,dict):raise Error('元数据服务返回格式无效，请重试',502)
    result={name:value.strip() for name,limit in LIMITS.items() if isinstance(value:=fields.get(name),str) and value.strip() and len(value)<=limit}
    if result.get('doi'):
        try:result['doi']=normalize_doi(result['doi'])
        except Error:raise Error('返回的DOI格式无效',502) from None
    if doi and result.get('doi') and result['doi']!=doi:raise Error('返回的DOI与查询不一致，请人工核对',502)
    if doi:result['doi']=doi
    if result.get('url'):
        # Candidate links must also meet the actual editor's URL rules before users can select them.
        try:
            link=urlsplit(result['url'])
            safe=link.scheme in ('http','https') and link.hostname and not link.username and not link.password and not re.search(r'[\s<>]',result['url'])
        except ValueError:safe=False
        if not safe:result.pop('url')
    year=fields.get('year')
    if isinstance(year,int) and not isinstance(year,bool) and 1000<=year<=9999:result['year']=year
    return result

def crossref_fields(payload,doi=None):
    """提取 Crossref 的有限作者、题名和卷期页，兼容缺失日期；异常结果返回可读错误。"""
    if not isinstance(payload,dict) or not isinstance(message:=payload.get('message'),dict):raise Error('元数据服务返回格式无效，请重试',502)
    def first(value):
        """仅从有效数组读取首项，防止字符串被截成单个字符。"""
        return value[0] if isinstance(value,list) and value else None
    authors=[]
    for author in (message.get('author') or [])[:100] if isinstance(message.get('author'),list) else []:
        if isinstance(author,dict):
            parts=[part.strip() for key in ('given','family') if isinstance(part:=author.get(key),str) and len(part)<=200]
            if parts:authors.append(' '.join(parts))
            elif isinstance(author.get('name'),str) and len(author['name'])<=400:authors.append(author['name'].strip())
    date=message.get('published');year=first(first(date.get('date-parts'))) if isinstance(date,dict) else None
    fields=bounded_fields({'title':first(message.get('title')),'authors':'; '.join(authors),'venue':first(message.get('container-title')),'year':year,'volume':message.get('volume'),'issue':message.get('issue'),'pages':message.get('page'),'doi':message.get('DOI'),'url':message.get('URL'),'publication_type':message.get('type')},doi)
    if not fields.get('title'):raise Error('未找到可用的论文元数据，请继续手动录入',502)
    return fields
