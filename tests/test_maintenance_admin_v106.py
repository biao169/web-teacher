import asyncio,json
from test_accounts_regression import fixture,user
from backend.maintenance.policy import DEFAULTS,load,KEY
from backend.maintenance.monitor import Monitor
from backend.maintenance.runtime import Maintenance
from backend.app.native.catalog import now

URL='/api/admin/runtime-maintenance'

def post(c,r,action,**values):return c.post(URL,json={'action':action,'_csrf':r.p['csrf'],**values},headers={'Origin':r.config.origin})

def test_admin_workspace_and_shared_policy(fixture):
    c,r=fixture
    page=c.get('/admin/runtime-maintenance');assert page.status_code==200 and '运行维护' in page.text and 'data-policy' in page.text
    assert '/admin/runtime-maintenance' in c.get('/admin').text
    status=c.get(URL+'/status');assert status.status_code==200 and status.json()['resources']['files'] is None
    values={**DEFAULTS,'session_days':1,'enabled':False,'operation_days':25}
    reply=post(c,r,'save',revision=0,values=values);assert reply.status_code==200,reply.text
    assert asyncio.run(load(r.sql))['values']==values
    assert post(c,r,'save',revision=0,values=values).status_code==409
    assert post(c,r,'save',revision=1,values={**values,'temporary_hours':0}).status_code==422
    preview=post(c,r,'preview');assert preview.status_code==200 and preview.json()['retention']['operation_days']==25
    assert post(c,r,'run').status_code==200
    assert c.get(URL+'/status').json()['last']['mode']=='apply'


def test_auth_csrf_and_non_system_role_denied(fixture):
    c,r=fixture
    assert c.post(URL,json={'action':'run'},headers={'Origin':r.config.origin}).status_code==403
    original=c.cookies.get('ts_session');c.cookies.clear()
    assert c.get(URL+'/status').status_code==401
    u=user(r)
    token=asyncio.run(r.auth.login(u['username'],'Synthetic-only-password-035','test'))
    c.cookies.set('ts_session',token)
    assert c.get(URL+'/status').status_code==403
    assert c.get('/admin/runtime-maintenance').status_code in (403,303)
    c.cookies.clear();c.cookies.set('ts_session',original)


def test_monitor_incremental_and_cached_reads(tmp_path):
    from backend.app.config import Settings
    async def run():
        s=Settings(tmp_path);s.media_dir.mkdir(parents=True)
        for i in range(450):(s.media_dir/str(i)).write_bytes(b'1234')
        m=Monitor(s)
        try:
            first=m.step();assert first['visited']<=200 and not first['complete']
            for _ in range(10):
                value=m.step()
                if value['complete']:break
            assert value['complete'] and value['rows']['media']['bytes']==1800
            assert m.last==value and not m.running
        finally:m.close()
    asyncio.run(run())


def test_policy_applies_to_shared_cleaner(fixture):
    c,r=fixture
    stamp=now(seconds=-2*86400)
    asyncio.run(r.sql.batch([('INSERT INTO operation_logs(uid,created_at,updated_at,action,module) VALUES (?,?,?,?,?)',('old',stamp,stamp,'edit','projects'))]))
    assert post(c,r,'preview').json()['counts']['operation_logs']==0
    assert post(c,r,'save',revision=0,values={**DEFAULTS,'operation_days':1}).status_code==200
    result=post(c,r,'run');assert result.status_code==200
    assert not asyncio.run(r.sql.query("SELECT 1 FROM operation_logs WHERE uid='old'"))


def test_disabled_automatic_maintenance_keeps_manual_available(fixture):
    c,r=fixture
    assert post(c,r,'save',revision=0,values={**DEFAULTS,'enabled':False}).status_code==200
    async def run():
        m=Maintenance(r.sql,r.settings);calls=[]
        async def tick(*args,**kwargs):calls.append(True);return {'errors':[],'more':False}
        m.tick=tick;job=asyncio.create_task(m.run());await asyncio.sleep(.02);m.stopped.set();await job
        assert not calls
    asyncio.run(run())
    assert post(c,r,'preview').status_code==200


def test_log_policy_changes_limit_and_archive_retention(tmp_path):
    from deploy.shared.service import RuntimeLog
    h=RuntimeLog(tmp_path)
    try:
        (tmp_path/'service.log.6').write_text('owned')
        (tmp_path/'notes.log').write_text('keep')
        h.apply_policy({**DEFAULTS,'log_backups':2,'log_mb':3,'log_days':60})
        assert h.backups==2 and h.max_bytes==3*1024*1024 and h.days==60
        assert not (tmp_path/'service.log.6').exists() and (tmp_path/'notes.log').exists()
    finally:h.close()
