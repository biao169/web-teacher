"""Shared SQLite/D1 bounded staging statements. Used by the bounded transfer handler."""

GUARD = """t.task_id=? AND t.status='running' AND t.phase='transfer'
 AND t.lease_token=? AND t.lease_until>? AND t.grant_enabled=1
 AND t.grant_revision=? AND p.enabled=1 AND p.revision=t.peer_revision
 AND t.write_authorized=1 AND EXISTS(SELECT 1 FROM sync_grants g WHERE g.grant_id=t.grant_id
 AND g.enabled=1 AND g.can_write=1 AND g.revision=t.grant_revision
 AND (g.expires_at=0 OR g.expires_at>?)
 AND NOT EXISTS(SELECT 1 FROM json_each(t.scope_json) scope
 WHERE scope.value NOT IN (SELECT value FROM json_each(g.scopes_json))))
 AND s.singleton=1 AND s.version=4 AND s.maintenance=0"""
FROM = 'sync_tasks t JOIN sync_peers p ON p.peer_id=t.peer_id JOIN sync_schema s'


class StagingStore:
    def __init__(self, adapter):
        self.adapter = adapter

    async def append(self, *, task_id, item_id, field, lease, grant_revision,
                     source_version, expected_seq, offset, data, now):
        if not isinstance(data, bytes) or not 0 < len(data) <= 4*1024*1024 or offset < 0 or expected_seq < 0:
            raise ValueError('Invalid bounded slice')
        if not field or len(field) > 128:
            raise ValueError('Invalid field')
        auth = (task_id, lease, now, grant_revision, now)
        insert = f'''INSERT INTO sync_parts(task_id,item_id,field,offset,data)
          SELECT t.task_id,i.item_id,?,?,? FROM {FROM}
          JOIN sync_items i ON i.task_id=t.task_id
          WHERE {GUARD} AND i.item_id=? AND i.source_version=? AND i.status='pending' AND i.selected=1
          AND t.progress_seq=? AND length(?)<=t.slice_bytes
          AND ?=coalesce((SELECT offset+length(data) FROM sync_parts
             WHERE task_id=t.task_id AND item_id=i.item_id AND field=? ORDER BY offset DESC LIMIT 1),0)
          ON CONFLICT(task_id,item_id,field,offset) DO NOTHING'''
        # changes() propagates the successful insert through counters in this
        # ordered atomic batch; a replay changes neither data nor progress.
        statements = [
            (insert, (field, offset, data, *auth, item_id, source_version, expected_seq, len(data), offset, field)),
            ('UPDATE sync_items SET staged_bytes=staged_bytes+? WHERE task_id=? AND item_id=? AND changes()=1',
             (len(data), task_id, item_id)),
            ('UPDATE sync_tasks SET progress_seq=progress_seq+1,revision=revision+1,last_progress_at=? WHERE task_id=? AND changes()=1',
             (now, task_id)),
            (f'''SELECT c.data=? AS matches,t.progress_seq FROM {FROM}
             JOIN sync_items i ON i.task_id=t.task_id
             JOIN sync_parts c ON c.task_id=i.task_id AND c.item_id=i.item_id
             WHERE {GUARD} AND i.selected=1 AND i.item_id=? AND i.source_version=? AND c.field=? AND c.offset=?''',
             (data, *auth, item_id, source_version, field, offset)),
        ]
        result = await self.adapter.batch(statements)
        rows = result[-1]['results']
        if len(rows) != 1 or rows[0]['matches'] != 1:
            raise ValueError('Slice rejected: stale lease/grant/version, gap, or conflicting replay')
        return {'sequence': rows[0]['progress_seq'], 'offset': offset + len(data)}
