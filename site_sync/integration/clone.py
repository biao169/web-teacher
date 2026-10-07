"""Privileged full website clone. Records are staged before any restore writes.
Runtime leases, sessions, deployment identity and synchronization keys stay local.
"""
import hashlib,json,time
from backend.app.native.catalog import TABLES
from site_sync.transport.protocol import encode,manifest
from site_sync.core.authority import AuthorizationError,ConflictError
from site_sync.core.selection import is_restore,selected_tables,meta_record,meta_scope
SCOPE='site_clone'
AUTH=('auth_roles','auth_users','auth_permissions')
ORDER=('media_assets','profiles','students','research_interests','projects','publications','patents','courses','student_category_displays','news','navigation_items','site_settings','global_settings','messages','translation_cache','operation_logs','tool_settings',*AUTH)
COLS={t:tuple(c for c in spec['columns'] if c!='id') for t,spec in TABLES.items()}
COLS['tool_settings']=('id','revision','document','updated_at','updated_by')
SCHEMA=hashlib.sha256(encode(COLS)).hexdigest()
def pk(t):return 'id' if t=='tool_settings' else 'uid'
def rowjson(t):return 'json_object('+','.join("'"+c+"',r.\""+c+'\"' for c in COLS[t])+')'
def prefix(task):return 'sync:clone:'+task+':'
def key(task,record):return prefix(task)+record
def body_sql():return "(SELECT CAST(group_concat(data,'') AS TEXT) FROM (SELECT data FROM sync_parts WHERE task_id=? AND item_id=? AND field='payload' ORDER BY offset))"
async def inventory(db,tables=ORDER):
    rows=await db.query(' UNION ALL '.join("SELECT '"+t+"' name,count(*) n,coalesce(max(updated_at),'') stamp FROM \""+t+'\"' for t in tables))
    return {'schema':SCHEMA,'tables':rows}
def inventory_version(info):
    # Audit appends (including key rotation) must not invalidate a business snapshot.
    stable=dict(info,tables=[row for row in info['tables'] if row['name']!='operation_logs'])
    return hashlib.sha256(encode(stable)).hexdigest()
async def candidates(site,q):
    scope=q.get('scope',[SCOPE]);chosen=selected_tables(scope);module=SCOPE if scope==[SCOPE] else sorted(scope)[0]
    cursor=q.get('cursor')
    if cursor is None:
        info=await inventory(site.db,chosen);version=inventory_version(info);record=meta_record(scope)
    else:
        if not isinstance(cursor,list) or len(cursor)!=3 or cursor[0]!=0 or cursor[1] not in scope or not isinstance(cursor[2],str):raise ConflictError('Invalid clone cursor')
        # Keyset pagination uses each table's UID index; no repeated catalog-wide sort.
        after=cursor[2];start_table,separator,last=after.partition(':')
        tables=sorted(chosen)
        if after==meta_record(scope):start_table=tables[0];last=''
        elif not separator or start_table not in tables:raise ConflictError('Invalid clone cursor')
        rows=[]
        for table in tables[tables.index(start_table):]:
            threshold=last if table==start_table else ''
            if table=='tool_settings':
                threshold=int(threshold) if threshold else 0
            rows=await site.db.query(f'SELECT {pk(table)} id,updated_at version FROM "{table}" WHERE {pk(table)}>? ORDER BY {pk(table)} LIMIT 1',(threshold,))
            if rows:break
        if not rows:return {'item':None,'cursor':None}
        record,version=table+':'+str(rows[0]['id']),rows[0]['version']
        module=SCOPE if scope==[SCOPE] else 'restore_'+table
    return {'item':{'module':module,'id':record,'version':version,'updated':0,'action':'upsert'},'cursor':[0,module,record]}
async def check_source(site,q):
    version=inventory_version(await inventory(site.db,selected_tables(q.get('scope',[SCOPE]))))
    if q.get('expected')!=version:raise ConflictError('Source changed during clone; create a new clone task')
    return {'schema':SCHEMA,'unchanged':True}
