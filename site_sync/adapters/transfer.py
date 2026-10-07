"""One bounded durable action per engine invocation; no whole-record reads."""
import hashlib
import json
from site_sync.adapters.staging import StagingStore
from site_sync.transport.protocol import encode,manifest
from site_sync.core.authority import ConflictError


class Transfer:
    def __init__(self,repo,peer,media=None):
        self.repo,self.db,self.peer,self.media=repo,repo.db,peer,media

    async def __call__(self,ctx):
        t=ctx.task;now=ctx.clock
        rows=await self.db.query("SELECT * FROM sync_items WHERE task_id=? AND selected=1 AND status='pending' ORDER BY item_id LIMIT 1",(t['task_id'],))
        if not rows:await ctx.advance('apply');return
        item=rows[0]
        if item['action']=='delete':await self.repo.mark_staged(t,item['item_id'],0,now());return
        if item['manifest_json'] is None:
            m=manifest(await self.peer.manifest(item),item['source_version']);raw=encode(m).decode()
            # Legacy partial staging has no pinned manifest. Refuse it rather
            # than inferring that old bytes belong to this source revision.
            if item['staged_bytes']:raise ConflictError('Legacy partial item requires a fresh task')
            statements=[self.repo.assertion(t,now(),write=True,extra="t.phase='transfer'"),
                ('UPDATE sync_items SET manifest_json=? WHERE task_id=? AND item_id=? AND manifest_json IS NULL',(raw,t['task_id'],item['item_id'])),
                ('UPDATE sync_tasks SET progress_seq=progress_seq+1,revision=revision+1,last_progress_at=? WHERE task_id=? AND changes()=1',(now(),t['task_id']))]
            for f in m.get('files',[]):
                if self.media is None:raise ConflictError('Media adapter required')
                fid=hashlib.sha256(encode([item['item_id'],f['id']])).hexdigest()
                operation=hashlib.sha256(encode([t['task_id'],fid])).hexdigest()
                statements.append(('''INSERT INTO sync_files(task_id,file_id,source_version,total_bytes,storage_kind,staging_key,operation_id,part_bytes,item_id,source_file_id)
                  VALUES(?,?,?,?,?,?,?,?,?,?)''',(t['task_id'],fid,f['version'],f['size'],self.media.kind,'sync/'+operation,operation,self.media.part_bytes,item['item_id'],f['id'])))
            await self.db.batch(statements);return
        m=manifest(json.loads(item['manifest_json']),item['source_version'])
        offsets=await self.db.query('SELECT field,max(offset+length(data)) AS n,sum(length(data)) AS bytes FROM sync_parts WHERE task_id=? AND item_id=? GROUP BY field',(t['task_id'],item['item_id']))
        positions={x['field']:x['n'] for x in offsets}
        if any(x['field'] not in m['fields'] or x['n']!=x['bytes'] or x['n']>m['fields'][x['field']] for x in offsets):raise ConflictError('Invalid staged field layout')
        for field,total in sorted(m['fields'].items()):
            offset=positions.get(field,0)
            if offset<total:
                length=min(t['slice_bytes'],total-offset)
                data=await self.peer.slice(item,field,offset,length)
                if not isinstance(data,bytes) or len(data)!=length:raise ConflictError('Invalid slice size')
                await StagingStore(self.db).append(task_id=t['task_id'],item_id=item['item_id'],field=field,lease=t['lease_token'],grant_revision=t['grant_revision'],source_version=item['source_version'],expected_seq=t['progress_seq'],offset=offset,data=data,now=now());return
        files=await self.db.query("SELECT * FROM sync_files WHERE task_id=? AND item_id=? AND status NOT IN ('uploaded','published','done') ORDER BY file_id LIMIT 1",(t['task_id'],item['item_id']))
        if files:
            if self.media is None:raise ConflictError('Media adapter required')
            await self.media.step(ctx,item,files[0],self.peer);return
        await self.repo.mark_staged(t,item['item_id'],sum(m['fields'].values()),now())


