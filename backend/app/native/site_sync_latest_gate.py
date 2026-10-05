"""SQL-only routing for an existing latest-preview task; never authorize by flags."""
import json
from .site_sync_gate import load,KEY,STATE
from .site_sync_manual_gate import PREFIX,binding

STABLE="""status IN ('reading','ready') AND json_extract(state,'$.preview_format')=8
 AND json_extract(state,'$.latest_only')=1 AND json_extract(state,'$.lightweight')=1
 AND json_extract(state,'$.direction')='pull' AND json_extract(state,'$.phase') IN ('latest','complete')
 AND coalesce(json_extract(state,'$.incremental'),0)=0
 AND json_extract(state,'$.execution') IS NULL AND json_extract(state,'$.approval') IS NULL
 AND json_extract(state,'$.restart_uid') IS NULL AND json_extract(state,'$.prepared_uid') IS NULL
 AND coalesce(json_extract(state,'$.history_deleting'),0)=0"""

async def select(sql,uid):
    if not uid:return None
    rows=await sql.query("SELECT uid,"+binding('read')+" AS task_binding FROM sync_tasks WHERE uid=? AND "+STABLE+" AND status='reading' AND json_extract(state,'$.phase')='latest'",(uid,))
    if not rows:return None
    task_binding=json.loads(rows[0]['task_binding'])
    rows=await sql.query('SELECT value FROM service_meta WHERE key=?',(PREFIX+uid,))
    if rows:
        policy=json.loads(rows[0]['value'])
        if not policy.get('enabled') or policy.get('mode')!='read' or policy.get('task_uid')!=uid:return None
        return {'uid':uid,'key':PREFIX+uid,'policy':policy,'before':rows[0]['value'],'manual':True,'task_binding':task_binding}
    policy=await load(sql);state=await load(sql,STATE)
    if not policy.get('enabled') or not policy.get('auto_pull') or state.get('preview_uid')!=uid:return None
    return {'uid':uid,'key':KEY,'policy':policy,'state':state,'manual':False,'task_binding':task_binding}
