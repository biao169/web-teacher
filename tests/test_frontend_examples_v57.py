"""Additional examples exercise actual saves, HTTP fragments and preservation of existing data."""
from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
from urllib.parse import urlencode
import pytest
from test_accounts_regression import fixture, run
from test_public_home_step2 import configure, add, DOM
from test_public_cards_v55 import citation
from test_public_stream_v46 import ids, H
from backend.app.native.catalog import Error
from backend.app.native.example_catalog import identity as old_identity
from backend.app.native.examples import Examples
from backend.app.native.frontend_examples import FrontendExamples, load_rows, import_batch, console


def snapshot(r, table):
    return run(r.sql.query(f'SELECT * FROM "{table}" ORDER BY uid'))


def walk(client, url):
    found, pages = [], []
    while url:
        response = client.get(url, headers=H)
        assert response.status_code == 200, response.text
        page = response.json()
        batch = ids(page['html'])
        assert len(batch) <= 10 and len(pages) < 30
        assert not set(batch) & set(found)
        found.extend(batch);pages.append(page)
        url = page['next_url']
    return found, pages


def test_additional_130_records_old_examples_preserved_and_public_integration(fixture):
    c, r = fixture
    original = Examples(r)
    for i in range(1, 5):run(original.step('media_assets', i))
    for table in ('students', 'publications'):
        for i in range(1, 11):run(original.step(table, i))
    # Real configured rules: graduation has priority, then masters, then doctoral.
    for label, keyword, order in [('Alumni','毕业',-30),('Masters','硕士',-20),('Doctoral','博士',-10)]:
        run(r.content.save('student_category_displays',r.p,dict(key='check-'+label,label=label,keywords=keyword,display_order=order,enabled=1)))
    preserved = {t:snapshot(r,t) for t in ('students','publications','student_category_displays','site_settings','auth_users','auth_roles')}
    service = FrontendExamples(r)
    report = run(import_batch(service, emit=lambda _:None))
    assert (report['created'],report['kept'],report['failed'],report['complete']) == (130,0,0,True)
    assert report['groups']=={'students':{'created':30,'kept':0,'failed':0},'publications':{'created':100,'kept':0,'failed':0}}
    for table, old in preserved.items():
        current = {row['uid']:row for row in snapshot(r,table)}
        assert all(current[row['uid']]==row for row in old)
        assert len(current)==len(old)+({'students':30,'publications':100}.get(table,0))
    data = service.data
    assert Counter(x['values']['degree'] for x in data['students'])=={'博士':10,'硕士':12,'本科':8}
    assert sum(x['values']['status']=='毕业' for x in data['students'])==6
    assert Counter(x['values']['publication_type'] for x in data['publications'])=={'期刊论文':70,'会议论文':30}
    for item in data['publications']:
        row=run(r.content.get('publications',item['uid'],r.p))
        assert not row['doi'] and all(row[key] for key in ('citation_gbt','citation_elsevier','citation_apa','citation_ieee','bibtex'))
        assert set(row['corresponding_authors'].split('; '))<=set(row['authors'].split('; '))
    for table in ('students','publications'):
        expected={item['uid'] for item in data[table]}
        for lang in ('zh','en'):
            ordered,pages=walk(c,f'/{lang}/{table}')
            assert expected <= set(ordered)
            assert 'example.invalid' not in ''.join(page['html'] for page in pages)
            assert 'FRONTEND-DEMO-' not in ''.join(page['html'] for page in pages)
        if table=='publications':
            ascending,_=walk(c,'/zh/publications?direction=asc')
            descending,_=walk(c,'/zh/publications?direction=desc')
            assert ascending==list(reversed(descending))
        else:
            records={item['uid']:item['values'] for item in data[table]}
            selected=[records[uid] for uid in ordered if uid in records]
            rank=lambda row:0 if row['status']=='毕业' else 1 if row['degree']=='硕士' else 2 if row['degree']=='博士' else 3
            assert list(map(rank,selected))==sorted(map(rank,selected))
    # Candidate pagination covers the entire public scope, including long venues beyond page 1.
    first=c.get('/api/public/people/publications/facets/venue').json()
    second=c.get('/api/public/people/publications/facets/venue?page=2').json()
    assert len(first['values'])==50 and first['has_more'] and not second['has_more']
    assert {item['values']['venue'] for item in data['publications']}<=set(first['values']+second['values'])
    venue=second['values'][-1]
    selected,_=walk(c,'/zh/publications?'+urlencode({'f.venue':venue}))
    assert all(run(r.content.get('publications',uid,r.p))['venue']==venue for uid in selected)
    for kind,count in [('期刊论文',70),('会议论文',30)]:
        selected,_=walk(c,'/en/publications?'+urlencode({'f.publication_type':kind}))
        assert len(selected)==count
    sample=data['publications'][99]
    for style in ('gbt','elsevier','apa','ieee'):
        configure(r,publication_citation_style=style)
        page=c.get('/en/publications?f.uid='+sample['uid']).text
        assert citation(page)==sample['values']['citation_'+style]
        assert 'data-citation-fallback' not in page
    # PDF references reuse registered media; private attachment links never reach the public card.
    for ordinal,visible in [(4,False),(9,True)]:
        page=c.get('/zh/publications?f.uid='+data['publications'][ordinal]['uid']).text
        assert ('/media/'+old_identity('media_assets',4) in page)==visible
    # Home caps remain settings-controlled with these larger datasets.
    configure(r,homepage_publication_limit=17,homepage_student_limit=13)
    for table,cap in [('publications',17),('students',13)]:
        loaded,_=walk(c,f'/zh/{table}?home=1')
        assert len(loaded)==cap
    # User edits (including withdrawal and manually corrected citations) survive reruns byte-for-byte.
    for table,patch in [('students',{'name':'Manual edited student','visibility':'hidden'}),('publications',{'citation_gbt':'Manually corrected citation','visibility':'staff'})]:
        uid=data[table][0]['uid'];row=run(r.content.get(table,uid,r.p))
        run(r.content.save(table,r.p,patch,uid,row['updated_at']))
    before={t:snapshot(r,t) for t in ('students','publications','media_assets','student_category_displays')}
    repeat=run(import_batch(service,emit=lambda _:None))
    assert (repeat['created'],repeat['kept'],repeat['failed'])==(0,130,0)
    for table,rows in before.items():assert snapshot(r,table)==rows
    # Withdrawing a record also withdraws it from public paging and its focused link.
    for table in ('students','publications'):
        uid=data[table][0]['uid']
        assert uid not in walk(c,'/zh/'+table)[0]
        assert c.get('/zh/'+table+'/'+uid,follow_redirects=False).status_code==404


