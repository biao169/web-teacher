"""Quota boundaries, atomic reservations and real transfer routes on isolated storage."""
import asyncio,json,time,sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
from pathlib import Path
from types import SimpleNamespace
import pytest
from starlette.testclient import TestClient
from jinja2 import Environment,FileSystemLoader,StrictUndefined,select_autoescape
from backend.app.native.database import Database
from backend.app.native.storage import LocalStore
from backend.app.native.bridge import sign
from transfer.backend.native import Transfers,app_factory
from transfer.backend.accounting import Accounting,periods,identity
from transfer.backend.settings import edit,select_rule
from backend.app.native.catalog import Error

run=asyncio.run
ROOT=Path(__file__).resolve().parents[1]
@pytest.fixture
def setup(tmp_path):
    db=Database(tmp_path/'transfer.sqlite','transfer');db.initialize();store=LocalStore(tmp_path/'files');service=Transfers(db,store);run(service.initialize('admin'))
    secret='synthetic-transfer-secret-only-041';p={'uid':'admin','role_id':'staff','csrf':'synthetic-csrf','send':True,'aud':'transfer-session','exp':time.time()+290}
    templates=Environment(loader=FileSystemLoader(ROOT/'transfer/frontend/native'),autoescape=select_autoescape(),undefined=StrictUndefined)
    r=SimpleNamespace(sql=db,store=store,cache=LocalStore(tmp_path/'cache'),origin='http://testserver',teacher_origin='http://teacher.test',secret=secret,render=lambda name,**kw:templates.get_template(name).render(**kw))
    client=TestClient(app_factory(lambda request:r));client.cookies.set('ft_session',sign(secret,p))
    yield client,service,p,r
    client.close()

def save(c,**data):return c.post('/api/settings',json={'_csrf':'synthetic-csrf','revision':0,'enabled':True,'vpnGuard':False,'temporaryShare':True,**data},headers={'Origin':'http://testserver'})
def state(service):
    row,value=run(service.settings());value['_revision']=row['revision'];return value

def reserve(service,p,task,size,kind='send'):
    settings=state(service);return run(service.sql.batch(Accounting(service.sql).reserve(p,task,'m',size,kind,settings,select_rule(settings,p),int(time.time()*1000)+60000)))
def custom(uid='admin',**extra):return {'kind':'user','id':uid,'send':True,'receive':True,'concurrency':2,'dailyBytes':'','weeklyBytes':'','monthlyBytes':'','maxFileBytes':'',**extra}

def test_week_boundary_and_timezone():
    at=int(datetime(2026,9,20,16,0,tzinfo=timezone.utc).timestamp()*1000)
    cn=dict((label,start) for label,key,start in periods('Asia/Shanghai',at));utc=dict((label,start) for label,key,start in periods('UTC',at))
    assert cn['daily']==cn['weekly']==at
    assert utc['weekly']==int(datetime(2026,9,14,tzinfo=timezone.utc).timestamp()*1000)

@pytest.mark.parametrize('field',['totalDailyBytes','totalWeeklyBytes','totalMonthlyBytes'])
def test_total_caps_include_different_users_and_both_directions(setup,field):
    c,s,p,r=setup;assert save(c,**{field:'10'}).status_code==200
    reserve(s,p,'first',6);other={**p,'uid':'another'}
    with pytest.raises(sqlite3.IntegrityError):reserve(s,other,'second',5,'receive')
    assert not run(s.sql.query("SELECT 1 FROM transfer_allowances WHERE task='second'"))
    reserve(s,other,'second',4,'receive');assert run(Accounting(s.sql).total_usage(state(s)))['weekly']['charged_and_reserved']==10

def test_user_role_precedence_weekly_limit_and_release(setup):
    c,s,p,r=setup;assert save(c,weeklyBytes='1',customRules=[custom(weeklyBytes='10'),custom('staff',kind='role',weeklyBytes='5')]).status_code==200
    reserve(s,p,'one',10)
    with pytest.raises(sqlite3.IntegrityError):reserve(s,{**p,'role_id':'changed'},'two',1)
    ledger=Accounting(s.sql);run(s.sql.batch(ledger.charge('one','m',3)));run(s.sql.batch([ledger.release('one','m')]))
    reserve(s,p,'two',7)
    with pytest.raises(sqlite3.IntegrityError):reserve(s,{**p,'uid':'other'},'role-task',6)
    assert select_rule(state(s),{**p,'uid':'other'})['weeklyBytes']=='5'

@pytest.mark.parametrize('bad',[{'totalWeeklyBytes':'-1'},{'maxFileBytes':'9007199254740992'},{'allowUploads':'false'},{'customRules':[custom(),custom()]},{'customRules':[custom(concurrency=0)]},{'temporaryHours':0},{'unknown':1}])
def test_bad_settings_atomic(setup,bad):
    c,s,p,r=setup;before=run(s.settings());assert save(c,**bad).status_code==422;assert run(s.settings())==before

