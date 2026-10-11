import pytest
from test_accounts_regression import fixture
from test_public_home_step2 import add

@pytest.mark.parametrize('path',['/zh/profiles','/en/profiles','/zh/students','/en/students','/zh/projects','/zh/publications','/zh/patents'])
def test_worker_cold_single_settings_no_facets(fixture,monkeypatch,path):
    c,r=fixture;r.kind='r2';r.public_request_cache=False;r.worker_cache_mode='simple'
    calls=[];original=r.sql.query
    async def query(sql,*args,**kwargs):
        calls.append(sql)
        return await original(sql,*args,**kwargs)
    monkeypatch.setattr(r.sql,'query',query)
    import backend.app.native.public_data as data
    async def forbidden(*args,**kwargs):raise AssertionError('SSR facets on Worker')
    monkeypatch.setattr(data,'people_facets',forbidden)
    response=c.get(path)
    assert response.status_code==200,response.text
    assert sum(q.startswith('SELECT uid,site_name,site_name_en,hero_title') for q in calls)==1,[q for q in calls if q.startswith('SELECT uid,site_name,site_name_en,hero_title')]
    assert 'data-facet-deferred="1"' in response.text
    assert 'data-page="0"' in response.text

def test_profile_projection_and_batch_media(fixture,monkeypatch):
    c,r=fixture
    from test_accounts_regression import run
    for i in range(3):
        run(r.sql.batch([('INSERT INTO media_assets(uid,object_key,title,mime_type,size,status) VALUES (?,?,?,?,?,?)',(f'm{i}',f'avatar-{i}','Avatar','image/png',1,'active'))]))
    for i in range(3):add(r,'profiles',f'Teacher {i}',is_active=1,avatar_key=f'avatar-{i}',orcid_value='12')
    calls=[];original=r.sql.query
    async def query(sql,*args,**kwargs):
        calls.append((sql,args))
        return await original(sql,*args,**kwargs)
    monkeypatch.setattr(r.sql,'query',query)
    response=c.get('/zh/profiles')
    assert response.status_code==200
    assert 'data-platform-value="orcid">12' in response.text
    media=[x for x in calls if 'FROM media_assets' in x[0] and 'object_key IN' in x[0]]
    assert len(media)==1
    assert set(media[0][1][0])=={'avatar-0','avatar-1','avatar-2'}
    assert 'data-facet-deferred="1"' not in response.text
