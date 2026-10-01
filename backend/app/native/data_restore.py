"""Server-owned preflight tickets, reference checks and atomic business restore.

Only explicit execution mutates business data. Tickets contain hashes/inventories,
not record bodies or credentials; staged files live under the configured cache.
"""
import hashlib,json,re,secrets
from pathlib import PurePosixPath
from .catalog import TABLES,SECRET,Error,now,defaults
from .data_tools import BUSINESS,FORMAT,IMPORT_ROWS,DATA_LIMIT,TABLE_LIMIT,MEDIA_LIMIT,OMIT,encoded,digest,selection,authorize,snapshot,row_values,validate_domain


def ticket_path(token):
    """Use unguessable ASCII handles without accepting cache paths from clients."""
    if not isinstance(token,str) or not re.fullmatch('[a-f0-9]{32}',token):raise Error('预检标识无效')
    return 'data-restore/'+token+'/ticket.json'


async def ticket(r,token):
    """Bind a ten-minute preflight to the live session and its server-side inventory."""
    authorize(r,'edit');raw=await r.cache_store.get(ticket_path(token),8*1024*1024)
    if not raw:raise Error('预检已失效，请重新预检',409)
    value=json.loads(raw)
    if not await r.sql.query("SELECT 1 FROM admin_mutation_guards WHERE uid='data:restore' AND target_uid=?",(token,)):raise Error('预检已取消或已被新的预检替代',409)
    if await r.sql.query("SELECT 1 FROM operation_logs WHERE module='data_tools' AND action='restore' AND target_uid=? LIMIT 1",(token,)):raise Error('此预检已经执行，请重新预检',409)
    if value['session']!=r.p['session_uid'] or value['expires']<now():raise Error('预检已过期或属于其他会话',409)
    return value


async def cleanup(r,token,value):
    """Remove only server-owned temporary objects named by a validated ticket."""
    for i in range(len(value['media'])):await r.cache_store.delete(f'data-restore/{token}/{i}.bin')
    await r.cache_store.delete(ticket_path(token))


async def discard(r,token):
    """Cancel the SQL reservation before deleting staged media; a racing execute then fails its guard."""
    value=await ticket(r,token)
    await r.sql.batch([("DELETE FROM admin_mutation_guards WHERE uid='data:restore' AND target_uid=?",(token,))])
    await cleanup(r,token,value)


