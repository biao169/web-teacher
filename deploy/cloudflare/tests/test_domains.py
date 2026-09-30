from pathlib import Path
import sys
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from domains import settings, apply


def test_derive_workers_dev():
    c=settings({'TEACHER_WORKERS_SUBDOMAIN':'my-account'},'teacher-site')
    assert c['origin']=='https://teacher-site.my-account.workers.dev'
    assert c['workers_dev'] is True


def test_custom_domain_without_origin():
    c=settings({'TEACHER_CUSTOM_DOMAIN':'faculty.university.edu','TEACHER_WORKERS_DEV':'false'},'teacher-site')
    cfg={};apply(cfg,c)
    assert c['origin']=='https://faculty.university.edu'
    assert cfg=={'workers_dev':False,'routes':[{'pattern':'faculty.university.edu','custom_domain':True}]}


def test_legacy_origin_still_works():
    c=settings({'TEACHER_ORIGIN':'https://TEACHER.MY-ACCOUNT.workers.dev/'},'teacher')
    assert c['origin']=='https://teacher.my-account.workers.dev'
    cfg={};apply(cfg,c)
    assert 'routes' not in cfg


@pytest.mark.parametrize('env', [
    {}, {'TEACHER_WORKERS_SUBDOMAIN':'https://my.workers.dev'},
    {'TEACHER_CUSTOM_DOMAIN':'https://faculty.university.edu'},
    {'TEACHER_CUSTOM_DOMAIN':'*.university.edu'},
    {'TEACHER_ORIGIN':'http://faculty.university.edu'},
    {'TEACHER_ORIGIN':'https://user:pass@faculty.university.edu'},
    {'TEACHER_ORIGIN':'https://faculty.university.edu/path'},
    {'TEACHER_ORIGIN':'https://faculty.university.edu?x=1'},
    {'TEACHER_ORIGIN':'https://example.com'},
    {'TEACHER_ORIGIN':'https://faculty.university.edu','TEACHER_CUSTOM_DOMAIN':'other.university.edu'},
    {'TEACHER_ORIGIN':'https://teacher.account.workers.dev','TEACHER_WORKERS_DEV':'false'},
    {'TEACHER_ORIGIN':'https://teacher.account.workers.dev','TEACHER_WORKERS_DEV':'maybe'},
])
def test_invalid_configuration(env):
    with pytest.raises(ValueError):settings(env,'teacher')


def test_existing_auth_and_seo_follow_generated_origin():
    sys.path.insert(0,str(Path(__file__).resolve().parents[3]))
    from backend.app.security.http import AuthConfig
    from backend.app.native.public_seo import robots
    from types import SimpleNamespace
    origin=settings({'TEACHER_CUSTOM_DOMAIN':'faculty.university.edu'},'teacher')['origin']
    auth=AuthConfig.from_origin(origin)
    auth.same_origin(SimpleNamespace(headers={'origin':origin,'sec-fetch-site':'same-origin'}))
    auth.valid_host(SimpleNamespace(headers={'host':'faculty.university.edu'}))
    with pytest.raises(Exception):auth.same_origin(SimpleNamespace(headers={'origin':'https://old.account.workers.dev'}))
    assert (origin+'/sitemap.xml').encode() in robots(origin).body