class MediaReceipts:
    """Durable receipts guarded by the same live grant/lease as record writes."""
    def __init__(self,repo):self.repo,self.db=repo,repo.db
    def progress(self,t,now):
        return ('UPDATE sync_tasks SET progress_seq=progress_seq+1,revision=revision+1,last_progress_at=? WHERE task_id=? AND changes()=1',(now,t['task_id']))
    async def part(self,ctx,f,offset,length,etag):
        if offset!=f['committed_bytes'] or length!=min(f['part_bytes'],f['total_bytes']-offset) or not isinstance(etag,str) or not 0<len(etag)<=256:raise ConflictError('Invalid part receipt')
        number=offset//f['part_bytes']+1
        prior=await self.db.query('SELECT offset,length,etag FROM sync_file_parts WHERE task_id=? AND file_id=? AND part_number=?',(f['task_id'],f['file_id'],number))
        if prior:
            if prior[0]!={'offset':offset,'length':length,'etag':etag}:raise ConflictError('Conflicting receipt')
            await self.db.batch([self.repo.assertion(ctx.task,ctx.clock(),write=True)]);return
        await self.db.batch([self.repo.assertion(ctx.task,ctx.clock(),write=True,extra="t.phase='transfer' AND EXISTS(SELECT 1 FROM sync_files WHERE task_id=t.task_id AND file_id=? AND committed_bytes=? AND status IN ('pending','transferring'))",args=(f['file_id'],offset)),
            ('INSERT INTO sync_file_parts VALUES(?,?,?,?,?,?)',(f['task_id'],f['file_id'],number,offset,length,etag)),
            ("UPDATE sync_files SET committed_bytes=committed_bytes+?,status='transferring' WHERE task_id=? AND file_id=?",(length,f['task_id'],f['file_id'])),self.progress(ctx.task,ctx.clock())])
    async def uploaded(self,ctx,f):
        await self.db.batch([self.repo.assertion(ctx.task,ctx.clock(),write=True,extra="t.phase='transfer' AND EXISTS(SELECT 1 FROM sync_files WHERE task_id=t.task_id AND file_id=? AND committed_bytes=total_bytes)",args=(f['file_id'],)),
            ("UPDATE sync_files SET status='uploaded' WHERE task_id=? AND file_id=? AND status IN ('pending','transferring')",(f['task_id'],f['file_id'])),self.progress(ctx.task,ctx.clock())])

    async def commit_item(self,ctx,item_id,statement):
        # Business statement includes immutable object keys in its own update.
        # Receipt publication is in the same DB transaction, never after it.
        await self.repo.commit_item(ctx.task,item_id,statement,ctx.clock())


class Cleanup:
    def __init__(self,repo,media):self.repo,self.media=repo,media
    async def partial_progress(self,ctx):
        await self.repo.db.batch([self.repo.assertion(ctx.task,ctx.clock(),extra="t.phase='cleanup'"),
          ('UPDATE sync_tasks SET progress_seq=progress_seq+1,revision=revision+1,last_progress_at=? WHERE task_id=?',(ctx.clock(),ctx.task['task_id']))])
    async def __call__(self,ctx):
        if await self.repo.cleanup_one(ctx.task,ctx.clock()):return
        rows=await self.repo.db.query("SELECT * FROM sync_files WHERE task_id=? AND status!='done' ORDER BY file_id LIMIT 1",(ctx.task['task_id'],))
        if rows:
            f=rows[0]
            await self.repo.db.batch([self.repo.assertion(ctx.task,ctx.clock(),extra="t.phase='cleanup'")])
            if f['status']=='published' and hasattr(self.media,'prune_parts'):
                if await self.media.prune_parts(f) is False:
                    await self.partial_progress(ctx);return
            if f['status']!='published':
                if self.media is None:raise ConflictError('Media cleanup adapter missing')
                # Only owned staging objects; published business files survive.
                if await self.media.discard(f) is False:
                    await self.partial_progress(ctx);return
            await self.repo.db.batch([self.repo.assertion(ctx.task,ctx.clock(),extra="t.phase='cleanup'"),
              ("UPDATE sync_files SET status='done' WHERE task_id=? AND file_id=?",(f['task_id'],f['file_id'])),
              MediaReceipts(self.repo).progress(ctx.task,ctx.clock())]);return
        await self.repo.db.batch([("DELETE FROM service_meta WHERE key='sync:clone-lock' AND value=?",(ctx.task['task_id'],))])
        await ctx.advance('done')