async def prepare(r,document,tables,mode,*,removed=None):
    """Normalize up to 500 rows and compare the prospective graph before allowing execution."""
    tables=selection(tables);authorize(r,'edit',tables)
    if mode not in ('merge','replace'):raise Error('导入模式无效')
    if not isinstance(document,dict) or document.get('format')!=FORMAT or not isinstance(document.get('tables'),dict):raise Error('不支持的备份格式；请选择本版本导出的JSON或ACMS文件')
    if set(document['tables'])-set(BUSINESS) or set(tables)-set(document['tables']):raise Error('文件不包含所选表或包含不支持的表')
    if len(encoded(document))>DATA_LIMIT:raise Error('在线恢复的记录及文件清单最多4MiB，媒体正文需单独暂存',413)
    if not isinstance(document.get('sensitive',False),bool):raise Error('备份类型无效')
    if any(not isinstance(document['tables'][t],list) for t in tables):raise Error('数据表内容必须为数组')
    if sum(len(document['tables'][t]) for t in tables)>IMPORT_ROWS:raise Error('在线恢复最多500条记录，请缩小所选范围')
    state=await snapshot(r);errors=[];result={};counts=[]
    for table in tables:
        rows=document['tables'][table];uids=[v.get('uid') for v in rows if isinstance(v,dict) and isinstance(v.get('uid'),str)]
        # Read only records being merged; byte accounting precedes loading existing large bodies.
        ids=json.dumps(uids);condition='uid IN (SELECT value FROM json_each(?))'
        size=(await r.sql.query('SELECT coalesce(sum('+ '+'.join('length(coalesce(CAST("'+k+'" AS BLOB),x\'\'))' for k in TABLES[table]['columns'])+'),0) n FROM "'+table+'" WHERE '+condition,(ids,)))[0]['n']
        if size>DATA_LIMIT:raise Error('所选现有记录过大，请缩小恢复范围')
        current={v['uid']:v for v in await r.sql.query('SELECT * FROM "'+table+'" WHERE '+condition,(ids,))};target=[];seen=set()
        for index,source in enumerate(rows):
            try:
                patch=row_values(table,source,document.get('sensitive',False));uid=patch['uid']
                if uid in seen:raise Error('UID重复')
                seen.add(uid);old=current.get(uid,{})
                row=defaults(table)|old|patch;row.pop('id',None)
                row['created_at']=old.get('created_at') or patch.get('created_at') or now()
                row['updated_at']=old.get('updated_at') or now()
                # Safe imports retain an existing secret and never import in-flight provider jobs.
                for name in OMIT:
                    if name in row:row[name]=None
                row=row_values(table,{k:v for k,v in row.items() if k not in OMIT and (k not in SECRET or document.get('sensitive',False))},document.get('sensitive',False))
                for name in SECRET & set(TABLES[table]['columns']):
                    if name not in row:row[name]=old.get(name,defaults(table).get(name))
                validate_domain(table,row)
                if table=='media_assets' and row['storage_kind']!='external':row['storage_kind']=r.kind
                if 'visibility' in row and row['visibility'] not in r.p['scopes']:raise Error('条目可见范围未授权')
                target.append(row)
            except (Error,ValueError,TypeError) as exc:
                errors.append({'table':table,'row':index+1,'message':exc.message if isinstance(exc,Error) else '记录格式无效'})
        if len(encoded(target))>TABLE_LIMIT:raise Error('单表恢复内容最多900KiB，请分批选择记录')
        old_uids={v['uid'] for v in state[table]};new_uids={v['uid'] for v in target}
        added=len(new_uids-old_uids);updated=len(new_uids&old_uids);deleted=len(old_uids-new_uids) if mode=='replace' else 0
        for action,n in (('create',added),('edit',updated),('delete',deleted)):
            if n:r.auth.require(r.p,table,action)
        counts.append({'table':table,'create':added,'update':updated,'delete':deleted});result[table]=target
    if not errors:errors.extend(await references(r,result,mode,removed=removed))
    if 'media_assets' in result:
        from .media_locks import purge_key
        protected={v['uid'] for v in await r.sql.query("SELECT uid FROM admin_mutation_guards WHERE uid LIKE 'media:purge:%'")}
        affected={v['uid'] for v in (state['media_assets'] if mode=='replace' else result['media_assets'])}
        if any(purge_key(uid) in protected for uid in affected):errors.append({'table':'media_assets','row':'','message':'存在待清理媒体，请先完成媒体目录清理再恢复'})
    media=document.get('media',[])
    if not isinstance(media,list) or len(media)>100:raise Error('媒体随包最多100项')
    if media and 'media_assets' not in tables:raise Error('含媒体文件时必须同时选择媒体库表')
    assets={v['uid']:v for v in result.get('media_assets',[])};seen=set();total=0
    for item in media:
        if not isinstance(item,dict) or set(item)!={'uid','size','sha256'} or item.get('uid') not in assets or item['uid'] in seen:raise Error('媒体文件清单与所选登记不一致')
        seen.add(item['uid']);asset=assets[item['uid']]
        if type(item['size']) is not int or not 0<item['size']<=20*1024*1024 or not isinstance(item['sha256'],str) or not re.fullmatch('[a-f0-9]{64}',item['sha256']):raise Error('媒体文件摘要或大小无效')
        if asset['storage_kind']=='external' or asset['size']!=item['size'] or asset.get('checksum') not in (None,'',item['sha256']):raise Error('媒体文件大小、摘要或存储类型不匹配')
        item=item|{'key':asset['object_key']};total+=item['size']
    if total>MEDIA_LIMIT:raise Error('媒体原始总大小最多24MiB')
    # Existing metadata alone must not silently create a broken media library.
    for uid,asset in assets.items():
        if asset['storage_kind']!='external' and uid not in seen:
            from .media_inventory_store import inventory
            actual=await inventory(r.media_store).head(asset['object_key'])
            if actual is None or actual['size']!=asset['size']:errors.append({'table':'media_assets','row':uid,'message':'原文件不存在或大小不符；请使用包含媒体文件的加密备份'})
    return {'counts':counts,'errors':errors[:100],'error_count':len(errors),'rows':result,'state':state,'media':[item|{'key':assets[item['uid']]['object_key']} for item in media]}


