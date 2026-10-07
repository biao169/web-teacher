import asyncio,json
from datetime import datetime,timezone
from backend.maintenance.history import History,HistoryPolicy,DAY,iso
from test_maintenance_v104 import setup
from transfer.backend import accounting

AT=int(datetime(2026,3,31,20,tzinfo=timezone.utc).timestamp()*1000)
OLD=AT-100*DAY

def go(coro):return asyncio.run(coro)

async def task(m,id='a'*32,state='deleted',updated=OLD):
    await m.sql.batch([
      ('INSERT INTO temporary_shares VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',(id,'owner',id,'{}',None,'0',state,OLD,OLD,1,0,'')),
      ('INSERT INTO recovery_tasks VALUES (?,?,?,?,?,?,?,?,?)',(id,'wan','{}','',json.dumps({'bytes':0,'parts':[]}),json.dumps({'cleanup_until':0,'cleanup_error':''}),state,OLD,updated))])
    return id

async def allowance(m,id,member='old',authorized=OLD,expiry=OLD,finished=OLD):
    await m.sql.batch([('INSERT INTO transfer_allowances VALUES (?,?,?,?,?,?,?,?,?,?)',(id,member,'guest:shared','send','100',OLD,authorized,expiry,finished,'{"used":100}'))])


def test_logs_age_preview_and_batch_limit(tmp_path):
    async def run():
        m=setup(tmp_path);h=History(m.sql,m.settings,clock=lambda:AT)
        for i in range(205):
            date=iso(AT-(181 if i<204 else 2)*DAY)
            await m.sql.batch([('INSERT INTO operation_logs(uid,created_at,updated_at,action,module) VALUES (?,?,?,?,?)',(str(i),date,date,'edit','projects'))])
        p=await h.tick();assert p['counts']['operation_logs']==200
        assert (await m.sql.query('SELECT count(*) n FROM operation_logs'))[0]['n']==205
        await h.tick(True);await h.tick(True)
        assert (await m.sql.query('SELECT uid FROM operation_logs'))==[{'uid':'204'}]
    go(run())


def test_current_quota_unchanged_both_zones_and_short_policy(tmp_path,monkeypatch):
    monkeypatch.setattr(accounting,'milliseconds',lambda:AT)
    async def run():
        m=setup(tmp_path);h=History(m.sql,m.settings,HistoryPolicy(180,1),clock=lambda:AT)
        relay='relay:'+'b'*32
        await allowance(m,relay)
        # March 10 is outside one-day retention but still counts in UTC's current month.
        await allowance(m,relay,'month',AT-21*DAY,AT-20*DAY,AT-20*DAY)
        await allowance(m,relay,'week',AT-2*DAY,AT-2*DAY,AT-2*DAY)
        await allowance(m,relay,'live',AT-1000,AT+DAY,None)
        ledger=accounting.Accounting(m.sql)
        for zone in ('UTC','Asia/Shanghai'):
            settings={'personalTimeZone':zone,'totalMonthlyBytes':'10000','guestMonthlyBytes':'10000'}
            before=(await ledger.total_usage(settings),await ledger.usage(None,settings,{}))
            result=await h.tick(True);assert not result['errors']
            assert before==(await ledger.total_usage(settings),await ledger.usage(None,settings,{}))
        assert {r['member'] for r in await m.sql.query('SELECT member FROM transfer_allowances')}=={'month','week','live'}
    go(run())


def test_task_relations_are_bounded_and_parent_deleted_last(tmp_path):
    async def run():
        m=setup(tmp_path);h=History(m.sql,m.settings,clock=lambda:AT);id=await task(m)
        for i in range(25):
            await m.sql.batch([('INSERT INTO recovery_members VALUES (?,?,?,?)',(id,str(i),'owner',str(i)))])
        await allowance(m,id)
        first=await h.tick(True);assert first['counts']['transfer_allowances']==1
        assert await m.sql.query('SELECT 1 FROM temporary_shares') # ledger gone; next batch handles task
        preview=await h.tick();assert preview['counts']['recovery_members']==20 and preview['counts']['transfer_tasks']==0
        one=await h.tick(True);assert not one['errors'] and one['counts']['recovery_members']==20
        assert await m.sql.query('SELECT 1 FROM recovery_tasks')
        two=await h.tick(True);assert two['counts']['transfer_tasks']==1
        for table in ('recovery_members','temporary_shares','recovery_tasks','transfer_allowances'):assert not await m.sql.query('SELECT 1 FROM '+table)
        assert not await m.sql.query('PRAGMA foreign_key_check')
    go(run())


