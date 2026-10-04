"""Small SQL-only manual-task eligibility shared by Cron and local dispatch."""
PREFIX='site-sync:manual:'
BASE="json_array(json_extract(state,'$.direction'),json_extract(state,'$.scopes'),json_extract(state,'$.remote_id'),json_extract(state,'$.peer_revision'))"
BOUND="json_array(json_extract(state,'$.direction'),json_extract(state,'$.scopes'),json_extract(state,'$.remote_id'),json_extract(state,'$.peer_revision'),json_extract(state,'$.selection.selected'),json_extract(state,'$.approval.request_id'))"

def binding(mode):return BASE if mode=='read' else BOUND

async def candidate(sql,at):
    rows=await sql.query("""SELECT m.key,m.value,t.uid,json_extract(t.state,'$.work.attempt') AS work_attempt,
      json_extract(t.state,'$.work.failed_at') AS work_failed_at FROM service_meta m JOIN sync_tasks t
      ON t.uid=json_extract(m.value,'$.task_uid')
      WHERE m.key LIKE 'site-sync:manual:%' AND json_extract(m.value,'$.enabled')=1
      AND t.status IN ('reading','ready') AND coalesce(json_extract(t.state,'$.history_deleting'),0)=0
      AND coalesce(json_extract(m.value,'$.due'),'')<=?
      AND coalesce(json_extract(t.state,'$.work.pace_after'),'')<=?
      AND NOT EXISTS(SELECT 1 FROM admin_mutation_guards g WHERE g.uid='site-sync:task:'||t.uid
          AND strftime('%Y-%m-%dT%H:%M:%fZ',g.created_at,'+300 seconds')>?)
      AND (coalesce(json_extract(t.state,'$.work.status'),'saved')<>'running'
           OR coalesce(json_extract(t.state,'$.work.recover_after'),'')<=?)
      AND (coalesce(json_extract(t.state,'$.work.status'),'saved')<>'paused'
           OR json_extract(t.state,'$.work.retryable')=1 AND coalesce(json_extract(t.state,'$.work.retry_after'),'')<=?
           OR json_extract(t.state,'$.execution.phase') IN ('done','cancelled') OR json_extract(m.value,'$.mode')='cancel')
      ORDER BY coalesce(json_extract(m.value,'$.updated_at'),''),m.key LIMIT 1""",(at,at,at,at,at))
    return rows[0] if rows else None
