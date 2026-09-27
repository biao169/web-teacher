"""共用DOI/题名检索、逐服务回退和有界缓存；没有论文写入或常驻任务。"""
import asyncio,hashlib,json,re,time
from .catalog import Error
from .navigation import in_scope
from .metadata_config import PROVIDERS,load_settings
from .metadata_sources import request_for,pubmed_summary,extract
from .publication_metadata import normalize_doi,bounded_fields
STATUS={'success':'✓ 查询成功','not_found':'未找到匹配记录','rate_limited':'请求受限，请稍后重试','not_configured':'服务未配置或未启用','blocked':'服务拒绝访问，请核对凭据','timeout':'查询超时','failed':'服务暂不可用或返回格式无效','budget':'本次等待已达上限，未继续请求'}
MAX_CACHE=196608

class MetadataSearch:
    def __init__(self,r):
        """复用当前请求的身份、原生SQL与本地/R2缓存适配器。"""
        self.r=r
    async def authorize(self,uid,nav='',stamp='',read_only=False):
        """独立检索只需查看；表单检索需要新增/编辑并符合记录与导航固定范围。"""
        r=self.r
        if not isinstance(uid,str) or len(uid)>128 or not isinstance(nav,str) or len(nav)>80:raise Error('查询上下文无效')
        r.auth.require(r.p,'publications','view' if read_only else ('edit' if uid else 'create'))
        record=await r.content.get('publications',uid,r.p) if uid else None
        if nav:
            entry,table,base=await r.content.navigation(nav,r.p)
            if table!='publications' or entry['updated_at']!=stamp:raise Error('导航配置已变化，请重新打开页面',409)
            if record and not in_scope(table,record,base):raise Error('论文不在当前固定范围',403)
    async def cached(self,key,fingerprint,kind,query,ttl):
        """固定64个缓存槽；严格匹配查询摘要、期限与字段，坏缓存退回服务查询。"""
        if not ttl:return None
        try:
            raw=await self.r.cache_store.get(key,max_bytes=MAX_CACHE)
            cache=json.loads(raw) if raw else None
            if not isinstance(cache,dict) or cache.get('fingerprint')!=fingerprint:return None
            at=cache.get('created')
            if isinstance(at,bool) or not isinstance(at,(int,float)) or not 0<=time.time()-at<min(ttl,cache.get('ttl',0)):return None
            rows=cache.get('candidates')
            if not isinstance(rows,list) or not 1<=len(rows)<=5:return None
            clean=[]
            for row in rows:
                if not isinstance(row,dict) or row.get('provider') not in PROVIDERS:return None
                fields=bounded_fields(row.get('fields'),query if kind=='doi' else None)
                if not fields.get('title'):return None
                clean.append({'provider':row['provider'],'fields':fields})
            return clean
        except Exception:return None
    async def source(self,provider,kind,query):
        """一次服务尝试；PubMed使用搜索和汇总两步，不请求全文或附件。"""
        transport=getattr(self.r,'scholarly',None)
        if not transport:return 'not_configured',[]
        secrets=getattr(self.r,'metadata_credentials',{})
        url,headers=request_for(provider,kind,query,secrets)
        status,payload=await transport.get(url,headers) if headers else await transport.get(url)
        if status==200 and provider=='pubmed':
            summary=pubmed_summary(payload,secrets)
            if not summary:return 'not_found',[]
            status,payload=await transport.get(summary)
        if status!=200:return {404:'not_found',429:'rate_limited',401:'blocked',403:'blocked'}.get(status,'failed'),[]
        candidates=extract(provider,payload,kind,query)
        return ('success' if candidates else 'not_found'),candidates
    async def search(self,query,kind='auto',provider='default',uid='',nav='',nav_stamp='',read_only=False,correspondence=False):
        """默认单服务或显式按配置回退；最多六服务、每次服务8秒、总等待20秒。"""
        await self.authorize(uid,nav,nav_stamp,read_only)
        if type(correspondence) is not bool:raise Error('通讯作者补查选项无效')
        if not isinstance(query,str) or not 1<=len(query.strip())<=350 or any(ord(c)<32 for c in query):raise Error('请输入1–350字的DOI或题名')
        query=query.strip()
        if kind not in ('auto','doi','title'):raise Error('查询类型无效')
        if kind=='auto':kind='doi' if re.match(r'^(10\.|doi\s*:|https?://)',query,re.I) else 'title'
        if kind=='doi':query=normalize_doi(query)
        elif len(query)<2:raise Error('题名至少填写2个字符')
        if not isinstance(provider,str) or provider not in ('default','fallback',*PROVIDERS):raise Error('论文服务选项无效')
        settings=await load_settings(self.r)
        choices=settings['enabled'] if provider=='fallback' else [settings['default'] if provider=='default' else provider]
        attempts=[];result=[];deadline=time.monotonic()+20
        for name in choices:
            state='not_configured';hit=False;candidates=[]
            if name in settings['enabled']:
                secret=getattr(self.r,'metadata_credentials',{}).get(name,'')
                digest=hashlib.sha256(json.dumps([4,name,kind,query,secret,settings.get('stamp','')],ensure_ascii=False).encode()).hexdigest()
                key='metadata/v2/'+format(int(digest[:2],16)%64,'02x')+'.json'
                candidates=await self.cached(key,digest,kind,query,settings['ttl'])
                if candidates and any(c['provider']!=name for c in candidates):candidates=None
                if candidates:state='success';hit=True
                else:
                    supplement_cached=False;remaining=deadline-time.monotonic()
                    if remaining<=0:state='budget'
                    else:
                        try:state,candidates=await asyncio.wait_for(self.source(name,kind,query),min(8,remaining))
                        except (TimeoutError,asyncio.TimeoutError):state='timeout'
                        except Exception:state='failed' # Never return URLs, keys or vendor exception bodies to the browser.
                    if state=='success' and settings['ttl']:
                        body=json.dumps({'fingerprint':digest,'created':time.time(),'ttl':settings['ttl'],'candidates':candidates},ensure_ascii=False).encode()
                        if len(body)<=MAX_CACHE:
                            try:await self.r.cache_store.put(key,body)
                            except Exception:pass
            attempts.append({'provider':name,'label':PROVIDERS[name],'status':state,'message':STATUS[state],'cached':hit})
            if state=='success':result=candidates;break
            if state=='budget':break
        # Supplement only exact DOI matches, without replacing primary bibliographic fields.
        if correspondence and result and 'openalex' in settings['enabled']:
            supplements={}
            for candidate in result:
                fields=candidate['fields'];doi=fields.get('doi')
                if fields.get('corresponding_authors') or not doi or candidate['provider']=='openalex':continue
                if doi not in supplements:
                    supplement_cached=False;remaining=deadline-time.monotonic()
                    if remaining<=0:state,extra='budget',[]
                    else:
                        try:
                            supplement=await asyncio.wait_for(self.search(doi,'doi','openalex',uid,nav,nav_stamp,read_only,False),min(8,remaining))
                            state=supplement['attempts'][-1]['status'];extra=supplement['candidates'];supplement_cached=bool(supplement['attempts'][-1].get('cached'))
                        except (TimeoutError,asyncio.TimeoutError):state,extra='timeout',[]
                        except Exception:state,extra='failed',[]
                    supplements[doi]=next((v['fields'].get('corresponding_authors') for v in extra if v['fields'].get('doi')==doi),None)
                    attempts.append({'provider':'openalex','label':'OpenAlex 通讯作者补查','status':state,'message':STATUS[state]+('（未提供通讯作者标记）' if state=='success' and not supplements[doi] else ''),'cached':supplement_cached})
                if supplements[doi]:fields['corresponding_authors']=supplements[doi];candidate['correspondence_provider']='openalex'
        # Recheck fixed navigation before returning to a still-open editor.
        await self.authorize(uid,nav,nav_stamp,read_only)
        return {'kind':kind,'candidates':result,'attempts':attempts,'status':'success' if result else 'empty'}
