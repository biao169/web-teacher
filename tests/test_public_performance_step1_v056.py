from types import SimpleNamespace
import pytest
from backend.app.public_performance import PublicPerformance as P,KEYS

EXPECTED={'TEACHER_PUBLIC_CACHE_TTL_SECONDS':'1800','TEACHER_PUBLIC_STREAM_CONCURRENCY':'2','TEACHER_PUBLIC_PAGE_CACHE_TTL_SECONDS':'1800','TEACHER_PUBLIC_NAV_PREFETCH_CONCURRENCY':'1'}

def test_defaults_export_and_worker_namespace():
 assert P.from_env({}).to_env()==EXPECTED
 assert P.from_env(SimpleNamespace()).to_env()==EXPECTED
 assert set(KEYS)==set(EXPECTED)

def test_distinct_custom_values_round_trip():
 env=dict(zip(EXPECTED,('3600','4','125','2')))
 value=P.from_env(env)
 assert value.to_env()==env
 assert P.from_env(SimpleNamespace(**env))==value
 assert value.public_page_cache_ttl_seconds==125
 assert value.public_nav_prefetch_concurrency==2

@pytest.mark.parametrize('name,lo,hi',[(KEYS[0],0,86400),(KEYS[1],1,4),(KEYS[2],0,3600),(KEYS[3],0,2)])
def test_boundaries(name,lo,hi):
 for n in (lo,hi):assert P.from_env({name:str(n)}).to_env()[name]==str(n)
 for value in ('', 'abc','1.5',str(lo-1),str(hi+1)):
  with pytest.raises(ValueError) as exc:P.from_env({name:value})
  assert name in str(exc.value) and repr(value) in str(exc.value)
  assert f'{lo}..{hi}' in str(exc.value) and 'default' in str(exc.value)

def test_zero_new_features_does_not_disable_data_cache():
 p=P.from_env({'TEACHER_PUBLIC_PAGE_CACHE_TTL_SECONDS':'0','TEACHER_PUBLIC_NAV_PREFETCH_CONCURRENCY':'0'})
 assert p.public_cache_enabled and p.public_stream_concurrency==2

@pytest.mark.parametrize('name,value',[(KEYS[2],'3601'),(KEYS[3],'3')])
def test_build_settings_reject_new_invalid_values(name,value):
 from pipeline import settings
 with pytest.raises(ValueError,match=name):settings({name:value})