async def snapshot(site,q):
    db=site.db;identity=(q['module'],q['record'],q['version'],q.get('task',''))
    if q['record'].startswith('00meta'):
        selection=meta_scope(q['record'])
        if q['module'] not in selection:raise AuthorizationError('Inventory scope denied')
    elif q['module']!=SCOPE and q['module']!='restore_'+q['record'].partition(':')[0]:raise AuthorizationError('Record scope denied')
    saved=await db.query('SELECT length(body) bytes,files_json,body_sha256 FROM sync_exports WHERE module=? AND record_id=? AND version=? AND request_id=?',identity)
    if not saved:
        if q['record'].startswith('00meta'):
            info=await inventory(db,selected_tables(selection))
            if inventory_version(info)!=q['version']:raise ConflictError('Clone inventory changed')
            data=encode({'table':'meta','row':info,'media':[]})
            statement=('INSERT INTO sync_exports(module,record_id,version,request_id,body,files_json,expires_at) VALUES(?,?,?,?,?,\'[]\',?) ON CONFLICT DO NOTHING',(*identity,data,int(time.time())+604800))
        else:
            t,_,uid=q['record'].partition(':')
            if t not in ORDER or not uid:raise AuthorizationError('Clone table denied')
            media="json_array(json("+rowjson(t)+"))" if t=='media_assets' else "json('[]')"
            statement=(f"INSERT INTO sync_exports(module,record_id,version,request_id,body,files_json,expires_at) SELECT ?,?,?,?,CAST(json_object('table','{t}','row',json({rowjson(t)}),'media',{media}) AS BLOB),'[]',? FROM \"{t}\" r WHERE CAST(r.{pk(t)} AS TEXT)=? AND r.updated_at=? AND length(CAST(json_object('table','{t}','row',json({rowjson(t)}),'media',{media}) AS BLOB))<=1048576 ON CONFLICT DO NOTHING",(*identity,int(time.time())+604800,uid,q['version']))
        await db.batch([statement]);saved=await db.query('SELECT length(body) bytes,files_json,body_sha256 FROM sync_exports WHERE module=? AND record_id=? AND version=? AND request_id=?',identity)
        if not saved:raise ConflictError('Clone source version changed or envelope exceeds 1 MiB')
    digest=saved[0]['body_sha256']
    if not digest:
        if site.resource.kind!='local':
            from site_sync.runtime.bridge import NativeBridge
            digest=await NativeBridge(site.resource.sync_env.SYNC_NATIVE,db).call('snapshot_hash',{'identity':identity})
        else:
            raw=await db.query('SELECT body FROM sync_exports WHERE module=? AND record_id=? AND version=? AND request_id=?',identity);digest=hashlib.sha256(bytes(raw[0]['body'])).hexdigest()
        await db.batch([('UPDATE sync_exports SET body_sha256=? WHERE module=? AND record_id=? AND version=? AND request_id=?',(digest,*identity))])
    if q.get('snapshot_hash') and q['snapshot_hash']!=digest:raise ConflictError('Clone snapshot changed')
    media=await db.query("SELECT json_extract(value,'$.uid') id,json_extract(value,'$.updated_at') version,json_extract(value,'$.size') size,json_extract(value,'$.storage_kind') kind,json_extract(value,'$.object_key') object_key FROM sync_exports,json_each(CAST(body AS TEXT),'$.media') WHERE module=? AND record_id=? AND version=? AND request_id=?",identity)
    if any(m['kind'] not in ('local','r2') for m in media):raise ConflictError('Unsupported clone media storage')
    await db.batch([('UPDATE sync_exports SET files_json=?,expires_at=? WHERE module=? AND record_id=? AND version=? AND request_id=?',(json.dumps(media),int(time.time())+604800,*identity))])
    return manifest({'version':q['version'],'snapshot_hash':digest,'fields':{'payload':saved[0]['bytes']},'files':[{k:m[k] for k in ('id','version','size')} for m in media]},q['version'])
