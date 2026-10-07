"""One bounded metadata batch per tick (up to 50 rows). NEVER delete external objects or business data."""
class Retention:
    def __init__(self,db,days=90):
        if type(days)!=int or not 7<=days<=3650:raise ValueError('Retention must be 7..3650 days')
        self.db,self.days=db,days
    async def step(self,now,grant_id=None,*,requested_only=False):
        clause='' if grant_id is None else ' AND grant_id=?'
        args=(now-self.days*86400,now,*(() if grant_id is None else (grant_id,)))
        rows=await self.db.query("""SELECT task_id FROM sync_tasks t WHERE status IN ('done','cancelled')
          AND (delete_requested=1 OR coalesce(last_progress_at,created_at)<?) AND lease_until<=?
          AND NOT EXISTS(SELECT 1 FROM sync_parts WHERE task_id=t.task_id)
          AND NOT EXISTS(SELECT 1 FROM sync_files WHERE task_id=t.task_id AND status!='done')"""+clause+(' AND delete_requested=1' if requested_only else '')+' ORDER BY delete_requested DESC,coalesce(last_progress_at,created_at),task_id LIMIT 1',args)
        if not rows:return {'action':'idle'}
        uid=rows[0]['task_id']
        # Terminal tasks cannot be resumed. Rows with object keys are historical
        # receipts, not the source of truth for live website media references.
        extra=await self.db.query("SELECT name FROM sqlite_schema WHERE type='table' AND name='sync_record_receipts'")
        for table in ('sync_events','sync_file_parts','sync_files','sync_items',*(('sync_record_receipts',) if extra else ())):

            result=await self.db.batch([(f'DELETE FROM {table} WHERE rowid IN (SELECT rowid FROM {table} WHERE task_id=? LIMIT 50)',(uid,))])
            if result[0]['meta']['changes']:return {'action':'history-trimmed','task_id':uid}
        await self.db.batch([('UPDATE sync_schedules SET last_task_id=NULL WHERE last_task_id=?',(uid,)),('DELETE FROM sync_tasks WHERE task_id=? AND status IN (\'done\',\'cancelled\')',(uid,))])
        return {'action':'history-pruned','task_id':uid}
