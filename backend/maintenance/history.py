"""Historical retention; never delete payloads or change current quota accounting."""
import asyncio
from dataclasses import dataclass
from datetime import datetime,timezone
from backend.app.native.storage import LocalStore
from backend.app.native.media_inventory_store import LocalInventory
from transfer.backend.accounting import milliseconds,periods,assertion

DAY=86400000
BATCH=200
TASKS=10
CHILDREN=20

@dataclass(frozen=True)
class HistoryPolicy:
    operation_days:int=180
    transfer_days:int=90
    def __post_init__(self):
        if any(type(x)!=int or not 1<=x<=3650 for x in (self.operation_days,self.transfer_days)):
            raise ValueError('History retention must be 1..3650 days')


def iso(at):return datetime.fromtimestamp(at/1000,timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')

# A deleted payload is immutable. Missing/unknown states never count as completed.
ELIGIBLE="""s.state='deleted' AND s.manifest IS NULL AND r.state='deleted'
 AND length(s.id)=32 AND s.id NOT GLOB '*[^0-9a-f]*'
 AND s.created_at<? AND s.expires_at<? AND r.expires_at<? AND r.updated_at<?
 AND json_valid(r.point) AND json_valid(r.extra)
 AND json_type(r.point,'$.bytes')='integer' AND json_extract(r.point,'$.bytes')=0
 AND json_type(r.point,'$.parts')='array' AND json_array_length(r.point,'$.parts')=0
 AND coalesce(json_extract(r.extra,'$.cleanup_until'),0)<=?
 AND coalesce(json_extract(r.extra,'$.cleanup_error'),'')=''
 AND NOT EXISTS(SELECT 1 FROM transfer_chunks c WHERE c.task=s.id)
 AND NOT EXISTS(SELECT 1 FROM transfer_allowances a WHERE a.task=s.id)
 AND NOT EXISTS(SELECT 1 FROM transfer_receivers v WHERE v.task=s.id AND v.expires_at>=?)
 AND NOT EXISTS(SELECT 1 FROM transfer_codes c WHERE c.mode='offline' AND c.target=s.id AND c.expires_at>=?)"""

class History:
    def __init__(self,sql,settings,policy=None,clock=milliseconds):
        self.sql=sql;self.policy=policy or HistoryPolicy();self.clock=clock
        self.files=LocalInventory(LocalStore(settings.transfer_media_dir))

    async def tick(self,apply=False,after=''):
        at=self.clock();cutoff=at-self.policy.transfer_days*DAY
        # Protect ALL supported timezones, including a week spanning a month boundary.
        protected=min(start for zone in ('UTC','Asia/Shanghai') for _,_,start in periods(zone,at))
        allowance_cutoff=min(cutoff,protected)
        logcut=iso(at-self.policy.operation_days*DAY)
        result={'counts':{},'errors':[],'retained_tasks':0,'more':False,'cursor':'','retention':{'operation_days':self.policy.operation_days,'transfer_days':self.policy.transfer_days,'quota_protected_from':iso(protected)}}
        from .log_retention import prune
        logs=await prune(self.sql,apply=apply,batch=BATCH,days=self.policy.operation_days,cutoff=logcut)
        result['counts']['operation_logs']=logs['count'];result['more']|=logs['more']
        rules=[('settings_audit','revision','changed_at<? AND revision<(SELECT revision FROM tool_settings WHERE id=1)',(logcut,)),
               ('transfer_allowances','rowid',"""created_at<? AND authorized_at IS NOT NULL AND authorized_at<?
                AND expires_at<? AND (finished_at IS NULL OR finished_at<?)
                AND ((length(task)=32 AND task NOT GLOB '*[^0-9a-f]*') OR
                     (length(task)=38 AND substr(task,1,6)='relay:' AND substr(task,7) NOT GLOB '*[^0-9a-f]*'))
                AND NOT EXISTS(SELECT 1 FROM temporary_shares s WHERE s.id=transfer_allowances.task AND s.state!='deleted')
                AND NOT EXISTS(SELECT 1 FROM recovery_tasks r WHERE r.id=transfer_allowances.task AND r.state!='deleted')""",
                (cutoff,allowance_cutoff,cutoff,cutoff))]
        task_args=(cutoff,cutoff,cutoff,cutoff,at,cutoff,cutoff)
        candidates=await self.sql.query('SELECT s.id FROM temporary_shares s JOIN recovery_tasks r ON r.id=s.id WHERE '+ELIGIBLE+' AND s.id>? ORDER BY s.id LIMIT ? ',(*task_args,after,TASKS))
        for table,pk,condition,args in rules:
            selection=f'SELECT {pk} FROM {table} WHERE {condition} ORDER BY {pk} LIMIT {BATCH}'
            try:
                rows=(await self.sql.batch([(f'DELETE FROM {table} WHERE {pk} IN ({selection}) AND ({condition}) RETURNING {pk}',args+args)]))[0] if apply else await self.sql.query(selection,args)
                result['counts'][table]=len(rows);result['more']|=len(rows)==BATCH
            except Exception as exc:result['errors'].append({'category':table,'reason':type(exc).__name__})
        for row in candidates:
            id=row['id'];result['cursor']=id
            try:
                # Even an empty/unexpected directory is retained for manual inspection.
                if self.files.path(id).exists():result['retained_tasks']+=1;continue
                children=[('recovery_members','task=?',(id,)),('transfer_receivers','task=?',(id,)),
                          ('transfer_codes',"mode='offline' AND target=?",(id,)),
                          ('service_meta','key>=? AND key<?',(f'folder:{id}:',f'folder:{id};'))]
                selected=[]
                for table,where,values in children:
                    selected.append((table,where,values,await self.sql.query(f'SELECT rowid FROM {table} WHERE {where} LIMIT {CHILDREN+1}',values)))
                partial=any(len(rows)>CHILDREN for _,_,_,rows in selected)
                if apply:
                    guard=assertion('EXISTS(SELECT 1 FROM temporary_shares s JOIN recovery_tasks r ON r.id=s.id WHERE '+ELIGIBLE+' AND s.id=?)',(*task_args,id))
                    statements=[guard]
                    for table,where,values,_ in selected:
                        statements.append((f'DELETE FROM {table} WHERE rowid IN (SELECT rowid FROM {table} WHERE {where} LIMIT {CHILDREN}) RETURNING rowid',values))
                    empty=' AND '.join(f'NOT EXISTS(SELECT 1 FROM {table} WHERE {where})' for table,where,_,_ in selected)
                    emptyargs=tuple(v for _,_,values,_ in selected for v in values)
                    statements.extend([('DELETE FROM temporary_shares WHERE id=? AND '+empty+' RETURNING id',(id,*emptyargs)),
                        ("DELETE FROM recovery_tasks WHERE id=? AND state='deleted' AND updated_at<? AND NOT EXISTS(SELECT 1 FROM temporary_shares WHERE id=?) RETURNING id",(id,cutoff,id))])
                    outcomes=await self.sql.batch(statements)
                    for index,(table,_,_,_) in enumerate(selected,1):result['counts'][table]=result['counts'].get(table,0)+len(outcomes[index])
                    result['counts']['transfer_tasks']=result['counts'].get('transfer_tasks',0)+len(outcomes[-1])
                else:
                    for table,_,_,rows in selected:result['counts'][table]=result['counts'].get(table,0)+min(CHILDREN,len(rows))
                    result['counts']['transfer_tasks']=result['counts'].get('transfer_tasks',0)+int(not partial)
                result['more']|=partial
            except Exception as exc:result['errors'].append({'category':'transfer_history','reason':type(exc).__name__})
            await asyncio.sleep(0)
        if len(candidates)==TASKS:result['more']=True
        else:result['cursor']=''
        return result
