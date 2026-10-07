"""六家学术服务的固定请求与字段映射；结果仅为人工核对候选，不保存论文。"""
import re
from urllib.parse import quote,urlencode
from .catalog import Error
from .publication_metadata import normalize_doi,bounded_fields,crossref_fields

def obj(value):
    """安全读取可选对象。"""
    return value if isinstance(value,dict) else {}

def items(value,limit=100):
    """只处理有限有效对象，不把字符串或错误结构当成数组。"""
    return [v for v in value[:limit] if isinstance(v,dict)] if isinstance(value,list) else []

def joined(values):
    """统一多值字段为分号文本，不拆分姓名中的逗号。"""
    return '; '.join(v.strip() for v in values if isinstance(v,str) and 0<len(v.strip())<=400)

def year_of(value):
    """从供应商日期取四位年份，最终范围由公共字段校验器核对。"""
    m=re.search(r'\b([12]\d{3})\b',str(value or ''))
    return int(m[1]) if m else None

def request_for(provider,kind,query,secrets):
    """仅拼接固定服务端点；题名/DOI及部署凭据始终作为编码参数。"""
    email=secrets.get('email','');key=secrets.get(provider,'');params={};headers={}
    if provider=='crossref':
        url='https://api.crossref.org/works'+('/'+quote(query,safe='') if kind=='doi' else '')
        if kind=='title':params={'query.title':query,'rows':5}
        if email:params['mailto']=email
    elif provider=='openalex':
        url='https://api.openalex.org/works'
        params={'filter':'doi:https://doi.org/'+query} if kind=='doi' else {'search':query}
        params.update({'per-page':5,'select':'id,doi,title,authorships,corresponding_author_ids,primary_location,publication_year,biblio,type,keywords'})
        if key:params['api_key']=key
    elif provider=='semantic-scholar':
        url='https://api.semanticscholar.org/graph/v1/paper/'+('DOI:'+quote(query,safe='') if kind=='doi' else 'search')
        params={'fields':'title,authors,year,venue,journal,externalIds,url,publicationTypes'}
        if kind=='title':params.update(query=query,limit=5)
        if key:headers['x-api-key']=key
    elif provider=='datacite':
        url='https://api.datacite.org/dois'+('/'+quote(query,safe='') if kind=='doi' else '')
        if kind=='title':params={'query':'titles.title:"'+query.replace('\\',' ').replace('"',' ')+'"','page[size]':5}
    elif provider=='europe-pmc':
        url='https://www.ebi.ac.uk/europepmc/webservices/rest/search'
        params={'query':('DOI' if kind=='doi' else 'TITLE')+':"'+query.replace('\\',' ').replace('"',' ')+'"','format':'json','resultType':'core','pageSize':5}
    else:
        url='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
        params={'db':'pubmed','term':'"'+query.replace('"',' ')+'"'+('[AID]' if kind=='doi' else '[Title]'),'retmode':'json','retmax':5,'sort':'relevance','tool':'teacher_site'}
        if email:params['email']=email
        if key:params['api_key']=key
    return url+('?' +urlencode(params) if params else ''),headers

def pubmed_summary(payload,secrets):
    """ESearch返回的最多5个纯数字PMID进入ESummary，不接受供应商提供的任意URL。"""
    search=obj(obj(payload).get('esearchresult'));ids=search.get('idlist')
    if not isinstance(ids,list):raise Error('PubMed检索响应格式无效',502)
    valid=[v for v in ids[:5] if isinstance(v,str) and re.fullmatch(r'\d{1,12}',v)]
    if not valid:return None
    params={'db':'pubmed','id':','.join(valid),'retmode':'json','tool':'teacher_site'}
    if secrets.get('pubmed'):params['api_key']=secrets['pubmed']
    if secrets.get('email'):params['email']=secrets['email']
    return 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?'+urlencode(params)

