"""六家论文服务的固定请求与字段映射；不返回摘要、附件或不受支持的业务字段。"""
import re
from urllib.parse import quote,urlencode
from .catalog import Error
from .publication_metadata import bounded_fields,crossref_fields,normalize_doi

class ProviderFailure(Exception):
    """仅携带可公开的状态枚举，禁止传递外部响应/请求地址中的秘密。"""
    def __init__(self,state):self.state=state

def mapping(value):
    """外部可选对象的类型保护。"""
    return value if isinstance(value,dict) else {}

def items(value):
    """限制单个服务的候选/作者数组扫描量。"""
    return value[:100] if isinstance(value,list) else []

def first(value):
    """读取外部数组首项，不把普通文本误当数组。"""
    return value[0] if isinstance(value,list) and value else None

def text_list(value,key=None):
    """规范作者、类型、关键词为分号文本；逐项类型和长度有界。"""
    parts=[mapping(x).get(key) if key else x for x in items(value)]
    return '; '.join(x.strip() for x in parts if isinstance(x,str) and len(x)<=400 and x.strip())

def year(value):
    """仅从已知日期字段读取四位年份。"""
    found=re.match(r'^(\d{4})',str(value or ''))
    return int(found[1]) if found else None

def candidate_fields(provider,row,doi=None):
    """将各提供方一条结果转换为同一可编辑字段白名单。"""
    row=mapping(row)
    if provider=='crossref':return crossref_fields({'message':row},doi)
    if provider=='openalex':
        location=mapping(row.get('primary_location'));biblio=mapping(row.get('biblio'))
        authors=items(row.get('authorships'))
        start=biblio.get('first_page');end=biblio.get('last_page')
        values={'title':row.get('title'),'doi':row.get('doi'),'authors':text_list([mapping(mapping(a).get('author')).get('display_name') for a in authors]),'corresponding_authors':text_list([mapping(mapping(a).get('author')).get('display_name') for a in authors if mapping(a).get('is_corresponding') is True]),'venue':mapping(location.get('source')).get('display_name'),'year':row.get('publication_year'),'volume':biblio.get('volume'),'issue':biblio.get('issue'),'pages':str(start)+('-'+str(end) if end and end!=start else '') if start else None,'url':location.get('landing_page_url'),'publication_type':row.get('type'),'keywords':text_list(row.get('keywords'),'display_name')}
    elif provider=='semantic-scholar':
        journal=mapping(row.get('journal'))
        values={'title':row.get('title'),'doi':mapping(row.get('externalIds')).get('DOI'),'authors':text_list(row.get('authors'),'name'),'venue':row.get('venue') or journal.get('name'),'year':row.get('year'),'volume':journal.get('volume'),'pages':journal.get('pages'),'url':row.get('url'),'publication_type':text_list(row.get('publicationTypes'))}
    elif provider=='datacite':
        row=mapping(row.get('attributes'));container=mapping(row.get('container'))
        values={'title':mapping(first(row.get('titles'))).get('title'),'doi':row.get('doi'),'authors':text_list(row.get('creators'),'name'),'venue':container.get('title'),'year':year(row.get('publicationYear')),'volume':container.get('volume'),'issue':container.get('issue'),'pages':('-'.join(str(x) for x in [container.get('firstPage'),container.get('lastPage')] if x is not None)),'url':row.get('url'),'publication_type':mapping(row.get('types')).get('resourceTypeGeneral'),'keywords':text_list(row.get('subjects'),'subject')}
    elif provider=='europe-pmc':
        info=mapping(row.get('journalInfo'))
        values={'title':row.get('title'),'doi':row.get('doi'),'authors':text_list(mapping(row.get('authorList')).get('author'),'fullName') or row.get('authorString'),'venue':mapping(info.get('journal')).get('title') or row.get('journalTitle'),'year':year(row.get('pubYear')),'volume':info.get('volume') or row.get('journalVolume'),'issue':info.get('issue') or row.get('issue'),'pages':row.get('pageInfo'),'publication_type':text_list(mapping(row.get('pubTypeList')).get('pubType')),'keywords':text_list(mapping(row.get('keywordList')).get('keyword'))}
    else:
        identifiers=items(row.get('articleids'));identifier=next((x.get('value') for x in identifiers if isinstance(x,dict) and x.get('idtype')=='doi'),None)
        values={'title':row.get('title'),'doi':identifier,'authors':text_list(row.get('authors'),'name'),'venue':row.get('fulljournalname'),'year':year(row.get('pubdate')),'volume':row.get('volume'),'issue':row.get('issue'),'pages':row.get('pages'),'publication_type':text_list(row.get('pubtype'))}
    result=bounded_fields(values,doi)
    if not result.get('title'):raise Error('结果缺少可用题名',502)
    if not result.get('url') and result.get('doi'):result['url']='https://doi.org/'+quote(result['doi'],safe='/')
    return result

