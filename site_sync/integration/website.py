"""Bounded DB-side record envelopes for the selected teacher website schema.
The source freezes <=1MiB in SQLite/D1, slices bytes in SQL, and never transfers
accounts or secrets in ordinary module mode. Privileged full clones delegate
to clone.py and include account/password-hash restoration.
"""
import hashlib,json,time
from .catalog import SCOPES,COLUMNS,RELATIONS,row_json
from site_sync.runtime.mapping import MappedWebsite
from site_sync.transport.protocol import encode,manifest
from site_sync.core.authority import AuthorizationError,ConflictError

class TeacherWebsite(MappedWebsite):
    def __init__(self,db,resource=None):
        self.db,self.resource=db,resource
        self.modules={t:{'table':t,'id':'uid','version':'updated_at'} for t in SCOPES}
    async def check(self,db):
        await db.query('SELECT module FROM sync_exports LIMIT 0')
    async def discover(self,ctx):
        if json.loads(ctx.task['scope_json'])==['site_clone']:
            from .clone import discover
            return await discover(self,ctx)
        return await super().discover(ctx)
    async def source_candidates(self,q):
        if q.get('scope')==['site_clone']:
            from .clone import candidates
            return await candidates(self,q)
        if 'site_clone' in q.get('scope',[]):raise AuthorizationError('Clone must be selected alone')
        scope=q.get('scope');cursor=q.get('cursor')
        if not isinstance(scope,list) or not scope or len(scope)>len(SCOPES) or any(t not in SCOPES for t in scope):raise AuthorizationError('Invalid scope')
        if cursor is not None and (not isinstance(cursor,list) or len(cursor)!=3 or type(cursor[0])!=int or any(not isinstance(x,str) for x in cursor[1:])):raise ConflictError('Invalid cursor')
        clauses=[];args=[]
        # ISO timestamps are fixed UTC milliseconds. Integer cursor is lossless;
        # primary query retains the updated_at index for its ORDER BY.
        for t in sorted(set(scope)):
            where='';params=[]
            if cursor:
                from datetime import datetime,timezone
                stamp=datetime.fromtimestamp(cursor[0]/1000,timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
                where=' WHERE updated_at<? OR (updated_at=? AND (? > ? OR (?=? AND uid>?)))'
                params=[stamp,stamp,t,cursor[1],t,cursor[1],cursor[2]]
            clauses.append(f"SELECT * FROM (SELECT '{t}' module,uid id,updated_at version,CAST(strftime('%s',updated_at) AS INTEGER)*1000+CAST(substr(updated_at,21,3) AS INTEGER) updated,'upsert' action FROM \"{t}\"{where} ORDER BY updated_at DESC,uid LIMIT 1)")
            args+=params
            where='module=?';params=[t]
            if cursor:where+=' AND (updated<? OR (updated=? AND (module>? OR (module=? AND record_id>?))))';params+= [cursor[0],cursor[0],cursor[1],cursor[1],cursor[2]]
            clauses.append("SELECT * FROM (SELECT module,record_id id,version,updated,'delete' action FROM sync_tombstones WHERE "+where+' ORDER BY updated DESC,record_id LIMIT 1)');args+=params
        rows=await self.db.query('SELECT * FROM ('+' UNION ALL '.join(clauses)+') ORDER BY updated DESC,module,id LIMIT 1',args)
        i=rows[0] if rows else None
        return {'item':i,'cursor':[i['updated'],i['module'],i['id']] if i else None}
    async def snapshot(self,q):
        if q['module']=='site_clone':
            from .clone import snapshot
            return await snapshot(self,q)
        t=q['module'];self.mapping(t)
        request_id=q.get('task','')
        if not isinstance(request_id,str) or len(request_id)>128:raise ValueError('Snapshot identity bound')
        saved=await self.db.query('SELECT length(body) bytes,files_json,body_sha256 FROM sync_exports WHERE module=? AND record_id=? AND version=? AND request_id=?',(t,q['record'],q['version'],request_id))
        if not saved:
            # Payload is assembled in the DB. Only metadata/lengths cross Python.
            selects=[f"SELECT 99 rank,'{t}' module,{row_json(t)} row FROM \"{t}\" r WHERE r.uid=? AND r.updated_at=?"]
            params=[q['record'],q['version']]
            for n,(field,dep) in enumerate(RELATIONS.get(t,{}).items()):
                selects.append(f"SELECT {n} rank,'{dep}' module,{row_json(dep)} row FROM \"{dep}\" r JOIN \"{t}\" p ON p.\"{field}\"=r.uid WHERE p.uid=? AND p.updated_at=?")
                params += [q['record'],q['version']]
            # The main row must still match; dependency changes after this statement
            # cannot alter the immutable export used by subsequent slices.
            rows="(SELECT json_group_array(json_object('module',module,'row',json(row))) FROM ("+' UNION ALL '.join(selects)+" ORDER BY rank))"
            payload=f"WITH records AS (SELECT {rows} value), assets AS (SELECT m.* FROM media_assets m,records WHERE m.status='active' AND (instr(records.value,m.object_key)>0 OR instr(records.value,m.uid)>0) ORDER BY m.uid LIMIT 17) SELECT json_object('rows',json(records.value),'media',json((SELECT json_group_array(json({row_json('media_assets','m')})) FROM assets m))) body,(SELECT count(*) FROM assets) media_count FROM records"
            sql="INSERT INTO sync_exports(module,record_id,version,request_id,body,files_json,expires_at) SELECT ?,?,?,?,CAST(body AS BLOB),'[]',? FROM ("+payload+") WHERE length(CAST(body AS BLOB))<=1048576 AND media_count<=16 AND json_array_length(body,'$.rows')>0 AND EXISTS(SELECT 1 FROM \""+t+'\" WHERE uid=? AND updated_at=?) ON CONFLICT(module,record_id,version,request_id) DO NOTHING'
            await self.db.batch([(sql,(t,q['record'],q['version'],request_id,int(time.time())+604800,*params,q['record'],q['version']))])
            saved=await self.db.query('SELECT length(body) bytes,files_json,body_sha256 FROM sync_exports WHERE module=? AND record_id=? AND version=? AND request_id=?',(t,q['record'],q['version'],request_id))
            if not saved:raise ConflictError('Source changed or envelope exceeds 1MiB / 16 media')
        identity=(t,q['record'],q['version'],request_id)
        digest=saved[0]['body_sha256']
        if digest is None:
            # One bounded hash per immutable export, never one hash per slice.
            raw=await self.db.query('SELECT body FROM sync_exports WHERE module=? AND record_id=? AND version=? AND request_id=?',identity)
            if not raw:raise OSError('Snapshot removed during creation; retry')
            digest=hashlib.sha256(bytes(raw[0]['body'])).hexdigest()
            await self.db.batch([('UPDATE sync_exports SET body_sha256=? WHERE module=? AND record_id=? AND version=? AND request_id=? AND body_sha256 IS NULL',(digest,*identity))])
        if q.get('snapshot_hash') is not None and q['snapshot_hash']!=digest:raise ConflictError('Snapshot content changed; retained progress cannot be mixed')
        media=await self.db.query("SELECT json_extract(value,'$.uid') id,json_extract(value,'$.updated_at') version,json_extract(value,'$.size') size,json_extract(value,'$.storage_kind') kind,json_extract(value,'$.object_key') object_key FROM sync_exports,json_each(CAST(body AS TEXT),'$.media') WHERE module=? AND record_id=? AND version=? AND request_id=?",(t,q['record'],q['version'],request_id))
        if any(m['kind'] not in ('local','r2') or not 0<=m['size']<=1024*1024*1024 for m in media):raise ConflictError('Unsupported media storage or size (0..1GiB)')
        files=[{k:m[k] for k in ('id','version','size')} for m in media]
        await self.db.batch([('UPDATE sync_exports SET files_json=?,expires_at=? WHERE module=? AND record_id=? AND version=? AND request_id=?',(json.dumps(media,separators=(',',':')),int(time.time())+604800,t,q['record'],q['version'],request_id))])
        return manifest({'version':q['version'],'snapshot_hash':digest,'fields':{'payload':saved[0]['bytes']},'files':files},q['version'])
    async def source_read(self,q):
        self.mapping(q['module'])
        if q['kind']=='manifest':return await self.snapshot(q)
        if q['kind']!='slice' or q.get('field')!='payload':raise ConflictError('Invalid read kind')
        rows=await self.db.query('SELECT body_sha256,substr(body,?,?) data FROM sync_exports WHERE module=? AND record_id=? AND version=? AND request_id=?',(q['offset']+1,q['length'],q['module'],q['record'],q['version'],q.get('task','')))
        if not rows:
            if not q.get('snapshot_hash'):raise ConflictError('Missing snapshot identity for recovery')
            await self.snapshot(q)
            rows=await self.db.query('SELECT body_sha256,substr(body,?,?) data FROM sync_exports WHERE module=? AND record_id=? AND version=? AND request_id=?',(q['offset']+1,q['length'],q['module'],q['record'],q['version'],q.get('task','')))
            if not rows:raise OSError('Snapshot unavailable; retry')
        if q.get('snapshot_hash') is not None and rows[0]['body_sha256']!=q['snapshot_hash']:raise ConflictError('Snapshot content changed')
        await self.db.batch([('UPDATE sync_exports SET expires_at=? WHERE module=? AND record_id=? AND version=? AND request_id=?',(int(time.time())+604800,q['module'],q['record'],q['version'],q.get('task','')))])
        return bytes(rows[0]['data'])
    async def apply(self,ctx):
        if json.loads(ctx.task['scope_json'])==['site_clone']:
            from .clone import apply
            return await apply(self,ctx)
        records=await self.db.query("SELECT * FROM sync_items WHERE task_id=? AND selected=1 AND status='staged' ORDER BY item_id LIMIT 1",(ctx.task['task_id'],))
        if not records:await ctx.advance('cleanup');return
        i=records[0];t=i['module'];self.mapping(t)
        if i['action']=='delete':
            statement=(f'DELETE FROM "{t}" WHERE uid=? AND updated_at=?',(i['record_id'],i['target_version'])) if i['target_version'] else (f'UPDATE sync_items SET status=status WHERE task_id=? AND item_id=? AND NOT EXISTS(SELECT 1 FROM "{t}" WHERE uid=?)',(i['task_id'],i['item_id'],i['record_id']))
            await ctx.commit_item(i['item_id'],statement);return
        # SQL reconstructs staged UTF-8 once in an integration scratch row, never
        # a Python full-record json.loads/string/hash. Deleted in the same batch.
        body="(SELECT CAST(group_concat(data,'') AS TEXT) FROM (SELECT data FROM sync_parts WHERE task_id=? AND item_id=? AND field='payload' ORDER BY offset))"
        params=(i['task_id'],i['item_id'])
        summary=await self.db.query("SELECT json_extract(value,'$.module') module,json_extract(value,'$.row.uid') uid,json_extract(value,'$.row.updated_at') version FROM json_each("+body+",'$.rows')",params)
        allowed=set(json.loads((await self.db.query('SELECT scopes_json FROM sync_grants WHERE grant_id=?',(ctx.task['grant_id'],)))[0]['scopes_json']))
        if not 1<=len(summary)<=4 or any(v['module'] not in allowed or v['module'] not in SCOPES for v in summary) or (summary[-1]['module'],summary[-1]['uid'],summary[-1]['version'])!=(t,i['record_id'],i['source_version']):raise ConflictError('Envelope identity or dependency authorization mismatch')
        media=await self.db.query("SELECT json_extract(value,'$.uid') uid,json_extract(value,'$.updated_at') version,json_extract(value,'$.object_key') object_key FROM json_each("+body+",'$.media')",params)
        if len(media)>16:raise ConflictError('Media bound')
        files=await self.db.query('SELECT * FROM sync_files WHERE task_id=? AND item_id=?',(i['task_id'],i['item_id']))
        byid={f['source_file_id']:f for f in files}
        if set(byid)!={m['uid'] for m in media} or any(f['status']!='uploaded' for f in files):raise ConflictError('Media incomplete')
        statements=[ctx.repo.assertion(ctx.task,ctx.clock(),write=True,extra="t.phase='apply'")]
        # Primary CAS also fences inserts. Dependencies use their own captured CAS.
        before=await self.db.query(f'SELECT updated_at FROM "{t}" WHERE uid=?',(i['record_id'],))
        if (before[0]['updated_at'] if before else None)!=i['target_version']:
            receipts=await self.db.query('SELECT version FROM sync_record_receipts WHERE task_id=? AND module=? AND record_id=?',(i['task_id'],t,i['record_id']))
            if not before or not receipts or receipts[0]['version']!=before[0]['updated_at'] or receipts[0]['version']!=i['source_version']:raise ConflictError('Target changed after preview')
        transformed=body;transform_args=list(params);published=[];imports=[]
        reused_rows=await self.db.query("SELECT v.source_uid,v.source_version,a.uid,a.object_key FROM sync_media_versions v JOIN media_assets a ON a.uid=v.target_uid WHERE v.peer_id=? AND a.status='active' AND v.source_uid IN (SELECT json_extract(value,'$.uid') FROM json_each("+body+",'$.media'))",(ctx.task['peer_id'],*params))
        reuse={(v['source_uid'],v['source_version']):v for v in reused_rows}
        for n,m in enumerate(media):
            f=byid[m['uid']]
            if f['source_version']!=m['version']:raise ConflictError('Media version mismatch')
            reused=reuse.get((m['uid'],m['version']))
            if reused:uid,key=reused['uid'],reused['object_key']
            else:
                uid=hashlib.sha256(encode([ctx.task['peer_id'],m['uid'],m['version']])).hexdigest()[:32]
                key=f['staging_key']+('/object' if self.resource.kind=='local' else '')
                imports.append({'source':m['uid'],'version':m['version'],'uid':uid,'key':key})
                published.append(f['file_id'])
            # Old keys and /media/UID references are rewritten before record insertion.
            transformed='replace(replace('+transformed+',?,?),?,?)';transform_args += [m['object_key'],key,'/media/'+m['uid'],'/media/'+uid]
        if imports:
            cols=COLUMNS['media_assets'];expr=[]
            for c in cols:
                if c=='uid':expr.append("json_extract(mapping.value,'$.uid')")
                elif c=='object_key':expr.append("json_extract(mapping.value,'$.key')")
                elif c=='storage_kind':expr.append('?')
                else:expr.append("json_extract(asset.value,'$."+c+"')")
            mapping=json.dumps(imports,separators=(',',':'))
            statements.append(('WITH src AS (SELECT '+body+' body) INSERT INTO media_assets('+','.join('"'+c+'"' for c in cols)+") SELECT "+','.join(expr)+" FROM src,json_each(src.body,'$.media') asset JOIN json_each(?) mapping ON json_extract(mapping.value,'$.source')=json_extract(asset.value,'$.uid')",(*params,self.resource.kind,mapping)))
            statements.append(("INSERT INTO sync_media_versions SELECT ?,json_extract(value,'$.source'),json_extract(value,'$.version'),json_extract(value,'$.uid') FROM json_each(?)",(ctx.task['peer_id'],mapping)))
        for n,s in enumerate(summary):
            mod=s['module'];cols=COLUMNS[mod]
            target=await self.db.query(f'SELECT updated_at FROM "{mod}" WHERE uid=?',(s['uid'],))
            # Existing dependencies are not silently overwritten: same source version
            # is safe; different local versions require selecting that module explicitly.
            if n<len(summary)-1 and target:
                if target[0]['updated_at']!=s['version']:raise ConflictError('Related record differs; synchronize its module first')
                continue
            vals=','.join("json_extract(b,'$.rows["+str(n)+"].row."+c+"')" for c in cols)
            sql='WITH src AS (SELECT '+transformed+' b) '
            if target:
                sql+=f'UPDATE "{mod}" SET ('+','.join('"'+c+'"' for c in cols)+')=(SELECT '+vals+f' FROM src) WHERE uid=? AND updated_at=?';args=(*transform_args,s['uid'],target[0]['updated_at'])
            else:
                sql+=f'INSERT INTO "{mod}"('+','.join('"'+c+'"' for c in cols)+') SELECT '+vals+f' FROM src WHERE NOT EXISTS(SELECT 1 FROM "{mod}" WHERE uid=?)';args=(*transform_args,s['uid'])
            statements += [(sql,args),('UPDATE sync_schema SET version=CASE WHEN changes()=1 THEN version ELSE -1 END WHERE singleton=1',())]
            statements.append(('INSERT INTO sync_record_receipts VALUES(?,?,?,?) ON CONFLICT(task_id,module,record_id) DO UPDATE SET version=excluded.version',(i['task_id'],mod,s['uid'],s['version'])))
        statements += [("UPDATE sync_items SET status='applied' WHERE task_id=? AND item_id=? AND status='staged'",params)]
        if published:statements.append(("UPDATE sync_files SET status='published' WHERE task_id=? AND file_id IN (SELECT value FROM json_each(?))",(i['task_id'],json.dumps(published))))
        statements.append(('UPDATE sync_tasks SET progress_seq=progress_seq+1,revision=revision+1,last_progress_at=? WHERE task_id=?',(ctx.clock(),i['task_id'])))
        await self.db.batch(statements)
