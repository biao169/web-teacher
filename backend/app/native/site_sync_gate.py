"""Cheap scheduler gate: no application, storage or synchronization graph imports."""
import json
from datetime import datetime, timezone

KEY = 'site-sync:schedule'
STATE = 'site-sync:schedule-state'

async def load(sql, key=KEY):
    rows = await sql.query('SELECT value FROM service_meta WHERE key=?', (key,))
    return json.loads(rows[0]['value']) if rows else {}

async def active(sql):
    return await sql.query("SELECT uid FROM sync_tasks WHERE json_extract(state,'$.execution.phase') IS NOT NULL AND json_extract(state,'$.execution.phase') NOT IN ('done','cancelled') LIMIT 1")

async def probe(sql):
    policy = await load(sql)
    if not policy.get('enabled'):
        return {'skipped': 'disabled'}
    state = await load(sql, STATE)
    at = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    if state.get('retry_after', '') > at:
        return {'skipped': 'interval'}
    # Confirmed manual work must advance even when automatic pulling is off/not due.
    if await active(sql):
        return {}
    if not policy.get('auto_pull'):
        return {'skipped': 'waiting'}
    if not state.get('preview_uid') and state.get('next_due', '') > at:
        return {'skipped': 'interval'}
    return {}