async def retrieve(transport,provider,mode,query,credentials):
    """按固定来源执行最多两次GET；精确DOI必须匹配，题名返回最多5个候选供用户判断。"""
    headers={};params={};is_doi=mode=='doi';key=credentials.get(provider,'');email=credentials.get('email','')
    async def get(url,extra=None):
        """把状态码转换为可解释结果，不暴露外部正文或凭据。"""
        if extra:url+='?'+urlencode(extra)
        status,data=await transport.get(url,headers=headers) if headers else await transport.get(url)
        if status!=200:raise ProviderFailure({404:'not_found',429:'rate_limited',401:'not_configured',403:'blocked'}.get(status,'failed'))
        if not isinstance(data,dict):raise ProviderFailure('invalid_response')
        return data
    if provider=='crossref':
        url='https://api.crossref.org/works'+('/'+quote(query,safe='') if is_doi else '')
        if not is_doi:params.update({'query.bibliographic':query,'rows':5})
        if email:params['mailto']=email
        data=await get(url,params);message=data.get('message')
        if not isinstance(message,dict):raise ProviderFailure('invalid_response')
        rows=[message] if is_doi else message.get('items')
    elif provider=='openalex':
        url='https://api.openalex.org/works'+('/'+quote('https://doi.org/'+query,safe=':/') if is_doi else '')
        if not is_doi:params.update(search=query,per_page=5)
        if key:params['api_key']=key
        data=await get(url,params);rows=[data] if is_doi else data.get('results')
    elif provider=='semantic-scholar':
        url='https://api.semanticscholar.org/graph/v1/paper/'+('DOI:'+quote(query,safe='') if is_doi else 'search')
        params['fields']='title,authors,year,venue,journal,externalIds,url,publicationTypes'
        if not is_doi:params.update(query=query,limit=5)
        if key:headers['x-api-key']=key
        data=await get(url,params);rows=[data] if is_doi else data.get('data')
    elif provider=='datacite':
        url='https://api.datacite.org/dois'+('/'+quote(query,safe='') if is_doi else '')
        if not is_doi:params={'query':query,'page[size]':5}
        data=await get(url,params);rows=[data.get('data')] if is_doi else data.get('data')
    elif provider=='europe-pmc':
        term=query.replace('\\','\\\\').replace('"','\\"')
        data=await get('https://www.ebi.ac.uk/europepmc/webservices/rest/search',{'query':('DOI:"'+term+'"') if is_doi else 'TITLE:"'+term+'"','format':'json','pageSize':5,'resultType':'core'})
        rows=mapping(data.get('resultList')).get('result')
    else:
        term=query.replace('"',' ')
        params={'db':'pubmed','retmode':'json','tool':'teacher_site'}
        if key:params['api_key']=key
        if email:params['email']=email
        data=await get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',params|{'term':'"'+term+'"'+('[AID]' if is_doi else '[Title]'),'retmax':5,'sort':'relevance'})
        ids=mapping(data.get('esearchresult')).get('idlist')
        if not isinstance(ids,list):raise ProviderFailure('invalid_response')
        if not ids:return []
        if len(ids)>5 or any(not isinstance(x,str) or not re.fullmatch(r'\d{1,12}',x) for x in ids):raise ProviderFailure('invalid_response')
        data=await get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',params|{'id':','.join(ids)})
        result=mapping(data.get('result'));rows=[result.get(key) for key in ids]
    if not isinstance(rows,list):raise ProviderFailure('invalid_response')
    result=[];seen=set();invalid=False
    for record in rows[:5]:
        try:fields=candidate_fields(provider,record,query if is_doi else None)
        except (Error,ValueError,TypeError,AttributeError):invalid=True;continue
        signature=fields.get('doi') or (fields.get('title','').casefold(),fields.get('year'))
        if signature not in seen:result.append({'provider':provider,'fields':fields});seen.add(signature)
    if not result and invalid:raise ProviderFailure('invalid_response')
    return result