async def discover(site,ctx):
    t=ctx.task;selection=json.loads(t['scope_json']);peer=await site.runtime.peer_factory(t)
    page=await peer.candidates({'kind':'candidates','version':'catalog-v1','scope':selection,'cursor':json.loads(t['discovery_cursor']) if t['discovery_cursor'] else None})
    item=page.get('item')
    if item is None:await ctx.advance('await_confirmation');return
    if item.get('module') not in selection or item.get('action')!='upsert' or page.get('cursor')!=[0,item.get('module'),item.get('id')]:raise ConflictError('Invalid clone candidate')
    record=item['id'];table,_,uid=record.partition(':')
    if record!=meta_record(selection) and (table not in selected_tables(selection) or not uid or item['module'] not in (SCOPE,'restore_'+table)):raise ConflictError('Unknown clone record')
    if t['discovery_cursor'] and page['cursor'][2]<=json.loads(t['discovery_cursor'])[2]:raise ConflictError('Clone cursor did not advance')
    await ctx.add_item(item_id=hashlib.sha256(encode(record)).hexdigest(),module=item['module'],record_id=record,source_version=item['version'])
    await site.db.batch([ctx.repo.assertion(t,ctx.clock()),('UPDATE sync_tasks SET discovery_cursor=? WHERE task_id=?',(json.dumps(page['cursor']),t['task_id']))])
async def progress(ctx,statements):
    await ctx.repo.db.batch([ctx.repo.assertion(ctx.task,ctx.clock(),write=True),*statements,('UPDATE sync_tasks SET progress_seq=progress_seq+1,revision=revision+1,last_progress_at=? WHERE task_id=?',(ctx.clock(),ctx.task['task_id']))])
