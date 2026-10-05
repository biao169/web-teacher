"""Small, resumable history pruning; never delete business data or live media."""
from .catalog import Error,now

BATCH=20
DAYS=7
KEEP=10

# Recheck protection when marking; an expired/deleting task cannot begin or advance.
SAFE="""coalesce(json_extract(state,'$.work.status'),'saved')<>'running'
 AND coalesce(json_extract(state,'$.execution.phase'),'done') IN ('done','cancelled')
 AND NOT EXISTS(SELECT 1 FROM admin_mutation_guards WHERE created_at>=? AND
   (uid IN ('site-sync:run','site-sync:schedule-run') OR uid='site-sync:task:'||sync_tasks.uid))
 AND NOT EXISTS(SELECT 1 FROM service_meta WHERE key='site-sync:inbox'
   AND json_extract(value,'$.current.status')='pending'
   AND json_extract(value,'$.current.review_uid') IN (sync_tasks.uid,json_extract(sync_tasks.state,'$.parent_uid')))
 AND NOT EXISTS(SELECT 1 FROM service_meta WHERE key='site-sync:schedule-state'
   AND json_extract(value,'$.preview_uid') IN (sync_tasks.uid,json_extract(sync_tasks.state,'$.parent_uid')))
 AND NOT EXISTS(SELECT 1 FROM service_meta m WHERE m.key='site-sync:manual:'||sync_tasks.uid AND json_extract(m.value,'$.enabled')=1)
 AND NOT EXISTS(SELECT 1 FROM sync_tasks child WHERE child.uid<>sync_tasks.uid
   AND json_extract(child.state,'$.parent_uid')=sync_tasks.uid AND child.status='reading')
"""

async def listing(sql):
    return await sql.query(f"SELECT uid,status,created_at,json_extract(state,'$.execution.phase') AS execution_phase FROM sync_tasks WHERE coalesce(json_extract(state,'$.history_deleting'),0)=0 ORDER BY CASE WHEN json_extract(state,'$.execution.phase') NOT IN ('done','cancelled') THEN 0 ELSE 1 END,created_at DESC,uid DESC LIMIT {KEEP}")

async def prune(sql,uid=None, *, batch=BATCH):
    """At most twenty detail rows plus one empty task; safe to retry after a lost reply."""
    if uid is not None and (not isinstance(uid,str) or not 1<=len(uid)<=128):raise Error('任务标识无效')
    batch = max(1, min(BATCH, int(batch)))
    root=uid
    if uid is not None:
        # An original preview may own one preparation child. Remove child first.
        rows=await sql.query("SELECT uid FROM sync_tasks WHERE json_extract(state,'$.parent_uid')=? ORDER BY created_at LIMIT 1",(uid,))
        if rows:uid=rows[0]['uid']
        rows=await sql.query('SELECT uid FROM sync_tasks WHERE uid=?',(uid,))
        if not rows:return {'deleted':True,'more':False,'uid':root}
        clause='uid=?';args=(uid,)
    else:
        clause=f"""(json_extract(state,'$.history_deleting')=1 OR created_at<? OR uid NOT IN
           (SELECT uid FROM sync_tasks ORDER BY created_at DESC,uid DESC LIMIT {KEEP}))"""
        args=(now(seconds=-DAYS*86400),)
    rows=await sql.query('SELECT uid FROM sync_tasks WHERE '+clause+' AND '+SAFE+
                         " ORDER BY coalesce(json_extract(state,'$.history_deleting'),0) DESC,created_at,uid LIMIT 1",(*args,now(seconds=-300)))
    if not rows:
        if root is not None:raise Error('任务正在执行、等待批准或被后台使用；请先完成或取消并清理、处理提案，或关闭对应后台策略',409,'sync_history_busy')
        return {'deleted':False,'more':False}
    target=rows[0]['uid']
    # Setting expired and the deletion marker is the gate. Every statement uses that gate.
    marked="EXISTS(SELECT 1 FROM sync_tasks WHERE uid=? AND status='expired' AND json_extract(state,'$.history_deleting')=1 AND "+SAFE+")"
    result=await sql.batch([
        ("UPDATE sync_tasks SET status='expired',state=json_set(state,'$.history_deleting',1) WHERE uid=? AND "+SAFE+' RETURNING uid',(target,now(seconds=-300))),
        (f"DELETE FROM sync_task_items WHERE task_uid=? AND (side,module,record_uid) IN (SELECT side,module,record_uid FROM sync_task_items WHERE task_uid=? ORDER BY side,module,record_uid LIMIT {batch}) AND "+marked,(target,target,target,now(seconds=-300))),
        ("DELETE FROM sync_tasks WHERE uid=? AND status='expired' AND json_extract(state,'$.history_deleting')=1 AND NOT EXISTS(SELECT 1 FROM sync_task_items WHERE task_uid=?) AND "+SAFE+" RETURNING uid",(target,target,now(seconds=-300))),
        ("UPDATE sync_tasks SET status='expired',state=json_set(state,'$.history_deleting',1) WHERE json_extract(state,'$.prepared_uid')=? AND NOT EXISTS(SELECT 1 FROM sync_tasks WHERE uid=?) AND "+SAFE,(target,target,now(seconds=-300))),
    ])
    if not result[0]:
        if root is not None:raise Error('任务状态已变化，请刷新后重试',409,'sync_history_busy')
        return {'deleted':False,'more':False}
    deleted=bool(result[2])
    if deleted:await sql.batch([("DELETE FROM service_meta WHERE key=? AND NOT EXISTS(SELECT 1 FROM sync_tasks WHERE uid=?)",('site-sync:manual:'+target,target)),("DELETE FROM service_meta WHERE key=? AND NOT EXISTS(SELECT 1 FROM sync_tasks WHERE uid=?)",('site-sync:scheduler-attempt:'+target,target))])
    return {'uid':root or target,'deleted':deleted and (root is None or root==target),'more':not deleted or (root is not None and root!=target)}
