"""Capacity/age enforcement, portable bounded pruning and shared admin guards."""
import asyncio,json,logging,os,time
import pytest
from deploy.shared.service import RuntimeLog
from backend.maintenance.policy import DEFAULTS,KEY,load
from backend.maintenance.log_retention import prune,scheduled
from test_accounts_regression import fixture,run
from backend.app.native.catalog import now


def emit(h,text):h.handle(logging.LogRecord('test',logging.INFO,'',0,text,(),None))

def test_shrink_existing_logs_immediately_and_retain_newest(tmp_path):
    p=tmp_path/'service.log';p.write_bytes(b'a'*1200000+b'LATEST\n')
    archive=tmp_path/'service.log.1';archive.write_bytes(b'b'*1200000+b'ARCHIVE\n')
    h=RuntimeLog(tmp_path)
    try:
        h.apply_policy({**DEFAULTS,'log_mb':1,'log_backups':1})
        assert p.stat().st_size==1048576 and p.read_bytes().endswith(b'LATEST\n')
        assert archive.stat().st_size==1048576 and archive.read_bytes().endswith(b'ARCHIVE\n')
        emit(h,'after shrink');assert 'after shrink' in p.read_text()
        assert sum(x.stat().st_size for x in tmp_path.iterdir())<=2*1048576
    finally:h.close()

def test_idle_current_expiry_and_unrelated_files(tmp_path):
    p=tmp_path/'service.log';p.write_text('expired');os.utime(p,(0,0))
    extra=tmp_path/'report.log';extra.write_text('keep');os.utime(extra,(0,0))
    (tmp_path/'service.log.20').write_text('surplus')
    h=RuntimeLog(tmp_path)
    try:
        assert p.stat().st_size==0 and extra.read_text()=='keep'
        assert not (tmp_path/'service.log.20').exists()
        emit(h,'new');p.unlink();emit(h,'after unlink');assert 'after unlink' in p.read_text()
    finally:h.close()

def test_links_not_followed(tmp_path):
    target=tmp_path/'unrelated';target.write_text('keep')
    (tmp_path/'service.log.1').symlink_to(target)
    h=RuntimeLog(tmp_path)
    try:h.apply_policy(DEFAULTS);assert target.read_text()=='keep'
    finally:h.close()

async def policy(sql,**changes):
    await sql.batch([('INSERT INTO service_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(KEY,json.dumps({'revision':1,'values':{**DEFAULTS,**changes}})))])

async def logs(sql,count,stamp):
    for start in range(0,count,25):
        await sql.batch([('INSERT INTO operation_logs(uid,created_at,updated_at,action,module) VALUES (?,?,?,?,?)',(f'log{i}',stamp,stamp,'edit','projects')) for i in range(start,min(start+25,count))])

def test_legacy_policy_is_read_without_revision_write(fixture):
    _,r=fixture;old={k:v for k,v in DEFAULTS.items() if k!='operation_max'}
    raw=json.dumps({'revision':7,'values':old})
    run(r.sql.batch([('INSERT INTO service_meta(key,value) VALUES (?,?)',(KEY,raw))]))
    result=run(load(r.sql));assert result['values']['operation_max']==20000 and result['revision']==7 and result['raw']==raw

def test_count_cap_preview_bounded_delete_and_disabled_cron(fixture):
    _,r=fixture;run(policy(r.sql,operation_max=1000));run(logs(r.sql,1045,now()))
    before=run(r.sql.query('SELECT count(*) AS n FROM operation_logs'))[0]['n']
    result=run(prune(r.sql));assert result['count']==20 and result['more']
    assert run(r.sql.query('SELECT count(*) AS n FROM operation_logs'))[0]['n']==before
    result=run(scheduled(r.sql));assert result['count']==20
    assert run(r.sql.query('SELECT count(*) AS n FROM operation_logs'))[0]['n']==before-20
    run(policy(r.sql,enabled=False));assert run(scheduled(r.sql))=={'skipped':'disabled'}

def test_age_and_recent_updates(fixture):
    _,r=fixture;old=now(seconds=-200*86400);run(logs(r.sql,30,old))
    run(r.sql.batch([("UPDATE operation_logs SET updated_at=? WHERE uid='log0'",(now(),))]))
    assert run(prune(r.sql,True,200))['count']==29
    assert run(r.sql.query("SELECT uid FROM operation_logs WHERE uid='log0'"))

@pytest.mark.parametrize('kind',['local','worker'])
def test_shared_page_save_preview_and_authorization(fixture,kind):
    c,r=fixture;r.kind=kind
    assert c.get('/admin/log-maintenance').status_code==404
    assert c.get('/admin/data-tools/sync').status_code==404
    page=c.get('/admin/runtime-maintenance');assert page.status_code==200
    assert ('Cloudflare Worker' in page.text)==(kind=='worker')
    assert 'data-menu-key="site-sync"' in page.text
    assert 'icons.svg#maintenance' in page.text and 'icons.svg#sync' in page.text
    assert 'data-menu-key="log-maintenance"' not in page.text
    values=dict(DEFAULTS) if kind=='local' else {k:DEFAULTS[k] for k in ('enabled','operation_days','operation_max')}
    data={'values':values,'revision':0,'action':'save','_csrf':r.p['csrf']}
    url='/api/admin/runtime-maintenance'
    response=c.post(url,json=data,headers={'Origin':r.config.origin})
    assert response.status_code==200,response.text
    assert c.post(url,json=data,headers={'Origin':r.config.origin}).status_code==409
    assert c.post(url,json={'action':'run'},headers={'Origin':r.config.origin}).status_code==403
    old=now(seconds=-200*86400);run(logs(r.sql,25,old))
    for action in ('preview','run'):
        response=c.post(url,json={'action':action,'_csrf':r.p['csrf']},headers={'Origin':r.config.origin})
        assert response.status_code==200,response.text
    assert len(run(r.sql.query("SELECT uid FROM operation_logs WHERE uid LIKE 'log%'")))==(5 if kind=='worker' else 0)
    state=c.get(url+'/status');assert state.status_code==200
    if kind=='worker':
        assert state.json()['last']['counts']['operation_logs']==20
        assert c.post(url,json={'action':'scan','_csrf':r.p['csrf']},headers={'Origin':r.config.origin}).status_code==409
    c.cookies.clear();assert c.get('/admin/runtime-maintenance').status_code in (401,403)
