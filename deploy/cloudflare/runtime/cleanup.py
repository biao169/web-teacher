"""Scheduled bounded cleanup; durable lease and checkpoints use existing tables."""
import json
import secrets
import time
from transfer.backend.offline import Maintenance

STATUS = 'worker:transfer-cleanup-status'
LEASE = 'worker:transfer-cleanup-lease'


async def run(sql, store, clock=time.time):
    rows = await sql.query('SELECT document FROM tool_settings WHERE id=1')
    if not rows: return {'skipped': 'not-initialized'}
    settings = json.loads(rows[0]['document'])
    if not settings.get('temporaryAutoCleanup', True): return {'skipped': 'disabled'}
    at = int(clock()*1000)
    previous = await sql.query('SELECT value FROM service_meta WHERE key=?', (STATUS,))
    if previous and at < int(json.loads(previous[0]['value']).get('next_run', 0)):
        return {'skipped':'interval'}
    token = secrets.token_hex(16)
    value = json.dumps({'token':token, 'until':at+20*60000})
    await sql.batch([
        ('INSERT OR IGNORE INTO service_meta(key,value) VALUES(?,?)',(LEASE,'{"until":0}')),
        ("UPDATE service_meta SET value=? WHERE key=? AND coalesce(json_extract(value,'$.until'),0)<=?",(value,LEASE,at))])
    lease = await sql.query('SELECT value FROM service_meta WHERE key=?',(LEASE,))
    if not lease or lease[0]['value'] != value: return {'skipped':'busy'}
    try:
        # One purge batch is <=8 indexed chunks; subsequent invocations resume it.
        result = await Maintenance(sql, store).tick(batches=1)
        # Codes and replay guards are bounded too; active entries are never removed.
        await sql.batch([
            ('DELETE FROM transfer_codes WHERE id IN (SELECT id FROM transfer_codes WHERE expires_at<=? ORDER BY expires_at LIMIT 100)',(at,)),
            ('DELETE FROM bridge_nonces WHERE jti IN (SELECT jti FROM bridge_nonces WHERE expires_at<=? LIMIT 100)',(at,)),
            ("DELETE FROM service_meta WHERE key IN (SELECT key FROM service_meta WHERE key LIKE 'batch:%' AND json_extract(value,'$.exp')<=? LIMIT 100)",(at/1000,))])
        status = {**result, 'last_run':at, 'running':False, 'scheduler':'cron',
                  'error':'部分到期任务清理失败，将重试。' if result['failed_tasks'] else ''}
        # Continue pending/failed work next minute; preserve the actual last-run time.
        delay = 1 if result['more'] or result['completed_tasks'] or result['failed_tasks'] else int(settings.get('temporaryCleanupMinutes',15))
        status['next_run'] = at + delay*60000
        await sql.batch([('INSERT OR REPLACE INTO service_meta(key,value) VALUES(?,?)',(STATUS,json.dumps(status)))])
        if result['failed_tasks']: raise RuntimeError('Transfer cleanup incomplete; checkpoint retained')
        return status
    finally:
        await sql.batch([('DELETE FROM service_meta WHERE key=? AND value=?',(LEASE,value))])