def extract(provider,payload,kind,query):
    """将不同响应压缩到最多5个白名单候选；精确DOI不接受不匹配或缺失的标识。"""
    if not isinstance(payload,dict) or payload.get('error'):raise Error('服务响应格式无效',502)
    if provider=='crossref':
        message=obj(payload.get('message'));records=[message] if kind=='doi' else message.get('items')
    elif provider=='openalex':records=payload.get('results')
    elif provider=='semantic-scholar':records=[payload] if kind=='doi' else payload.get('data')
    elif provider=='datacite':records=[payload.get('data')] if kind=='doi' else payload.get('data')
    elif provider=='europe-pmc':records=obj(payload.get('resultList')).get('result')
    else:
        result=obj(payload.get('result'));uids=result.get('uids')
        records=[result.get(v) for v in uids[:5] if isinstance(v,str)] if isinstance(uids,list) else None
    if not isinstance(records,list):raise Error('服务响应格式无效',502)
    candidates=[];seen=set();invalid=0
    for record in items(records,10):
        try:
            if provider=='crossref':
                rawdoi=record.get('DOI')
                fields=crossref_fields({'message':record},normalize_doi(rawdoi) if rawdoi else None)
                fields.update(bounded_fields({'publication_type':record.get('type'),'keywords':joined(record.get('subject',[])[:30]) if isinstance(record.get('subject'),list) else None},None))
            elif provider=='openalex':
                location=obj(record.get('primary_location'));biblio=obj(record.get('biblio'));authors=items(record.get('authorships'))
                first=biblio.get('first_page');last=biblio.get('last_page')
                fields={'title':record.get('title'),'doi':record.get('doi'),'authors':joined(obj(v.get('author')).get('display_name') for v in authors),'corresponding_authors':joined(obj(v.get('author')).get('display_name') for v in authors if v.get('is_corresponding') is True or (isinstance(record.get('corresponding_author_ids'),list) and isinstance(obj(v.get('author')).get('id'),str) and bool(obj(v.get('author')).get('id')) and obj(v.get('author')).get('id') in record['corresponding_author_ids'])),'venue':obj(location.get('source')).get('display_name'),'url':location.get('landing_page_url'),'year':record.get('publication_year'),'volume':biblio.get('volume'),'issue':biblio.get('issue'),'pages':str(first)+('-'+str(last) if last and last!=first else '') if first else None,'publication_type':record.get('type'),'keywords':joined(v.get('display_name') for v in items(record.get('keywords'),30))}
            elif provider=='semantic-scholar':
                journal=obj(record.get('journal'));types=record.get('publicationTypes')
                fields={'title':record.get('title'),'doi':obj(record.get('externalIds')).get('DOI'),'authors':joined(v.get('name') for v in items(record.get('authors'))),'venue':journal.get('name') or record.get('venue'),'year':record.get('year'),'volume':journal.get('volume'),'pages':journal.get('pages'),'url':record.get('url'),'publication_type':joined(types[:20]) if isinstance(types,list) else None}
            elif provider=='datacite':
                a=obj(record.get('attributes'));titles=items(a.get('titles'),1);container=obj(a.get('container'))
                fields={'title':titles[0].get('title') if titles else None,'doi':a.get('doi') or record.get('id'),'authors':joined(v.get('name') for v in items(a.get('creators'))),'year':a.get('publicationYear'),'venue':container.get('title'),'volume':container.get('volume'),'issue':container.get('issue'),'pages':container.get('firstPage'),'url':a.get('url'),'publication_type':obj(a.get('types')).get('resourceTypeGeneral'),'keywords':joined(v.get('subject') for v in items(a.get('subjects'),30))}
            elif provider=='europe-pmc':
                journal=obj(record.get('journalInfo'));keywords=obj(record.get('keywordList')).get('keyword');authors=items(obj(record.get('authorList')).get('author'))
                fields={'title':record.get('title'),'doi':record.get('doi'),'authors':joined(v.get('fullName') for v in authors) or record.get('authorString'),'venue':obj(journal.get('journal')).get('title') or record.get('journalTitle'),'year':year_of(record.get('pubYear') or journal.get('yearOfPublication')),'volume':journal.get('volume'),'issue':journal.get('issue'),'pages':record.get('pageInfo'),'keywords':joined(keywords[:30]) if isinstance(keywords,list) else None}
            else:
                types=record.get('pubtype');doi=next((v.get('value') for v in items(record.get('articleids')) if v.get('idtype')=='doi'),None)
                pmid=record.get('uid','')
                fields={'title':record.get('title'),'doi':doi,'authors':joined(v.get('name') for v in items(record.get('authors'))),'venue':record.get('fulljournalname') or record.get('source'),'year':year_of(record.get('pubdate')),'volume':record.get('volume'),'issue':record.get('issue'),'pages':record.get('pages'),'url':'https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/' if isinstance(pmid,str) and pmid.isdigit() else None,'publication_type':joined(types[:20]) if isinstance(types,list) else None}
            if kind=='doi' and (not fields.get('doi') or normalize_doi(fields['doi'])!=query):raise Error('论文DOI不匹配',502)
            fields=bounded_fields(fields,query if kind=='doi' else None)
            if not fields.get('title'):raise Error('缺少题名',502)
            identity=fields.get('doi') or (fields['title'].casefold(),fields.get('year'))
            if identity in seen:continue
            seen.add(identity);candidates.append({'provider':provider,'fields':fields})
            if len(candidates)==5:break
        except Error:invalid+=1
    if not candidates and invalid:raise Error('返回的论文标识或字段无效，请人工核对',502)
    return candidates