async def references(r,result,mode,*,removed=None):
    """Validate final foreign keys/types and body media; protect references outside selected tables."""
    from .media_policy import check_type
    from backend.app.domain.richtext import body_references
    from .media_references import MediaReferences
    errors=[];view={}
    for table in BUSINESS:
        columns={'uid'}|{k for k,s in TABLES[table]['columns'].items() if s.get('references')}
        if table=='media_assets':columns|={'object_key','mime_type','status','storage_kind'}
        if table=='navigation_items':columns|={'location','url_name'}
        columns|={k for k,v in TABLES[table]['columns'].items() if v.get('unique')}
        if table=='site_settings':columns.add('is_active')
        if table=='translation_cache':columns|={'is_current','status','source_ref_key','target_lang'}
        # Native unique keys are checked by SQLite/D1 as the final atomic gate.
        rows=await r.sql.query('SELECT '+','.join('"'+k+'"' for k in sorted(columns))+' FROM "'+table+'"')
        existing={v['uid']:v for v in rows};view[table]={} if mode=='replace' and table in result else existing.copy()
        if table=='media_assets' and mode=='replace' and table in result:
            removed=set(existing)-{v['uid'] for v in result[table]}
            for uid in removed:
                if await MediaReferences(r.content).used(existing[uid]):errors.append({'table':table,'row':uid,'message':'媒体仍被使用；请先解除引用，文件不会由数据恢复删除'})
        for uid in (removed or {}).get(table,[]):view[table].pop(uid,None)
        view[table].update({v['uid']:v for v in result.get(table,[])})
    keys={v['object_key']:v for v in view['media_assets'].values()}
    for table,rows in view.items():
        for row in rows.values():
            for field,spec in TABLES[table]['columns'].items():
                ref=spec.get('references');value=row.get(field)
                if not ref or value is None:continue
                target=ref['table'];column=ref.get('column','uid')
                found=keys.get(value) if target=='media_assets' and column=='object_key' else view.get(target,{}).get(value)
                if not found:
                    errors.append({'table':table,'row':row['uid'],'message':field+' 缺少关联记录'});continue
                if target=='media_assets':
                    try:
                        if found['status']!='active':raise Error('关联媒体在回收站')
                        check_type(table,field,found['mime_type'])
                    except Error as exc:errors.append({'table':table,'row':row['uid'],'message':field+'：'+exc.message})
    for row in result.get('news',[]):
        for uid,kind in body_references(row.get('content') or '',row.get('content_format')).items():
            asset=view['media_assets'].get(uid)
            if not asset or asset['status']!='active' or (kind=='image' and asset['mime_type'] not in ('image/png','image/jpeg','image/gif','image/webp')):errors.append({'table':'news','row':row['uid'],'message':'正文引用的媒体不存在、已回收或类型不适用'})
    # Report uniqueness conflicts before SQL execution, including native partial indexes.
    for table,rows in view.items():
        for field,spec in TABLES[table]['columns'].items():
            if not spec.get('unique'):continue
            values=[v[field] for v in rows.values() if v.get(field) is not None]
            if len(values)!=len(set(values)):errors.append({'table':table,'row':'','message':field+' 唯一值重复'})
    if sum(v.get('is_active',0)==1 for v in view['site_settings'].values())>1:errors.append({'table':'site_settings','row':'','message':'只能有一条启用的网站设置；请使用替换模式或保留原UID'})
    active=[(v['source_ref_key'],v['target_lang']) for v in view['translation_cache'].values() if v.get('is_current') and v.get('status')=='success']
    if len(active)!=len(set(active)):errors.append({'table':'translation_cache','row':'','message':'同一来源语言只能有一条当前译文'})
    names=[v['url_name'] for v in view['navigation_items'].values() if v.get('location')=='admin-sidebar']
    if len(names)!=len(set(names)):errors.append({'table':'navigation_items','row':'','message':'后台导航标识重复'})
    return errors


