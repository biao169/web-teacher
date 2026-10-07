"""全量任务分页、分批控制和缓存预检；不依赖常驻进程或新增表。"""
import json,secrets,time
from backend.app.native.catalog import Error,now
from backend.app.native.auth import sha
from backend.app.native.bridge import sign,verify
from backend.app.native.media_inventory_store import inventory,relative_key
from .accounting import assertion,Accounting,milliseconds

TASK_SORTS={'name':"json_extract(s.summary,'$.name')",'size':'CAST(s.reserved_bytes AS INTEGER)','uploaded':'uploaded','state':'s.state','downloads':'s.downloads','created_at':'s.created_at','updated_at':'coalesce(r.updated_at,s.created_at)'}

STATES={'all':'全部任务','active':'未结束任务','uploading':'上传中','ready':'可下载','paused':'已暂停','revoked':'已撤销','expired':'已到期','cleaning':'清理中','failed':'清理失败','deleted':'文件已清理'}

class Management:
    def __init__(self,service,p,secret='',cache=None):
        """复用当前快传服务和已配置的两个对象存储。"""
        self.s=service;self.sql=service.sql;self.p=p;self.secret=secret;self.cache=cache

    async def require(self):
        """读取与每次写操作均重新检查独立快传管理员授权。"""
        if not await self.s.manager(self.p):raise Error('没有快传管理权限',403)

    def guard(self):
        """事务内部复核管理员授权，签名会话有期限时同时检查过期。"""
        if self.p.get('_integrated'):
            from .identity import permission
            return assertion(*permission(self.p,'manage'))
        return assertion('EXISTS(SELECT 1 FROM admin_grants WHERE user_uid=?) AND ?>?',(self.p['uid'],self.p.get('exp',time.time()+300),time.time()))

    def ticket(self,audience,**value):
        """为分页游标和删除预检绑定操作人、用途和五分钟有效期。"""
        return sign(self.secret,{'aud':audience,'uid':self.p['uid'],'exp':time.time()+295,**value})

    def decode(self,token,audience):
        """拒绝其他账号、用途和过期游标；不信任客户端路径或原始目录游标。"""
        result=verify(self.secret,token,audience)
        if result['uid']!=self.p['uid']:raise Error('预检不属于当前账号',403)
        return result

    def where(self,query,admin=True):
        """服务器白名单筛选，选择完整任务集合，不以当前页为全部范围。"""
        if not isinstance(query,dict):raise Error('筛选参数无效')
        state=query.get('state','all');term=str(query.get('q','')).strip()[:200];at=milliseconds()
        if not isinstance(state,str) or state not in STATES:raise Error('任务状态筛选无效')
        parts=['1'];args=[]
        if not admin:parts.append('s.owner=?');args.append(sha('user:'+self.p['uid']))
        if state=='expired':parts.append("s.expires_at<=? AND s.state NOT IN ('revoked','deleted')");args.append(at)
        elif state=='active':parts.append("s.state IN ('uploading','ready','paused') AND s.expires_at>?");args.append(at)
        elif state in ('cleaning','failed'):parts.append('r.state=?');args.append('cleanup' if state=='cleaning' else 'cleanup_failed')
        elif state!='all':parts.append('s.state=?');args.append(state)
        if term:
            parts.append("(json_extract(s.summary,'$.name') LIKE ? ESCAPE '\\' OR s.id=?)")
            args.extend(('%'+term.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%',term))
        return ' AND '.join(parts),args

    async def listing(self,query=None):
        """白名单排序后分页；100是可选每页数量，任务总数没有上限。"""
        query=query or {};admin=await self.s.manager(self.p);where,args=self.where(query,admin)
        sort=query.get('sort','created_at');direction=query.get('direction','desc')
        if sort not in TASK_SORTS or direction not in ('asc','desc'):raise Error('任务排序条件无效')
        try:page=max(1,int(query.get('page',1)));size=int(query.get('size',20))
        except (ValueError,TypeError):raise Error('分页参数无效') from None
        if size not in (20,50,100):raise Error('每批显示20、50或100条')
        join=' FROM temporary_shares s LEFT JOIN recovery_tasks r ON r.id=s.id '
        count=(await self.sql.query('SELECT count(*) n'+join+'WHERE '+where,args))[0]['n'];pages=max(1,(count+size-1)//size);page=min(page,pages)
        rows=await self.sql.query("SELECT s.id,s.summary,s.reserved_bytes,s.state,s.created_at,s.expires_at,s.downloads,s.max_downloads,r.updated_at,r.state cleanup_state,coalesce(json_extract(r.point,'$.bytes'),0) uploaded,coalesce(json_extract(r.extra,'$.cleanup_index'),0) cleanup_index,(SELECT count(*) FROM transfer_allowances a WHERE a.task=s.id AND a.kind='receive' AND a.finished_at IS NULL AND a.expires_at>?) receiving"+join+'WHERE '+where+' ORDER BY '+TASK_SORTS[sort]+' '+direction.upper()+',s.id DESC LIMIT ? OFFSET ?',(milliseconds(),*args,size,(page-1)*size))
        for row in rows:
            info=json.loads(row.pop('summary'));row['name']=info.get('name',row['id']);row['size']=int(row.pop('reserved_bytes'))
            state='deleted' if row['state']=='deleted' else 'failed' if row['cleanup_state']=='cleanup_failed' else 'cleaning' if row['cleanup_state']=='cleanup' else 'expired' if row['expires_at']<=milliseconds() and row['state']!='revoked' else row['state']
            row['display_state']=STATES.get(state,state);row['controllable']=state in ('uploading','ready','paused')
            row['created']=time.strftime('%Y-%m-%d %H:%M:%S',time.gmtime(row['created_at']/1000));row['updated']=time.strftime('%Y-%m-%d %H:%M:%S',time.gmtime((row['updated_at'] or row['created_at'])/1000))
        summary=(await self.sql.query("SELECT count(*) tasks,coalesce(sum(CASE WHEN s.state!='deleted' THEN CAST(s.reserved_bytes AS INTEGER) ELSE 0 END),0) reserved,coalesce(sum(max(0,coalesce(json_extract(r.point,'$.bytes'),0)-coalesce(json_extract(r.extra,'$.cleanup_bytes'),0))),0) stored"+join+('' if admin else 'WHERE s.owner=?'),() if admin else (sha('user:'+self.p['uid']),)))[0]
        return {'rows':rows,'page':page,'pages':pages,'size':size,'total':count,'summary':summary,'admin':admin,'query':{'q':query.get('q',''),'state':query.get('state','all'),'sort':sort,'direction':direction}}

    async def control(self,id,action,expected,stamp=None):
        """以原生状态和检查点版本控制任务；撤销同时释放未用流量额度。"""
        await self.require();row=await self.s.task(id,self.p)
        point_rows=await self.sql.query('SELECT * FROM recovery_tasks WHERE id=?',(id,));task=point_rows[0] if point_rows else None
        if not task:raise Error('任务检查点不存在',409)
        if row['state'] in ('revoked','deleted') or row['expires_at']<=milliseconds():raise Error('任务已终止或到期',409)
        if expected!=row['state'] or (stamp is not None and str(stamp)!=str(task['updated_at'])):raise Error('任务已变化，请刷新后重试',409)
        mapping={'pause':'paused','resume':'ready' if json.loads(task['point']).get('bytes',0)==int(row['reserved_bytes']) and json.loads(row['summary']).get('manifestReady',True) else 'uploading','revoke':'revoked'}
        if action not in mapping or (action=='resume' and row['state']!='paused') or (action=='pause' and row['state']=='paused'):raise Error('当前状态不支持此操作',409)
        extra=json.loads(task['extra']);extra['last_control']={'actor':self.p['uid'],'action':action,'at':milliseconds()}
        operations=[self.guard(),assertion('EXISTS(SELECT 1 FROM temporary_shares s JOIN recovery_tasks r ON r.id=s.id WHERE s.id=? AND s.state=? AND r.updated_at=? AND r.point=? AND s.expires_at>?)',(id,expected,task['updated_at'],task['point'],milliseconds())),
                    ('UPDATE temporary_shares SET state=? WHERE id=?',(mapping[action],id)),('UPDATE recovery_tasks SET extra=?,updated_at=? WHERE id=?',(json.dumps(extra),max(milliseconds(),task['updated_at']+1),id))]
        if action=='revoke':operations.append(Accounting(self.sql).release(id))
        await self.sql.batch(operations)
        return {'ok':True}

    async def purge(self,id,expected=None,stamp=None):
        """先持久停止任务，再逐次删除至多8个分块；失败保留意图，允许再次清理。"""
        await self.require();row=await self.s.task(id,self.p)
        if row['state']=='deleted':return {'done':True,'removed':0}
        task=(await self.sql.query('SELECT * FROM recovery_tasks WHERE id=?',(id,)))
        if not task:raise Error('检查点缺失；请先在缓存目录核对文件',409)
        task=task[0];extra=json.loads(task['extra']);parts=json.loads(task['point']).get('parts',[])
        indexed=self.s.indexed
        if indexed:
            from .chunks import page
            parts=await page(self.sql,id,int(extra.get('cleanup_offset',0)),9)
        if expected is not None and (expected!=row['state'] or (stamp is not None and str(stamp)!=str(task['updated_at']))):raise Error('任务已变化，请刷新后清理',409)
        lease=secrets.token_hex(16);at=milliseconds()
        if extra.get('cleanup_until',0)>at:raise Error('此任务正在清理，请稍后刷新',409)
        extra.update(cleanup_actor=self.p['uid'],cleanup_requested=at,cleanup_lease=lease,cleanup_until=at+60000);index=int(extra.get('cleanup_index',0))
        await self.sql.batch([self.guard(),assertion('EXISTS(SELECT 1 FROM recovery_tasks WHERE id=? AND point=? AND updated_at=?)',(id,task['point'],task['updated_at'])),("UPDATE temporary_shares SET state='revoked' WHERE id=?",(id,)),("UPDATE recovery_tasks SET state='cleanup',extra=?,updated_at=? WHERE id=?",(json.dumps(extra),max(at,task['updated_at']+1),id)),Accounting(self.sql).release(id)])
        removed=0;removed_bytes=int(extra.get('cleanup_bytes',0))
        lease_guard=assertion("EXISTS(SELECT 1 FROM recovery_tasks WHERE id=? AND json_extract(extra,'$.cleanup_lease')=?)",(id,lease))
        try:
            for part in (parts[:8] if indexed else parts[index:index+8]):
                await self.require()
                # A persisted lease serializes concurrent cleanup requests; immutable chunk keys are never reused.
                await self.sql.batch([lease_guard,("UPDATE recovery_tasks SET extra=json_set(extra,'$.cleanup_until',?) WHERE id=?",(milliseconds()+60000,id))])
                key=relative_key(part['key'])
                if not key.startswith(id+'/'):raise Error('任务包含范围外文件，未清理',409)
                await self.s.store.delete(key);index+=1;removed+=1;removed_bytes+=part['size']
                if indexed:extra['cleanup_offset']=part['offset']+part['size']
            done=(len(parts)<=8 if indexed else index>=len(parts));extra.update(cleanup_index=index,cleanup_bytes=removed_bytes,cleanup_error='',cleanup_until=0)
            if done and indexed and hasattr(self.s.store,'prune_task'):
                await self.require()
                pruned=await self.s.store.prune_task(id);done=pruned['done'];removed+=pruned['removed']
            point=json.dumps({'bytes':0,'parts':[],'not_before':0}) if done else task['point']
            await self.sql.batch([self.guard(),lease_guard,*([('DELETE FROM transfer_chunks WHERE task=?',(id,)),('DELETE FROM service_meta WHERE key LIKE ?',(f'folder:{id}:%',))] if indexed and done else []),('UPDATE recovery_tasks SET point=?,extra=?,state=?,updated_at=? WHERE id=?',(point,json.dumps(extra),'deleted' if done else 'cleanup',max(milliseconds(),task['updated_at']+2),id)),('UPDATE temporary_shares SET state=?,manifest=? WHERE id=?',('deleted' if done else 'revoked',None if done else row['manifest'],id))])
            return {'done':done,'removed':removed}
        except Exception:
            extra.update(cleanup_index=index,cleanup_bytes=removed_bytes,cleanup_until=0,cleanup_error='文件清理未完成，请重试。')
            await self.sql.batch([lease_guard,("UPDATE recovery_tasks SET state='cleanup_failed',extra=?,updated_at=? WHERE id=?",(json.dumps(extra),max(milliseconds(),task['updated_at']+2),id))])
            raise

    async def batch(self,data):
        """所选最多100项，全范围使用签名游标逐批推进，清理每次仅推进一个任务。"""
        await self.require();token=data.get('cursor');action=data.get('action');query=data.get('query') or {};ids=data.get('selected')
        if token:
            reference=self.decode(token,'transfer-batch');saved=await self.sql.query('SELECT value FROM service_meta WHERE key=?',('batch:'+reference['key'],))
            if not saved:raise Error('批次已结束或已过期，请重新选择',409)
            context=json.loads(saved[0]['value']);action=context['action'];query=context['query'];ids=context['ids'];after=context['after'];cutoff=context['cutoff'];pending=context.get('pending')
            await self.sql.batch([self.guard(),assertion('EXISTS(SELECT 1 FROM service_meta WHERE key=? AND value=?)',('batch:'+reference['key'],saved[0]['value'])),('DELETE FROM service_meta WHERE key=?',('batch:'+reference['key'],))])
        else:
            if ids is not None and (not isinstance(ids,list) or not 1<=len(ids)<=100 or any(not isinstance(x,dict) or set(x)!={'id','state','stamp'} or not isinstance(x.get('id'),str) or len(x['id'])!=32 or not isinstance(x.get('state'),str) or not isinstance(x.get('stamp'),int) for x in ids) or len({x['id'] for x in ids})!=len(ids)):raise Error('请选择1—100条任务')
            after='';cutoff=milliseconds();pending=None
        if action not in ('pause','resume','revoke','purge'):raise Error('批量操作无效')
        where,args=self.where(query);where+=' AND s.created_at<=? AND s.id>?' ;args.extend((cutoff,after));batch_size=1 if action=='purge' else 10
        if pending:rows=[{'id':pending,'state':None,'updated_at':None}]
        elif ids is not None:rows=[{'id':x['id'],'state':x['state'],'updated_at':x['stamp']} for x in ids[:batch_size]]
        else:
            if action!='purge':where+=" AND s.expires_at>? AND s.state IN ("+("'paused'" if action=='resume' else "'uploading','ready'" if action=='pause' else "'uploading','ready','paused'")+")";args.append(milliseconds())
            if action=='purge':where+=" AND s.state!='deleted'"
            rows=await self.sql.query('SELECT s.id,s.state,r.updated_at FROM temporary_shares s LEFT JOIN recovery_tasks r ON r.id=s.id WHERE '+where+' ORDER BY s.id LIMIT ?',(*args,batch_size))
        completed=0;skipped=0;errors=[];next_pending=None
        for row in rows:
            try:
                if action=='purge':
                    result=await self.purge(row['id'],row['state'],row['updated_at'])
                    if not result['done']:next_pending=row['id'];break
                elif (action=='pause' and row['state']=='paused') or (action=='resume' and row['state']!='paused') or row['state'] in ('deleted','revoked'):
                    skipped+=1
                else:await self.control(row['id'],action,row['state'],row['updated_at'])
                completed+=1;after=row['id']
                if ids is not None:ids=ids[1:]
            except Exception as exc:
                errors.append({'id':row['id'],'error':exc.message if isinstance(exc,Error) else '操作未完成，请刷新核对后重试'});break
        more=not errors and (next_pending or (bool(ids) if ids is not None else len(rows)==batch_size))
        cursor=None
        if more:
            key=secrets.token_hex(16);context={'action':action,'query':query,'ids':ids,'after':after,'cutoff':cutoff,'pending':next_pending,'exp':time.time()+295}
            await self.sql.batch([self.guard(),("DELETE FROM service_meta WHERE key LIKE 'batch:%' AND json_extract(value,'$.exp')<=?",(time.time(),)),('INSERT INTO service_meta(key,value) VALUES (?,?)',('batch:'+key,json.dumps(context)))])
            cursor=self.ticket('transfer-batch',key=key)
        return {'completed':completed-skipped,'skipped':skipped,'errors':errors,'cursor':cursor,'pending_cleanup':bool(next_pending)}

    async def cache_page(self,area='files',cursor=None):
        """只列举快传自己的文件与缓存根/前缀；活动及未清理任务文件标记受保护。"""
        await self.require()
        if area not in ('files','cache','pending'):raise Error('缓存区域无效')
        previous=self.decode(cursor,'transfer-cache') if cursor else None
        if previous and previous['area']!=area:raise Error('目录游标不匹配')
        if area=='pending':
            after=previous['cursor'] if previous else ''
            rows=await self.sql.query("SELECT key,value FROM service_meta WHERE key LIKE 'cache-delete:%' AND key>? ORDER BY key LIMIT 21",(after,))
            objects=[]
            for row in rows[:20]:
                item=json.loads(row['value']);objects.append({'key':item['key'],'size':None,'pending':True,'token':self.ticket('transfer-cache-delete',area=item['area'],key=item['key'],version=item['version'])})
            return {'area':area,'objects':objects,'cursor':self.ticket('transfer-cache',area=area,cursor=rows[19]['key']) if len(rows)>20 else None}
        store=self.s.store if area=='files' else self.cache
        if store is None:raise Error('缓存存储未配置',503)
        result=await inventory(store).list_page(previous['cursor'] if previous else None,limit=20)
        for item in result['objects']:
            first=item['key'].split('/')[0]
            linked=await self.sql.query('SELECT id,state FROM temporary_shares WHERE id=?',(first,)) if area=='files' else []
            item['task']=linked[0]['id'] if linked else None;item['protected']=bool(linked and linked[0]['state']!='deleted')
            item['token']=self.ticket('transfer-cache-delete',area=area,key=item['key'],version=item['version']) if not item.get('error') and not item['protected'] else None
        return {'area':area,'objects':result['objects'],'cursor':self.ticket('transfer-cache',area=area,cursor=result['cursor']) if result['truncated'] else None}

    async def delete_cache(self,token):
        """复核路径、对象版本和任务引用后删除单个孤立/缓存文件，保留失败意图。"""
        await self.require();value=self.decode(token,'transfer-cache-delete');key=relative_key(value['key']);area=value['area'];record='cache-delete:'+sha(area+':'+key)
        if area=='files':
            linked=await self.sql.query("SELECT 1 FROM temporary_shares WHERE id=? AND state!='deleted'",(key.split('/')[0],))
            if linked:raise Error('文件仍属于任务，请从任务列表停止并清理',409)
        store=self.s.store if area=='files' else self.cache
        if store is None:raise Error('缓存存储未配置',503)
        # 路径和版本来自签名预检，原始目录参数永不成为删除目标。
        await self.sql.batch([self.guard(),('INSERT OR REPLACE INTO service_meta(key,value) VALUES (?,?)',(record,json.dumps({'area':area,'key':key,'version':value['version'],'at':milliseconds()})))])
        await inventory(store).delete(key,value['version'])
        await self.sql.batch([('DELETE FROM service_meta WHERE key=?',(record,))])
        return {'ok':True}