def test_active_recent_disk_and_failed_tasks_retained(tmp_path):
    async def run():
        m=setup(tmp_path);h=History(m.sql,m.settings,clock=lambda:AT)
        active=await task(m,'a'*32,'uploading');await allowance(m,active)
        recent=await task(m,'b'*32,updated=AT-DAY)
        disk=await task(m,'c'*32);folder=m.settings.transfer_media_dir/disk;folder.mkdir();(folder/'keep.part').write_bytes(b'keep')
        failed=await task(m,'d'*32)
        await m.sql.batch([("UPDATE recovery_tasks SET extra=? WHERE id=?",('{"cleanup_error":"retry"}',failed))])
        result=await h.tick(True)
        assert len(await m.sql.query('SELECT 1 FROM temporary_shares'))==4
        assert len(await m.sql.query('SELECT 1 FROM transfer_allowances'))==1
        assert result['retained_tasks']==1 and (folder/'keep.part').read_bytes()==b'keep'
    go(run())


def test_failure_rolls_back_entire_task_and_retries(tmp_path):
    async def run():
        m=setup(tmp_path);h=History(m.sql,m.settings,clock=lambda:AT);id=await task(m)
        await m.sql.batch([('INSERT INTO recovery_members VALUES (?,?,?,?)',(id,'m','owner','token'))])
        with m.sql.connect() as c:c.execute("CREATE TRIGGER stop_history BEFORE DELETE ON recovery_tasks BEGIN SELECT RAISE(ABORT,'synthetic'); END")
        result=await h.tick(True);assert result['errors']
        assert await m.sql.query('SELECT 1 FROM temporary_shares') and await m.sql.query('SELECT 1 FROM recovery_members')
        with m.sql.connect() as c:c.execute('DROP TRIGGER stop_history')
        result=await h.tick(True);assert not result['errors'] and result['counts']['transfer_tasks']==1
    go(run())


def test_related_receivers_codes_and_folder_metadata(tmp_path):
    async def run():
        m=setup(tmp_path);h=History(m.sql,m.settings,clock=lambda:AT);id=await task(m)
        await m.sql.batch([
            ('INSERT INTO transfer_receivers(id,task,secret_hash,identity_key,stamp,expires_at,state) VALUES (?,?,?,?,?,?,?)',('v',id,'hash','owner',OLD,OLD,'complete')),
            ('INSERT INTO transfer_codes VALUES (?,?,?,?,?,?,?,?)',('code','AB1234','offline',id,'','active',OLD,OLD)),
            ('INSERT INTO service_meta(key,value) VALUES (?,?)',(f'folder:{id}:entry','{}'))])
        preview=await h.tick();assert preview['counts']['transfer_tasks']==1
        assert preview['counts']['transfer_codes']==1 and preview['counts']['transfer_receivers']==1
        result=await h.tick(True);assert not result['errors']
        for table in ('transfer_receivers','transfer_codes','service_meta','temporary_shares','recovery_tasks'):assert not await m.sql.query('SELECT 1 FROM '+table)
    go(run())


def test_recent_receivers_and_quota_rows_hold_task_history(tmp_path):
    async def run():
        m=setup(tmp_path);h=History(m.sql,m.settings,clock=lambda:AT)
        first=await task(m,'a'*32);await allowance(m,first,'recent',AT-DAY,AT-DAY,AT-DAY)
        second=await task(m,'b'*32)
        await m.sql.batch([('INSERT INTO transfer_receivers(id,task,secret_hash,identity_key,stamp,expires_at,state) VALUES (?,?,?,?,?,?,?)',('v',second,'hash','owner',OLD,AT+DAY,'active'))])
        await h.tick(True)
        assert len(await m.sql.query('SELECT 1 FROM temporary_shares'))==2
    go(run())


def test_settings_audit_keeps_current_revision(tmp_path):
    async def run():
        m=setup(tmp_path);h=History(m.sql,m.settings,clock=lambda:AT);old=iso(AT-181*DAY)
        await m.sql.batch([('INSERT INTO tool_settings VALUES (1,2,?,?,?)',('{}',old,'admin')),
                          ('INSERT INTO settings_audit VALUES (1,?,?,?)',(old,'admin','settings')),
                          ('INSERT INTO settings_audit VALUES (2,?,?,?)',(old,'admin','settings'))])
        result=await h.tick(True);assert result['counts']['settings_audit']==1
        assert await m.sql.query('SELECT revision FROM settings_audit')==[{'revision':2}]
    go(run())
