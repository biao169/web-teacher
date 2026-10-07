"""Explicit scalar-table mapping. No guessed teacher tables or arbitrary SQL.
Complex relations/media require a trusted website-specific adapter.
"""
import hashlib
import json
import re
from site_sync.core.authority import AuthorizationError,ConflictError
from site_sync.transport.protocol import encode


def identifier(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,63}',value):raise ValueError('Invalid SQL identifier')
    return '"'+value+'"'

class MappedWebsite:
    def __init__(self,db,config):
        self.db=db;self.modules=config.get('modules',{})
        if not 0<len(self.modules)<=16:raise ValueError('Configure 1..16 explicit website module mappings')
        for name,m in self.modules.items():
            identifier(name)
            for k in ('table','id','version','updated'):identifier(m[k])
            if not 0<len(m['fields'])<=30:raise ValueError('Configure scalar fields')
            if set(m['fields']) & {m['id'],m['version'],m['updated'],m.get('deleted')}:raise ValueError('Reserved metadata field')
            if len(set(m['fields']))!=len(m['fields']):raise ValueError('Duplicate field')
            for field in m['fields']:identifier(field)
            if m.get('deleted'):identifier(m['deleted'])
    def bind(self,runtime):self.runtime=runtime
    async def check(self,db):
        for m in self.modules.values():
            cols=[m[k] for k in ('id','version','updated')]+m['fields']+([m['deleted']] if m.get('deleted') else [])
            await db.query('SELECT '+','.join(map(identifier,cols))+' FROM '+identifier(m['table'])+' LIMIT 0')
    def mapping(self,module):
        if module not in self.modules:raise AuthorizationError('Module outside configured export')
        return self.modules[module]
    async def discover(self,ctx):
        t=ctx.task;count=(await self.db.query('SELECT count(*) n FROM sync_items WHERE task_id=?',(t['task_id'],)))[0]['n']
        if count>=500:await ctx.advance('await_confirmation');return
        peer=await self.runtime.peer_factory(t)
        q=dict(kind='candidates',version='catalog-v1',scope=json.loads(t['scope_json']),cursor=json.loads(t['discovery_cursor']) if t['discovery_cursor'] else None)
        page=await peer.candidates(q)
        if not isinstance(page,dict) or set(page)!={'item','cursor'}:raise ConflictError('Invalid candidate page')
        item=page['item']
        if item is None:await ctx.advance('await_confirmation');return
        if not isinstance(item,dict) or set(item)!={'module','id','version','updated','action'} or item['action'] not in ('upsert','delete') or type(item['updated'])!=int or item['module'] not in q['scope']:raise ConflictError('Invalid candidate')
        for key in ('module','id','version'):
            if not isinstance(item[key],str) or not 0<len(item[key])<=256:raise ConflictError('Invalid candidate identity')
        cursor=[item['updated'],item['module'],item['id']]
        if page['cursor']!=cursor or len(encode(cursor))>2048:raise ConflictError('Invalid candidate cursor')
        prior=q['cursor']
        if prior and (-cursor[0],cursor[1],cursor[2])<=(-prior[0],prior[1],prior[2]):raise ConflictError('Candidate cursor did not advance')
        m=self.mapping(item['module'])
        target=await self.db.query(f'SELECT CAST({identifier(m["version"])} AS TEXT) v FROM {identifier(m["table"])} WHERE {identifier(m["id"])}=?',(item['id'],))
        uid=hashlib.sha256(encode([item['module'],item['id']])).hexdigest()
        await ctx.add_item(item_id=uid,module=item['module'],record_id=item['id'],source_version=item['version'],target_version=target[0]['v'] if target else None,action=item['action'])
        await self.db.batch([ctx.repo.assertion(t,ctx.clock(),extra="t.phase='discover'"),('UPDATE sync_tasks SET discovery_cursor=? WHERE task_id=?',(encode(cursor).decode(),t['task_id']))])
    async def apply(self,ctx):
        rows=await self.db.query("SELECT * FROM sync_items WHERE task_id=? AND selected=1 AND status='staged' ORDER BY item_id LIMIT 1",(ctx.task['task_id'],))
        if not rows:await ctx.advance('cleanup');return
        i=rows[0];m=self.mapping(i['module']);table=identifier(m['table']);pk=identifier(m['id']);version=identifier(m['version'])
        files=await self.db.query('SELECT file_id FROM sync_files WHERE task_id=? AND item_id=? LIMIT 1',(i['task_id'],i['item_id']))
        if files:raise ConflictError('Media references require website-specific apply adapter')
        if i['action']=='delete':
            # An absent target is already equivalent; still commit one guarded
            # sync-local statement so replay semantics remain atomic.
            statement=(f'DELETE FROM {table} WHERE {pk}=? AND CAST({version} AS TEXT)=?',(i['record_id'],i['target_version'])) if i['target_version'] is not None else ('UPDATE sync_items SET status=status WHERE task_id=? AND item_id=? AND NOT EXISTS(SELECT 1 FROM '+table+' WHERE '+pk+'=?)',(i['task_id'],i['item_id'],i['record_id']))
        else:
            manifest=json.loads(i['manifest_json'])
            if set(manifest['fields'])!=set(m['fields']):raise ConflictError('Mapped fields differ')
            expressions=[];args=[]
            for field in m['fields']:
                expressions.append("json_extract(CAST((SELECT group_concat(data,'') FROM (SELECT data FROM sync_parts WHERE task_id=? AND item_id=? AND field=? ORDER BY offset)) AS TEXT),'$')")
                args.extend((i['task_id'],i['item_id'],field))
            fields=[*m['fields'],m['version'],m['updated']];values=expressions+['?','?'];args.extend((i['source_version'],ctx.clock()))
            if m.get('deleted'):fields.append(m['deleted']);values.append('0')
            if i['target_version'] is None:
                sql=f'INSERT INTO {table}('+','.join(map(identifier,[m['id'],*fields]))+') SELECT ?,'+','.join(values)+f' WHERE NOT EXISTS(SELECT 1 FROM {table} WHERE {pk}=?)'
                statement=(sql,(i['record_id'],*args,i['record_id']))
            else:
                sql=f'UPDATE {table} SET '+','.join(identifier(f)+'='+v for f,v in zip(fields,values))+f' WHERE {pk}=? AND CAST({version} AS TEXT)=?'
                statement=(sql,(*args,i['record_id'],i['target_version']))
        await ctx.commit_item(i['item_id'],statement)
    async def source_candidates(self,q):
        scope=q.get('scope');cursor=q.get('cursor')
        if not isinstance(scope,list) or not 0<len(scope)<=16 or len(set(scope))!=len(scope):raise AuthorizationError('Invalid export scope')
        if cursor is not None and (not isinstance(cursor,list) or len(cursor)!=3 or type(cursor[0])!=int or any(not isinstance(v,str) or len(v)>256 for v in cursor[1:])):raise ConflictError('Invalid cursor')
        clauses=[];params=[]
        for module in scope:
            m=self.mapping(module);deleted=identifier(m['deleted']) if m.get('deleted') else '0'
            updated=identifier(m['updated']);uid=identifier(m['id'])
            where='';local=[]
            if cursor is not None:
                if module>cursor[1]:where=f' WHERE {updated}<=?';local=[cursor[0]]
                elif module<cursor[1]:where=f' WHERE {updated}<?';local=[cursor[0]]
                else:where=f' WHERE {updated}<? OR ({updated}=? AND {uid}>?)';local=[cursor[0],cursor[0],cursor[2]]
            # Each module contributes only its next candidate to the outer sort.
            # A website index on (updated DESC, id) is required for large tables.
            clauses.append(f"SELECT * FROM (SELECT ? AS module,CAST({uid} AS TEXT) AS id,CAST({identifier(m['version'])} AS TEXT) AS version,{updated} AS updated,CASE WHEN {deleted}=1 THEN 'delete' ELSE 'upsert' END AS action FROM {identifier(m['table'])}{where} ORDER BY {updated} DESC,{uid} LIMIT 1)")
            params.extend([module,*local])
        rows=await self.db.query('SELECT * FROM ('+' UNION ALL '.join(clauses)+') ORDER BY updated DESC,module,id LIMIT 1',params)
        item=rows[0] if rows else None
        return {'item':item,'cursor':[item['updated'],item['module'],item['id']] if item else None}
    async def source_read(self,q):
        m=self.mapping(q['module']);table=identifier(m['table']);where=f'{identifier(m["id"])}=? AND CAST({identifier(m["version"])} AS TEXT)=?';args=[q['record'],q['version']]
        if m.get('deleted'):where+=f' AND {identifier(m["deleted"])}=0'
        if q['kind']=='manifest':
            sql='SELECT '+','.join('length(CAST(json_quote('+identifier(f)+') AS BLOB)) AS '+identifier(f) for f in m['fields'])+f' FROM {table} WHERE {where}'
            rows=await self.db.query(sql,args)
            if not rows:raise ConflictError('Source version missing')
            return {'version':q['version'],'fields':rows[0],'files':[]}
        if q['kind']!='slice' or q['field'] not in m['fields']:raise ConflictError('Unsupported mapped read')
        rows=await self.db.query('SELECT substr(CAST(json_quote('+identifier(q['field'])+') AS BLOB),?,?) AS data FROM '+table+' WHERE '+where,(q['offset']+1,q['length'],*args))
        if not rows:raise ConflictError('Source changed')
        return bytes(rows[0]['data'])