def test_guards_and_disabled_usage(setup):
    c,s,p,r=setup;assert c.get('/api/admin/usage').status_code==200
    assert save(c,totalWeeklyBytes='100').status_code==200;assert save(c,totalWeeklyBytes='200').status_code==409
    assert c.post('/api/settings',json={'revision':1,'_csrf':'wrong'},headers={'Origin':r.origin}).status_code==403
    run(s.sql.batch([('DELETE FROM admin_grants',())]));assert c.get('/api/admin/usage').status_code==403
    assert save(c,revision=1).status_code==403

def test_upload_download_limits_anonymous_and_template(setup):
    c,s,p,r=setup;assert save(c,maxFileBytes='4',guestReceive=True,guestWeeklyBytes='4',totalWeeklyBytes='8',temporaryMaxDownloads=4).status_code==200
    page=c.get('/admin');assert page.status_code==200,page.text
    assert 'totalWeeklyBytes' in page.text and 'rule-template' in page.text and '流量使用情况' in page.text
    headers={'Origin':r.origin}
    assert c.post('/api/tasks',json={'_csrf':p['csrf'],'name':'a.txt','size':5},headers=headers).status_code==403
    created=c.post('/api/tasks',json={'_csrf':p['csrf'],'name':'a.txt','size':4},headers=headers);assert created.status_code==200,created.text
    task=created.json();uploaded=c.post('/api/tasks/'+task['id']+'/chunk',content=b'abcd',headers={**headers,'X-CSRF-Token':p['csrf'],'X-Offset':'0'});assert uploaded.status_code==200,uploaded.text
    with TestClient(app_factory(lambda request:r)) as guest:
        result=guest.get('/s/'+task['token']);assert result.status_code==200 and result.content==b'abcd'
        assert guest.get('/s/'+task['token']).status_code==409
        assert guest.post('/api/tasks',json={'name':'guest','size':1}).status_code==401
        assert guest.get('/api/admin/usage').status_code==401
    report=c.get('/api/admin/usage?uid=admin&role=staff').json();assert report['total']['weekly']['charged_and_reserved']==8
    assert report['identity']['weekly']['charged_and_reserved']==4

def test_concurrent_total_reservations_only_one_wins(setup):
    c,s,p,r=setup;assert save(c,totalWeeklyBytes='10').status_code==200
    def attempt(index):
        try:reserve(s,{**p,'uid':str(index)},str(index),7);return True
        except sqlite3.IntegrityError:return False
    with ThreadPoolExecutor(max_workers=2) as pool:assert sorted(pool.map(attempt,range(2)))==[False,True]
    assert run(Accounting(s.sql).total_usage(state(s)))['weekly']['charged_and_reserved']==7

def test_removed_rule_and_global_switch(setup):
    c,s,p,r=setup;assert save(c,customRules=[custom(weeklyBytes='8')],weeklyBytes='2',allowUploads=False).status_code==200
    with pytest.raises(Error):run(s.policy(p,'send'))
    assert save(c,revision=1,allowUploads=True,customRules=[]).status_code==200
    assert run(s.policy(p,'send'))[1]['weeklyBytes']=='2'

def test_expired_reservation_counts_only_used_and_stale_revision_rolls_back(setup):
    c,s,p,r=setup;assert save(c,totalWeeklyBytes='10').status_code==200
    reserve(s,p,'one',10);ledger=Accounting(s.sql);run(s.sql.batch(ledger.charge('one','m',3)))
    run(s.sql.batch([('UPDATE transfer_allowances SET expires_at=0 WHERE task=?',('one',))]))
    assert run(ledger.total_usage(state(s)))['weekly']['charged_and_reserved']==3
    old=state(s);assert save(c,revision=1,totalWeeklyBytes='4').status_code==200
    with pytest.raises(sqlite3.IntegrityError):run(s.sql.batch(ledger.reserve(p,'stale','m',1,'send',old,select_rule(old,p),int(time.time()*1000)+10000)))
    assert not run(s.sql.query("SELECT 1 FROM transfer_allowances WHERE task='stale'"))
    reserve(s,p,'two',1)

def test_global_download_and_guest_switches(setup):
    c,s,p,r=setup;assert save(c,guestReceive=True,allowDownloads=False).status_code==200
    with pytest.raises(Error):run(s.policy(None,'receive'))
    assert save(c,revision=1,allowDownloads=True,guestReceive=False).status_code==200
    with pytest.raises(Error):run(s.policy(None,'receive'))
    assert save(c,revision=2,guestReceive=True,guestConcurrency=7).status_code==200
    assert run(s.policy(None,'receive'))[1]['concurrency']==7
