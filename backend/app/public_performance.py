"""Deployment-only public performance policy, shared by Linux and Workers."""
from dataclasses import dataclass
import os
KEYS=('TEACHER_PUBLIC_CACHE_TTL_SECONDS','TEACHER_PUBLIC_STREAM_CONCURRENCY')
@dataclass(frozen=True)
class PublicPerformance:
    public_cache_ttl_seconds:int=1800
    public_stream_concurrency:int=2
    @property
    def public_cache_enabled(self):return self.public_cache_ttl_seconds>0
    @classmethod
    def from_env(cls,env=None):
        env=os.environ if env is None else env
        values=[]
        for name,default,lo,hi in zip(KEYS,(1800,2),(0,1),(86400,4)):
            raw=env.get(name) if hasattr(env,'get') else getattr(env,name,None)
            if raw is None:values.append(default);continue
            try:
                value=int(str(raw))
                if str(raw).strip()!=str(value) or not lo<=value<=hi:raise ValueError()
            except (ValueError,TypeError):raise ValueError(f'{name}={raw!r}: allowed {lo}..{hi}; default {default}') from None
            values.append(value)
        return cls(*values)
