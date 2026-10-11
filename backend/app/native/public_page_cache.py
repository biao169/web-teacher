"""Anonymous HTML cache adapters; bounded local storage shares the data budget."""
import asyncio,time
from collections import OrderedDict
from fastapi.responses import Response
from .public_http_cache import recovery_request

MAX_PAGE_BYTES=256*1024
MAX_PAGES=128
STALE_SECONDS=86400

class LocalPageStore:
    """Owned by PublicReadCache; all operations use its lock, clock and revision."""
    def __init__(self,owner):self.owner=owner;self.entries=OrderedDict();self.used=0
    def clear(self):self.entries.clear();self.used=0
    def evict(self):
        _,(_,body)=self.entries.popitem(last=False);self.used-=len(body)+512
    def trim(self,limit):
        for key,(until,body) in list(self.entries.items()):
            if until<=self.owner.clock():self.used-=len(body)+512;del self.entries[key]
        # HTML gets at most a quarter of the *same* budget, never an extra pool.
        while self.entries and (self.used>limit//4 or self.used+self.owner.used>limit or len(self.entries)>MAX_PAGES):self.evict()
    def get(self,key,revision):
        with self.owner.lock:
            limit,_=self.owner.budget.limits()
            if revision!=self.owner.revision:self.owner.invalidate();self.owner.revision=revision
            self.owner._trim(limit)
            entry=self.entries.get(key)
            if not limit or entry is None:return None
            self.entries.move_to_end(key);return entry[1]
    def put(self,key,revision,body,ttl):
        with self.owner.lock:
            limit,_=self.owner.budget.limits();self.owner._trim(limit)
            if revision!=self.owner.revision or ttl<=0 or not limit or len(body)>MAX_PAGE_BYTES or len(body)+512>limit//4:return False
            # Page insertion must not evict useful data just to retain HTML.
            if self.owner.used+len(body)+512>limit:return False
            previous=self.entries.pop(key,None)
            if previous:self.used-=len(previous[1])+512
            self.entries[key]=(self.owner.clock()+ttl,body);self.used+=len(body)+512
            self.trim(limit);return key in self.entries

class PageCache:
    """Request-local adapter. Only bytes are stored; response headers are rebuilt."""
    def __init__(self,r,key,revision,ttl):
        self.r,self.key,self.revision,self.ttl=r,key,revision,ttl
        self.cache=None;self.state='MISS';self.stale=None
    async def get(self):
        try:
            if self.r.kind=='local':
                body=self.r.sql.public_cache.pages.get(self.key,self.revision)
            else:
                from js import caches
                self.cache=await asyncio.wait_for(caches.open('teacher-public-pages-v1'),1)
                self.key=self.r.config.origin.rstrip('/')+'/.public-page-cache/'+self.key.removeprefix('W/').strip('"')
                response=await asyncio.wait_for(self.cache.match(self.key),1)
                if not response:return None
                length=int(response.headers.get('content-length') or -1)
                if response.status!=200 or not 0<=length<=MAX_PAGE_BYTES or response.headers.get('content-type')!='text/html; charset=utf-8' or response.headers.get('set-cookie'):
                    if response.body:await response.body.cancel()
                    return None
                created=float(response.headers.get('x-page-created') or 0)
                age=time.time()-created
                if not created or not 0<=age<self.ttl+STALE_SECONDS:
                    if response.body:await response.body.cancel()
                    return None
                body=(await asyncio.wait_for(response.text(),1)).encode('utf-8')
                if len(body)!=length:return None
                if age>=self.ttl:
                    self.stale=(body,created);return None
            if body is not None:self.state='HIT'
            return body
        except Exception:
            self.state='BYPASS';return None # Optional cache failures never replace business responses.
    async def put(self,response):
        if self.state=='BYPASS':return
        body=getattr(response,'body',None)
        if response.status_code!=200 or response.headers.get('content-type')!='text/html; charset=utf-8' or 'set-cookie' in response.headers or 'no-store' in response.headers.get('cache-control','') or not isinstance(body,bytes) or len(body)>MAX_PAGE_BYTES:
            self.state='BYPASS';return
        try:
            if self.r.kind=='local':
                if not self.r.sql.public_cache.pages.put(self.key,self.revision,body,self.ttl):self.state='BYPASS'
            elif self.cache is not None:
                from js import Response as JSResponse
                cached=JSResponse.new(body.decode('utf-8'))
                # Internal Cache API freshness is independent of browser policy.
                cached.headers.set('Content-Type','text/html; charset=utf-8')
                cached.headers.set('Content-Length',str(len(body)))
                cached.headers.set('Cache-Control',f'public, max-age={self.ttl+STALE_SECONDS}')
                cached.headers.set('X-Page-Created',str(time.time()))
                await asyncio.wait_for(self.cache.put(self.key,cached),1)
        except Exception:self.state='BYPASS'

def page_cache(request,r,etag,revision,fragment=False,uid=None):
    # Called only after public route, scope, query and canonical URL validation.
    if recovery_request(request):return None
    if not etag or r.p or request.headers.get('authorization') or fragment or uid or request.method not in ('GET','HEAD') or request.headers.get('range') or request.headers.get('if-match') or not r.public_performance.public_page_cache_ttl_seconds:return None
    if r.kind!='local' and getattr(r,'worker_cache_mode','simple')!='full':return None
    return PageCache(r,etag,revision,r.public_performance.public_page_cache_ttl_seconds)

def page_response(body,headers,etag):
    return Response(body,media_type='text/html',headers=dict(headers,ETag=etag,**{'X-Public-Page-Cache':'HIT'}))


def stale_response(request):
    """Request-local, same-representation fallback; never renew storage on failure."""
    if recovery_request(request) or not getattr(request.state,'public_recovery_eligible',False):return None
    candidate=getattr(request.state,'public_stale_page',None)
    if candidate is None:return None
    body,created,ttl,headers,etag=candidate
    age=time.time()-created
    if not ttl<=age<ttl+STALE_SECONDS:return None
    from email.utils import formatdate
    from uuid import uuid4
    trace=getattr(request.state,'request_id',None) or uuid4().hex
    request.state.request_id=trace
    headers=dict(headers,ETag=etag,Age=str(int(age)),Date=formatdate(created,usegmt=True))
    headers.update({'X-Public-Page-Cache':'STALE','X-Request-ID':trace,'Cloudflare-CDN-Cache-Control':'no-store'})
    # Sending an old success is distinct from caching an error. Date/Age retain its age.
    response=Response(b'' if request.method=='HEAD' else body,media_type='text/html',headers=headers)
    if request.method=='HEAD':response.headers['Content-Length']=str(len(body))
    return response
