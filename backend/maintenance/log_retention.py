"""Portable bounded log pruning: no file adapters, log details or application graph."""
from backend.app.native.catalog import now
from .policy import load

async def prune(sql,apply=False,batch=20,days=None,cutoff=None):
    batch=max(1,min(200,int(batch)))
    policy=(await load(sql))['values']
    cutoff=cutoff or now(seconds=-(policy['operation_days'] if days is None else days)*86400)
    # The primary-key walk skips at most the configured 100,000 rows; no detail reads.
    condition='((created_at<? AND updated_at<?) OR id<coalesce((SELECT id FROM operation_logs ORDER BY id DESC LIMIT 1 OFFSET ?),0))'
    args=(cutoff,cutoff,policy['operation_max']-1)
    selection=f'SELECT id FROM operation_logs WHERE {condition} ORDER BY id LIMIT {batch}'
    if apply:
        rows=(await sql.batch([(f'DELETE FROM operation_logs WHERE id IN ({selection}) AND {condition} RETURNING id',args+args)]))[0]
    else:rows=await sql.query(selection,args)
    return {'count':len(rows),'more':len(rows)==batch,'batch':batch,'mode':'apply' if apply else 'preview','at':now()}

async def scheduled(sql):
    # First deployments may run cron before initialization. Do not initialize tables here.
    tables=await sql.query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('operation_logs','service_meta')")
    if len(tables)!=2:return {'skipped':'not-initialized'}
    if not (await load(sql))['values']['enabled']:return {'skipped':'disabled'}
    return await prune(sql,apply=True,batch=20)
