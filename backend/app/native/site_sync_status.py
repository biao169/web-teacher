"""Read-only bounded task monitoring; never load task payloads or contact peers."""
from .catalog import Error,now
from .site_sync_schedule import status as schedule_status
from .site_sync_work import policy

async def read(r,options=None):
    options=options or {};after=options.get('after');active=options.get('active',True)
    if type(active) is not bool:raise Error('任务状态筛选无效')
    args=[];where="coalesce(json_extract(state,'$.history_deleting'),0)=0"
    if active:
        where+=" AND status IN ('reading','ready') AND coalesce(json_extract(state,'$.execution.phase'),'pending') NOT IN ('done','cancelled')"
    if after is not None:
        if not isinstance(after,list) or len(after)!=2 or any(not isinstance(x,str) or len(x)>128 for x in after):raise Error('任务状态游标无效')
        where+=' AND (created_at,uid)<(?,?)';args+=after
    fields={'direction':'direction','phase':'phase','execution_phase':'execution.phase',
        'work_status':'work.status','started_at':'work.started_at','completed_at':'work.completed_at',
        'retry_after':'work.retry_after','recover_after':'work.recover_after','retry_count':'work.retry_count',
        'retryable':'work.retryable','operation':'work.operation','work_phase':'work.phase',
        'failed_at':'work.failed_at','elapsed_ms':'work.elapsed_ms','error_code':'work.error_code',
        'steps':'work.completed_steps','count':'count','candidates':'candidate_count',
        'applied':'execution.applied','bytes':'execution.bytes','file_index':'execution.file_index',
        'latest_only':'latest_only','auto_latest':'auto_latest','parent_uid':'parent_uid',
        'prepared_uid':'prepared_uid','restart_uid':'restart_uid','load_index':'load_index'}
    projection=','.join("json_extract(state,'$."+path+"') AS "+name for name,path in fields.items())
    rows=await r.sql.query('SELECT uid,status,created_at,'+projection+
        ",substr(coalesce(json_extract(state,'$.work.error'),json_extract(state,'$.execution.error'),''),1,500) AS error"
        ",json_array_length(state,'$.execution.media') AS media_count"
        ",json_extract(state,'$.execution.media['||coalesce(json_extract(state,'$.execution.file_index'),0)||'].chunk_bytes') AS chunk_bytes"
        ' FROM sync_tasks WHERE '+where+' ORDER BY created_at DESC,uid DESC LIMIT 21',tuple(args))
    jobs=rows[:20]
    return {'jobs':jobs,'next':[jobs[-1]['created_at'],jobs[-1]['uid']] if len(rows)>20 else None,
            'schedule':await schedule_status(r.sql),'policy':policy(r),'server_time':now()}
