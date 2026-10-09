"""No secondary business reads in initial HTML; original fragment contract retained."""
import re
import pytest
from test_accounts_regression import fixture
from test_public_home_step2 import configure,add,DOM

@pytest.mark.parametrize('lang',['zh','en'])
def test_initial_shell_does_not_query_secondary_modules(fixture,monkeypatch,lang):
    c,r=fixture
    configure(r,homepage_publication_limit=6,homepage_news_limit=5,homepage_project_limit=10,homepage_student_limit=5,homepage_patent_limit=5)
    calls=[];original=r.sql.query
    async def query(sql,*args,**kwargs):calls.append(sql);return await original(sql,*args,**kwargs)
    monkeypatch.setattr(r.sql,'query',query);c.cookies.clear()
    from backend.app.native.content import Content
    original_listing=Content.listing
    async def listing(self,table,*args,**kwargs):
        assert table=='profiles', 'Secondary module listing in initial HTML: '+table
        return await original_listing(self,table,*args,**kwargs)
    with monkeypatch.context() as guarded:
        guarded.setattr(Content,'listing',listing)
        response=c.get('/'+lang)
    assert response.status_code==200
    # Shared translation eligibility may contain indexed EXISTS against donor tables.
    # Do not remove cross-module translation reuse to meet a textual SQL assertion.
    tables=set(t.lower() for sql in calls if 'translation_cache' not in sql for t in re.findall(r'\b(?:FROM|JOIN)\s+["`]?([a-z_]+)',sql,re.I))
    assert not tables & {'publications','projects','news','students','patents'}
    streams=[a for _,a in DOM(response.text).tags if 'data-public-stream' in a]
    assert len(streams)==5 and all(a['data-page']=='0' and a['data-next'] for a in streams)
    for stream in streams:
        fragment=c.get(stream['data-next'],headers={'X-Public-Fragment':'1'});assert fragment.status_code==200
        assert fragment.json()['page']==1 and fragment.json()['home'] is True


def test_disabled_sections_not_requested_and_fragment_enforces_public_scope(fixture):
    c,r=fixture
    configure(r,homepage_publication_limit=1,homepage_news_limit=0,homepage_project_limit=0,homepage_student_limit=0,homepage_patent_limit=0)
    add(r,'publications','VISIBLE_LAZY',is_featured=1)
    add(r,'publications','HIDDEN_LAZY',is_featured=1,visibility='hidden')
    html=c.get('/en').text
    assert 'VISIBLE_LAZY' not in html
    streams=[a for _,a in DOM(html).tags if 'data-public-stream' in a]
    assert len(streams)==1
    c.cookies.clear();result=c.get(streams[0]['data-next'],headers={'X-Public-Fragment':'1'}).json()
    assert result['total']==1 and not result['next_url']
    assert 'VISIBLE_LAZY' in result['html'] and 'HIDDEN_LAZY' not in result['html']
