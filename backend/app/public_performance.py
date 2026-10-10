"""Deployment-only public policy: one definition for parsing and Worker export."""
from dataclasses import dataclass,field,fields
import os

def setting(default,name,minimum,maximum):
    return field(default=default,metadata={'env':name,'min':minimum,'max':maximum})

@dataclass(frozen=True)
class PublicPerformance:
    # Keep existing positional arguments stable; deployments use named export.
    public_cache_ttl_seconds:int=setting(1800,'TEACHER_PUBLIC_CACHE_TTL_SECONDS',0,86400)
    public_stream_concurrency:int=setting(2,'TEACHER_PUBLIC_STREAM_CONCURRENCY',1,4)
    public_page_cache_ttl_seconds:int=setting(300,'TEACHER_PUBLIC_PAGE_CACHE_TTL_SECONDS',0,3600)
    public_nav_prefetch_concurrency:int=setting(1,'TEACHER_PUBLIC_NAV_PREFETCH_CONCURRENCY',0,2)
    @property
    def public_cache_enabled(self):return self.public_cache_ttl_seconds>0
    def to_env(self):
        """Explicit field-to-variable mapping; never positional zip truncation."""
        return {f.metadata['env']:str(getattr(self,f.name)) for f in fields(self)}
    @classmethod
    def from_env(cls,env=None):
        env=os.environ if env is None else env
        values={}
        for f in fields(cls):
            name,lo,hi=f.metadata['env'],f.metadata['min'],f.metadata['max']
            raw=env.get(name) if callable(getattr(env,'get',None)) else getattr(env,name,None)
            if raw is None:values[f.name]=f.default;continue
            try:
                value=int(str(raw))
                if str(raw).strip()!=str(value) or not lo<=value<=hi:raise ValueError()
            except (ValueError,TypeError):raise ValueError(f'{name}={raw!r}: allowed {lo}..{hi}; default {f.default}') from None
            values[f.name]=value
        return cls(**values)

KEYS=tuple(f.metadata['env'] for f in fields(PublicPerformance))
