"""Read-only bounded task monitoring; never load task payloads or contact peers."""
import json
from .catalog import Error,now
from .site_sync_schedule import status as schedule_status
from .site_sync_work import policy
from .site_sync_checkpoint import recovery_state
from .site_sync_gate import waiting

async def read(r,options=None):
    options=options or {};after=options.get('after');active=options.get('active',True)
    if type(active) is not bool:raise Error('任务状态筛选无效')
    args=[];where="coalesce(json_extract(state,'$.history_deleting'),0)=0"
    if active:
        where+=" AND status IN ('reading','ready') AND (coalesce(json_extract(state,'$.execution.phase'),'pending') NOT IN ('done','cancelled') OR json_extract(state,'$.work.status')='running')"
    if after is not None:
        if not isinstance(after,list) or len(after)!=2 or any(not isinstance(x,str) or len(x)>128 for x in after):raise Error('任务状态游标无效')
        where+=' AND (created_at,uid)<(?,?)';args+=after
    fields={'direction':'direction','phase':'phase','execution_phase':'execution.phase',
        'work_status':'work.status','started_at':'work.started_at','completed_at':'work.completed_at',
        'retry_after':'work.retry_after','recover_after':'work.recover_after','retry_count':'work.retry_count',
        'retryable':'work.retryable','operation':'work.operation','work_phase':'work.phase',
        'slow_retry':'work.slow_retry','pace_after':'work.pace_after','resource_level':'work.resource_level','failed_at':'work.failed_at','elapsed_ms':'work.elapsed_ms','error_code':'work.error_code',
        'steps':'work.completed_steps','count':'count','candidates':'candidate_count',
        'applied':'execution.applied','bytes':'execution.bytes','file_index':'execution.file_index',
        'approval_id':'approval.request_id','latest_only':'latest_only','auto_latest':'auto_latest','parent_uid':'parent_uid',
        'prepared_uid':'prepared_uid','restart_uid':'restart_uid','load_index':'load_index'}
    fields.update({key:'work.'+key for key in ('checkpoint_version','progress_events','last_progress_at','total_failures','uncertain_attempts','stalled_attempts','last_outcome','failures_with_progress','no_progress_failures','last_error_code','last_error_at','reconciled_at')})
    projection=','.join("json_extract(state,'$."+path+"') AS "+name for name,path in fields.items())
    rows=await r.sql.query('SELECT uid,status,created_at,'+projection+
        ",substr(coalesce(json_extract(state,'$.work.error'),json_extract(state,'$.execution.error'),''),1,500) AS error"
        ",json_array_length(state,'$.execution.media') AS media_count"
        ",json_extract(state,'$.execution.media['||coalesce(json_extract(state,'$.execution.file_index'),0)||'].chunk_bytes') AS chunk_bytes"
        ",json_extract(m.value,'$.enabled') AS manual_enabled,json_extract(m.value,'$.mode') AS manual_mode,json_extract(m.value,'$.message') AS manual_message,json_extract(m.value,'$.due') AS manual_due,json_extract(m.value,'$.paused_by_user') AS manual_paused,json_extract(m.value,'$.finished') AS manual_finished"
        " ,d.value AS scheduler FROM sync_tasks LEFT JOIN service_meta m ON m.key='site-sync:manual:'||sync_tasks.uid LEFT JOIN service_meta d ON d.key='site-sync:scheduler-attempt:'||sync_tasks.uid WHERE "+where+' ORDER BY created_at DESC,uid DESC LIMIT 21',tuple(args))
    jobs=rows[:20];stamp=now();schedule=await schedule_status(r.sql)
    current=(schedule.get('current_task') or {}).get('uid');cursor=schedule.get('state',{}).get('preview_uid')
    for job in jobs:
        job['scheduler']=json.loads(job['scheduler'] or '{}')
        work={key:job.get(key) for key in ('retryable','retry_after','recover_after','stalled_attempts')}
        work['status']=job['work_status']
        job['recovery_state']='expired' if job['status']=='expired' else recovery_state(work,job['execution_phase'],at=stamp)
        reason,deadline=waiting(job,stamp)
        if job['uid']==schedule.get('state',{}).get('last_task_uid'):reason,deadline='complete',None
        automatic=bool(schedule.get('enabled') and (job['execution_phase'] or (schedule.get('auto_pull') and not job['approval_id'] and (job['uid']==cursor or job['parent_uid']==cursor))))
        if job.get('manual_mode'):
            automatic=bool(job.get('manual_enabled'))
            if job.get('manual_finished') and job['manual_mode']=='read':reason,deadline='waiting_confirmation',None
            if automatic and (job.get('manual_due') or '')>stamp:
                deadline=max(deadline or '',job['manual_due']);reason='retry_wait'
        if automatic and job['uid']==current and schedule.get('wait_reason')=='lease_wait':
            reason,deadline='lease_wait',schedule.get('next_attempt_at')
        if automatic and not job.get('manual_mode') and schedule.get('wait_reason')=='needs_attention' and schedule.get('state',{}).get('error'):
            reason,deadline='needs_attention',None
        scheduler=job['scheduler']
        if automatic and scheduler.get('retryable') is False:
            reason,deadline='needs_attention',None
        elif automatic and scheduler.get('retry_after','')>stamp:
            reason,deadline='retry_wait',max(deadline or '',scheduler['retry_after'])
        if reason=='complete':mode='complete'
        elif reason in ('needs_attention','missing'):mode='needs_attention'
        elif job.get('manual_mode'):
            mode='background' if automatic else 'complete' if job.get('manual_finished') and job['manual_mode'] not in ('read','prepare') else 'manual'
        elif not schedule.get('enabled'):mode='disabled'
        elif not automatic:mode='manual'
        elif current and job['uid']!=current:mode='queued'
        else:mode='background'
        job.update(advance_mode=mode,wait_reason=reason,next_attempt_at=deadline if mode=='background' else None)

    return {'jobs':jobs,'next':[jobs[-1]['created_at'],jobs[-1]['uid']] if len(rows)>20 else None,
            'schedule':schedule,'policy':policy(r),'server_time':stamp}