async def apply(site,ctx):
    db=site.db;t=ctx.task;selection=json.loads(t['scope_json']);chosen=selected_tables(selection);uid=t['task_id'];pre=prefix(uid);statekey='sync:clone-state:'+uid
    rows=await db.query("SELECT * FROM sync_items WHERE task_id=? AND status='staged' ORDER BY record_id LIMIT 1",(uid,))
    if rows:
        item=rows[0]
        if not item['selected']:raise ConflictError('A full clone requires approval of all records')
        body=body_sql();args=(uid,item['item_id'])
        summary=(await db.query("SELECT json_extract("+body+",'$.table') t,json_extract("+body+",'$.row.uid') u",(*args,*args)))[0]
        table,_,record=item['record_id'].partition(':')
        if item['record_id']!=meta_record(selection) and (summary['t']!=table or (table!='tool_settings' and summary['u']!=record)):raise ConflictError('Clone envelope identity mismatch')
        await progress(ctx,[('INSERT INTO service_meta(key,value) SELECT ?,'+body+' ON CONFLICT(key) DO NOTHING',(key(uid,item['record_id']),*args)),("UPDATE sync_items SET status='applied' WHERE task_id=? AND item_id=?",args)]);return
    state=await db.query('SELECT value FROM service_meta WHERE key=?',(statekey,));state=json.loads(state[0]['value']) if state else {'phase':'verify','table':0,'after':''}
    if state['phase']=='verify':
        missing=await db.query("SELECT 1 FROM sync_items WHERE task_id=? AND (selected!=1 OR status!='applied') LIMIT 1",(uid,))
        if missing:raise ConflictError('Full clone cannot apply a partial selection')
        meta=await db.query('SELECT value FROM service_meta WHERE key=?',(key(uid,meta_record(selection)),))
        if not meta or json.loads(meta[0]['value'])['row']['schema']!=SCHEMA:raise ConflictError('Clone schema mismatch')
        info=json.loads(meta[0]['value'])['row']
        if {x['name'] for x in info['tables']}!=set(chosen):raise ConflictError('Restore inventory selection mismatch')
        # Final authentication replacement is one bounded transaction.
        if sum(x['n'] for x in info['tables'] if x['name'] in AUTH)>1000:raise ConflictError('Authentication clone exceeds atomic restore bound (1000 rows)')
        for x in info['tables']:
            if x['name']=='operation_logs':continue
            count=await db.query('SELECT count(*) n FROM service_meta WHERE key LIKE ?',(pre+x['name']+':%',))
            if count[0]['n']!=x['n']:raise ConflictError('Clone inventory incomplete')
        peer=await site.runtime.peer_factory(t)
        result=await peer.candidates({'kind':'clone_check','version':'catalog-v1','expected':inventory_version(info),'scope':selection})
        if result!={'schema':SCHEMA,'unchanged':True}:raise ConflictError('Clone source changed')
        # Require at least one usable system administrator before modifying content.
        admin=await clone_admin(db,pre)
        if set(AUTH)<=set(chosen) and not admin:raise ConflictError('Clone has no active system administrator with data-tools access')
        locked=await db.query("SELECT value FROM service_meta WHERE key='sync:clone-lock'")
        if locked and locked[0]['value']!=uid:raise ConflictError('Another clone restore is in progress')
        state={'phase':'restore','table':0,'after':''}
        await progress(ctx,[('INSERT INTO service_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',('sync:clone-lock',uid)),('INSERT INTO service_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(statekey,json.dumps(state)))]);return
    if state['phase'] in ('restore','prune'):
        tables=[x for x in chosen if x not in AUTH]
        if state['phase']=='prune':tables=list(reversed(tables))
        if state['table']>=len(tables):
            state={'phase':'prune' if state['phase']=='restore' and set(chosen)==set(ORDER) else 'cleanup','table':0,'after':''}
            await progress(ctx,[('UPDATE service_meta SET value=? WHERE key=?',(json.dumps(state),statekey))]);return
        table=tables[state['table']];base=pre+table+':'
        if state['phase']=='restore':
            rows=await db.query('SELECT key FROM service_meta WHERE key LIKE ? AND key>? ORDER BY key LIMIT 1',(base+'%',state['after']))
            if rows:
                entry=rows[0]['key'];columns=COLS[table];select=','.join("json_extract(value,'$.row."+c+"')" for c in columns)
                statements=[]
                if table=='media_assets':
                    source_uid=entry[len(base):]
                    files=await db.query("SELECT f.* FROM sync_files f JOIN sync_items i ON i.task_id=f.task_id AND i.item_id=f.item_id WHERE f.task_id=? AND i.record_id=?",(uid,'media_assets:'+source_uid))
                    if len(files)!=1 or files[0]['status']!='uploaded':raise ConflictError('Clone media incomplete')
                    file=files[0];object_key=file['staging_key']+('/object' if site.resource.kind=='local' else '')
                    previous=await db.query('SELECT object_key FROM media_assets WHERE uid=?',(source_uid,))
                    if previous and previous[0]['object_key']!=object_key:
                        statements.append(('PRAGMA defer_foreign_keys=ON',()))
                        for ref_table,spec in TABLES.items():
                            for field,definition in spec['columns'].items():
                                if definition.get('references',{}).get('table')=='media_assets':
                                    statements.append((f'UPDATE "{ref_table}" SET "{field}"=? WHERE "{field}"=?',(object_key,previous[0]['object_key'])))
                    statements.append(("UPDATE service_meta SET value=json_set(value,'$.source_object_key',json_extract(value,'$.row.object_key'),'$.row.object_key',?,'$.row.storage_kind',?) WHERE key=?",(object_key,site.resource.kind,entry)))
                    statements.append(("UPDATE sync_files SET status='published' WHERE task_id=? AND file_id=?",(uid,file['file_id'])))
                    # Media IDs are retained; content key references are rewritten from source keys below.
                else:
                    mappings=await db.query("SELECT json_extract(a.value,'$.source_object_key') old,json_extract(a.value,'$.row.object_key') new,f.key field FROM service_meta a JOIN service_meta s ON s.key=? JOIN json_each(s.value,'$.row') f WHERE a.key LIKE ? AND f.type='text' AND f.key NOT IN ('uid','created_at','updated_at') AND json_extract(a.value,'$.source_object_key')!=json_extract(a.value,'$.row.object_key') AND instr(replace(f.value,json_extract(a.value,'$.row.object_key'),''),json_extract(a.value,'$.source_object_key'))>0 LIMIT 1",(entry,pre+'media_assets:%'))
                    if mappings:
                        m=mappings[0]
                        await progress(ctx,[("UPDATE service_meta SET value=json_set(value,?,replace(json_extract(value,?),?,?)) WHERE key=?",('$.row.'+m['field'],'$.row.'+m['field'],m['old'],m['new'],entry))]);return
                # Free unique values without REPLACE, which could cascade-delete related rows.
                unique={'news':'slug','student_category_displays':'key'}.get(table)
                if unique:
                    statements.append((f"UPDATE \"{table}\" SET \"{unique}\"='clone-'||?||'-'||uid WHERE uid!=json_extract((SELECT value FROM service_meta WHERE key=?),'$.row.uid') AND \"{unique}\"=json_extract((SELECT value FROM service_meta WHERE key=?),'$.row.{unique}')",(uid,entry,entry)))
                if table=='site_settings':
                    statements.append(("UPDATE site_settings SET is_active=0 WHERE uid!=json_extract((SELECT value FROM service_meta WHERE key=?),'$.row.uid') AND json_extract((SELECT value FROM service_meta WHERE key=?),'$.row.is_active')=1",(entry,entry)))
                if table=='translation_cache':
                    statements.append(("UPDATE translation_cache SET is_current=0 WHERE uid!=json_extract((SELECT value FROM service_meta WHERE key=?),'$.row.uid') AND (source_ref_key,target_lang)=(SELECT json_extract(value,'$.row.source_ref_key'),json_extract(value,'$.row.target_lang') FROM service_meta WHERE key=?) AND json_extract((SELECT value FROM service_meta WHERE key=?),'$.row.is_current')=1 AND json_extract((SELECT value FROM service_meta WHERE key=?),'$.row.status')='success'",(entry,entry,entry,entry)))
                sql=f'INSERT INTO "{table}"('+','.join('"'+c+'"' for c in columns)+') SELECT '+select+' FROM service_meta WHERE key=? ON CONFLICT('+pk(table)+') DO UPDATE SET '+','.join('"'+c+'"=excluded."'+c+'"' for c in columns if c!=pk(table))
                statements.append((sql,(entry,)));state['after']=entry
                await progress(ctx,[*statements,('UPDATE service_meta SET value=? WHERE key=?',(json.dumps(state),statekey))]);return
        else:
            rows=await db.query(f'SELECT CAST({pk(table)} AS TEXT) uid FROM "{table}" r WHERE NOT EXISTS(SELECT 1 FROM service_meta s WHERE s.key=?||CAST(r.{pk(table)} AS TEXT)) LIMIT 1',(base,))
            if rows:
                await progress(ctx,[(f'DELETE FROM "{table}" WHERE CAST({pk(table)} AS TEXT)=?',(rows[0]['uid'],))]);return
        state['table']+=1;state['after']=''
        await progress(ctx,[('UPDATE service_meta SET value=? WHERE key=?',(json.dumps(state),statekey))]);return
    parts=await db.query('SELECT rowid FROM sync_parts WHERE task_id=? LIMIT 1',(uid,))
    if parts:
        await progress(ctx,[('DELETE FROM sync_parts WHERE rowid=?',(parts[0]['rowid'],))]);return
    files=await db.query("SELECT * FROM sync_files WHERE task_id=? AND status!='done' LIMIT 1",(uid,))
    if files:
        f=files[0];media=site.runtime.media_factory(ctx.repo)
        if f['status']!='published':raise ConflictError('Unpublished clone media')
        if hasattr(media,'prune_parts') and await media.prune_parts(f) is False:
            await progress(ctx,[]);return
        await progress(ctx,[("UPDATE sync_files SET status='done' WHERE task_id=? AND file_id=?",(uid,f['file_id']))]);return
    if set(AUTH)<=set(chosen):await finish_accounts(site,ctx,pre,statekey)
    else:
        await progress(ctx,[("UPDATE sync_tasks SET phase='done',status='done',lease_token=NULL,lease_until=0 WHERE task_id=?",(uid,)),('DELETE FROM service_meta WHERE key IN (?,?)',(statekey,'sync:clone-lock'))])
async def clone_admin(db,pre):
    rows=await db.query("SELECT json_extract(u.value,'$.row.uid') uid,json_extract(u.value,'$.row.password_hash') password_hash FROM service_meta u JOIN service_meta r ON r.key=?||json_extract(u.value,'$.row.role_uid') WHERE u.key LIKE ? AND json_extract(u.value,'$.row.status')='active' AND json_extract(u.value,'$.row.password_hash') LIKE 'pbkdf2_sha256$%' AND json_extract(r.value,'$.row.is_system')=1 AND json_extract(r.value,'$.row.is_active')=1 AND EXISTS(SELECT 1 FROM service_meta p WHERE p.key LIKE ? AND json_extract(p.value,'$.row.role_uid')=json_extract(u.value,'$.row.role_uid') AND json_extract(p.value,'$.row.module')='data_tools' AND json_extract(p.value,'$.row.can_edit')=1 AND json_extract(p.value,'$.row.can_view')=1 AND json_extract(p.value,'$.row.can_export')=1) ORDER BY u.key LIMIT 1",(pre+'auth_roles:',pre+'auth_users:%',pre+'auth_permissions:%'))
    if rows:
        import base64,re
        from backend.app.security.passwords import ITERATIONS
        try:
            algorithm,iterations,salt,value=rows[0].pop('password_hash').split('$')
            if algorithm!='pbkdf2_sha256' or iterations!=str(ITERATIONS) or not re.fullmatch('[a-f0-9]{32}',salt) or len(base64.b64decode(value,validate=True))!=32:return []
        except (ValueError,TypeError):return []
    return rows
async def finish_accounts(site,ctx,pre,statekey):
    db=site.db;t=ctx.task;admin=await clone_admin(db,pre)
    if not admin:raise ConflictError('Clone administrator missing')
    owner=admin[0]['uid'];newgrant='website:'+owner
    connections=await db.query('SELECT * FROM sync_connections WHERE peer_id=?',(t['peer_id'],))
    if not connections:raise ConflictError('Clone connection missing')
    c=connections[0];g=(await db.query('SELECT * FROM sync_grants WHERE grant_id=?',(t['grant_id'],)))[0]
    statements=[ctx.repo.assertion(t,ctx.clock(),write=True)]
    # All authentication tables switch together, after every media/body receipt is durable.
    for table in ('auth_sessions','auth_permissions','auth_users','auth_roles','auth_login_throttles','admin_grants'):
        statements.append((f'DELETE FROM "{table}"',()))
    for table in AUTH:
        columns=COLS[table];vals=','.join("json_extract(value,'$.row."+col+"')" for col in columns)
        statements.append((f'INSERT INTO "{table}"('+','.join('"'+col+'"' for col in columns)+') SELECT '+vals+' FROM service_meta WHERE key LIKE ?',(pre+table+':%',)))
    statements += [("INSERT INTO auth_bootstrap_state(id,completed_at,user_uid) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?) ON CONFLICT(id) DO UPDATE SET user_uid=excluded.user_uid",(owner,)),('INSERT INTO sync_connections VALUES(?,?,?,?,?)',(t['peer_id'],owner,c['export_scope_json'],c['incoming_auto_scope'],c['incoming_auto_delete'])),('INSERT INTO sync_grants VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(grant_id) DO UPDATE SET principal_id=excluded.principal_id,revision=excluded.revision,enabled=excluded.enabled,scopes_json=excluded.scopes_json,can_write=excluded.can_write,can_delete=excluded.can_delete,expires_at=excluded.expires_at',(newgrant,owner,g['revision'],1,g['scopes_json'],g['can_write'],g['can_delete'],g['expires_at'])),('UPDATE sync_schedules SET grant_id=? WHERE grant_id=?',(newgrant,t['grant_id'])),("UPDATE sync_tasks SET grant_id=?,phase='done',status='done',lease_token=NULL,lease_until=0,progress_seq=progress_seq+1,last_progress_at=?,revision=revision+1 WHERE task_id=?",(newgrant,ctx.clock(),t['task_id'])),('DELETE FROM service_meta WHERE key IN (?,?)',(statekey,'sync:clone-lock'))]
    statements.append(("INSERT INTO sync_events(task_id,occurred_at,kind,level,phase,status,progress_seq,next_run_at,slice_bytes,detail) SELECT task_id,?,'clone-complete','info',phase,status,progress_seq,0,slice_bytes,'{\"accounts_restored\":true,\"sessions_revoked\":true}' FROM sync_tasks WHERE task_id=?",(ctx.clock(),t['task_id'])))
    await db.batch(statements)
async def approve_all(repo,task_id,grant_id,now):
    task,g=await repo.command_task(task_id,grant_id,now)
    if task['confirmation_id']=='clone:'+task_id and task['write_authorized'] and task['grant_revision']==g['revision']:return task
    if not is_restore(json.loads(task['scope_json'])) or task['phase']!='await_confirmation' or task['status']!='waiting' or not g['can_write'] or not g['can_delete']:raise AuthorizationError('Full clone approval denied')
    await repo.db.batch([repo.command_guard(task_id,grant_id,g['revision'],now),
      ("UPDATE sync_tasks SET confirmation_id=?,write_authorized=1,auto_delete=1,phase='transfer',status='ready',next_run_at=?,revision=revision+1 WHERE task_id=?",('clone:'+task_id,now,task_id)),
      ('UPDATE sync_items SET selected=1 WHERE task_id=?',(task_id,))])
    return await repo.read(task_id)