def test_limit_failure_and_retry_keep_completed_rows(fixture,monkeypatch):
    _,r=fixture;service=FrontendExamples(r);messages=[]
    first=run(import_batch(service,limit=7,emit=messages.append))
    assert first['created']==7 and first['unprocessed']==123 and not first['complete']
    real=service.step
    async def interrupted(group,index):
        if group=='students' and index==10:raise Error('Injected unavailable storage',503)
        return await real(group,index)
    monkeypatch.setattr(service,'step',interrupted)
    failed=run(import_batch(service,groups=('students',),emit=messages.append))
    assert (failed['created'],failed['kept'],failed['failed'],failed['unprocessed'])==(2,7,1,20)
    assert failed['after']['students']['existing']==9 and not failed['complete']
    monkeypatch.setattr(service,'step',real)
    resumed=run(import_batch(service,groups=('students',),emit=messages.append))
    assert (resumed['created'],resumed['kept'],resumed['failed'],resumed['complete'])==(21,9,0,True)
    assert len([m for m in messages if m['event']=='result'])==3
    assert not run(r.sql.query("SELECT uid FROM publications WHERE sort_order>2000"))


def test_status_only_and_retired_existing_media_are_not_repaired(fixture):
    _,r=fixture;service=FrontendExamples(r)
    before={t:snapshot(r,t) for t in ('students','publications','media_assets','student_category_displays')}
    assert run(service.coverage(('students','publications')))['students']['missing']==30
    for t,rows in before.items():assert snapshot(r,t)==rows
    run(service.step('students',1))
    run(r.sql.batch([("UPDATE media_assets SET status='trash' WHERE uid=?",(old_identity('media_assets',1),))]))
    media=snapshot(r,'media_assets')
    assert run(service.step('students',1))['status']=='kept'
    with pytest.raises(Error,match='回收'):run(service.step('students',2))
    assert snapshot(r,'media_assets')==media
    assert not run(r.sql.query('SELECT uid FROM students WHERE uid=?',(service.data['students'][1]['uid'],)))


@pytest.mark.parametrize('failure',['non_system','permission_at_commit','audit'])
def test_shared_authorization_and_atomic_audit_remain_enforced(fixture,monkeypatch,failure):
    _,r=fixture;service=FrontendExamples(r)
    # Student 4 has no media dependency, isolating the content transaction.
    uid=service.data['students'][3]['uid']
    if failure=='non_system':
        r.p=deepcopy(r.p);r.p['is_system']=False
    elif failure=='permission_at_commit':
        original=r.sql.batch
        async def revoke(statements):
            if any(sql.startswith('INSERT INTO "students"') for sql,_ in statements):
                await original([("UPDATE auth_permissions SET can_create=0 WHERE role_uid=? AND module='students'",(r.p['role_uid'],))])
            return await original(statements)
        monkeypatch.setattr(r.sql,'batch',revoke)
    else:monkeypatch.setattr(r.content,'audit',lambda *args,**kwargs:('INSERT INTO operation_logs(uid) VALUES(NULL)',()))
    with pytest.raises(Exception):run(service.step('students',4))
    assert not run(r.sql.query('SELECT uid FROM students WHERE uid=?',(uid,)))


def test_console_authenticates_reports_and_logs_out(fixture,monkeypatch):
    _,r=fixture
    active_before=run(r.sql.query('SELECT uid FROM auth_sessions WHERE revoked_at IS NULL ORDER BY uid'))
    monkeypatch.setattr('getpass.getpass',lambda _: 'Synthetic-test-only-032')
    assert run(console(r.settings,username='list-test-admin',action='add',group='students',limit=2))==0
    assert len(run(r.sql.query('SELECT uid FROM students WHERE sort_order>2000')))==2
    assert run(r.sql.query('SELECT uid FROM auth_sessions WHERE revoked_at IS NULL ORDER BY uid'))==active_before


def test_console_refuses_missing_database_without_creating_one(tmp_path):
    from backend.app.config import Settings
    settings=Settings(tmp_path/'missing')
    with pytest.raises(ValueError,match='数据库不存在'):run(console(settings))
    assert not settings.database_path.exists()