async def preflight(r,document,tables,mode):
    """Issue a random handle only when all validation succeeds; errors contain no submitted values."""
    plan=await prepare(r,document,tables,mode);response={k:plan[k] for k in ('counts','errors','error_count')}
    if plan['errors']:return response
    token=secrets.token_hex(16);value={'session':r.p['session_uid'],'expires':now(seconds=600),'digest':digest([document,tables,mode]),'state':plan['state'],'tables':tables,'mode':mode,'media':plan['media']}
    from .media_locks import lease
    async with lease(r,'data:preflight','view'):
        pointer=await r.cache_store.get('data-restore/active.json',200)
        if pointer:
            previous=json.loads(pointer)['token'];raw=await r.cache_store.get(ticket_path(previous),8*1024*1024)
            if raw:
                old=json.loads(raw)
                if old['expires']>=now() and old['session']!=r.p['session_uid']:
                    if await r.sql.query("SELECT 1 FROM admin_mutation_guards WHERE uid='data:restore' AND target_uid=?",(previous,)):raise Error('另一会话正在预检或恢复，请等待其完成或10分钟后重试',409)
                await r.sql.batch([("DELETE FROM admin_mutation_guards WHERE uid='data:restore' AND target_uid=?",(previous,))])
                await cleanup(r,previous,old)
        gid,guard=r.auth.guard(r.p,'data_tools','edit')
        await r.sql.batch([guard,("DELETE FROM admin_mutation_guards WHERE uid='data:restore' AND created_at<?",(now(seconds=-600),)),('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES (?,?,?,?,?)',('data:restore','data_tools',token,now(),now())),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
        await r.cache_store.put('data-restore/active.json',encoded({'token':token}))
        await r.cache_store.put(ticket_path(token),encoded(value))
    return response|{'token':token,'expires':value['expires'],'media_count':len(plan['media'])}


async def stage(r,token,index,request):
    """Validate one bounded raw object against its preflight digest before cache-only staging."""
    value=await ticket(r,token)
    if type(index)is not int or not 0<=index<len(value['media']):raise Error('媒体序号无效')
    item=value['media'][index];data=bytearray()
    async for chunk in request.stream():
        if len(data)+len(chunk)>item['size']:raise Error('媒体大小不符',413)
        data.extend(chunk)
    from .media import signature
    if len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=item['sha256'] or not signature(data,PurePosixPath(item['key']).suffix.lstrip('.').lower()):raise Error('媒体正文、摘要或扩展名不符')
    await r.cache_store.put(f'data-restore/{token}/{index}.bin',bytes(data))
    return {'staged':index+1}


def inventory_condition(state):
    """Recheck every observed UID/update token inside the final write transaction."""
    conditions=[];args=[]
    for table,rows in state.items():
        conditions.append('(SELECT count(*) FROM "'+table+'")=? AND NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN "'+table+'" t ON t.uid=json_extract(j.value,\'$.uid\') WHERE t.uid IS NULL OR t.updated_at<>json_extract(j.value,\'$.updated_at\'))')
        args.extend((len(rows),encoded(rows).decode()))
    return ' AND '.join(conditions),tuple(args)


async def execute(r,token,document,tables,mode,confirmation):
    """Revalidate the file/session/snapshot, stage missing files and commit all selected tables atomically."""
    value=await ticket(r,token)
    if digest([document,tables,mode])!=value['digest']:raise Error('文件、所选表或模式已变化，请重新预检',409)
    if mode=='replace' and confirmation!='替换所选表':raise Error('请输入“替换所选表”确认删除范围')
    plan=await prepare(r,document,tables,mode)
    if plan['errors']:raise Error('预检条件已变化，请重新预检查看错误',409)
    if plan['state']!=value['state']:raise Error('业务数据已变化，请重新预检',409)
    from .media_locks import lease
    from .media_references import REFERENCE_LOCK
    created=[];committed=False
    async with lease(r,REFERENCE_LOCK,'edit'):
        try:
            for index,item in enumerate(value['media']):
                data=await r.cache_store.get(f'data-restore/{token}/{index}.bin',item['size'])
                if data is None or len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=item['sha256']:raise Error('媒体暂存未完成或已变化，请重新预检')
                from .media_inventory_store import inventory
                store=inventory(r.media_store)
                info=await store.head(item['key'])
                existing=await store.read(item['key'],item['size']) if info else None
                if existing is not None:
                    if hashlib.sha256(existing).hexdigest()!=item['sha256']:raise Error('媒体存在同名不同内容的对象；未覆盖，请先处理媒体冲突',409)
                else:
                    await store.create(item['key'],data);created.append((item['key'],(await store.head(item['key']))['version']))
            condition,args=inventory_condition(value['state']);condition+=" AND EXISTS(SELECT 1 FROM admin_mutation_guards WHERE uid='data:restore' AND target_uid=? AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-600 seconds')) AND NOT EXISTS(SELECT 1 FROM operation_logs WHERE module='data_tools' AND action='restore' AND target_uid=?)";args+=(token,token);gid,guard=r.auth.guard(r.p,'data_tools','edit',condition,args)
            statements=[guard,('PRAGMA defer_foreign_keys=ON',())]
            # One permission guard per target table keeps revocation effective until commit.
            extra=[]
            for count in plan['counts']:
                table=count['table'];actions=[a for a,k in (('create','create'),('edit','update'),('delete','delete')) if count[k]]
                condition=' AND '.join('EXISTS(SELECT 1 FROM auth_permissions WHERE role_uid=? AND module=? AND can_'+a+'=1)' for a in actions) or '1'
                aid,ag=r.auth.guard(r.p,table,'edit',condition,tuple(v for _ in actions for v in (r.p['role_uid'],table)));statements.append(ag);extra.append(aid)
            if mode=='replace':
                for table in reversed(tables):statements.append(('DELETE FROM "'+table+'" WHERE uid NOT IN (SELECT json_extract(value,\'$.uid\') FROM json_each(?))',(encoded(plan['rows'][table]).decode(),)))
            for table,rows in plan['rows'].items():
                if not rows:continue
                for row in rows:
                    row['updated_at']=now(after=row['updated_at'])
                    for field in OMIT & set(TABLES[table]['columns']):row[field]=defaults(table).get(field)
                columns=list(rows[0]);columns=[c for c in TABLES[table]['columns'] if c!='id']
                # Complete normalized rows use one JSON parameter per table (under 900 KiB).
                select=','.join("json_extract(value,'$."+c+"')" for c in columns)
                update=','.join('"'+c+'"=excluded."'+c+'"' for c in columns if c not in ('uid','created_at'))
                statements.append(('INSERT INTO "'+table+'" ('+','.join('"'+c+'"' for c in columns)+') SELECT '+select+' FROM json_each(?) WHERE true ON CONFLICT(uid) DO UPDATE SET '+update,(encoded(rows).decode(),)))
            statements += [r.content.audit(r.p,'data_tools','restore',token),('DELETE FROM admin_mutation_guards WHERE uid IN (SELECT value FROM json_each(?))',(json.dumps([gid,*extra,'data:restore']),))]
            await r.sql.restore_batch(statements);committed=True
        finally:
            if not committed:
                for key,version in created:await store.delete(key,version)
    # Settings/navigation are read per request; provider caches include setting fingerprints.
    # A successful ticket is consumed even if cleanup is interrupted: DB audit prevents replay.
    cleanup_pending=False
    try:
        await cleanup(r,token,value)
    except Exception:cleanup_pending=True
    return {'restored':True,'counts':plan['counts'],'media_written':len(created),'cleanup_pending':cleanup_pending}
