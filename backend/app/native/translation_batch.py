"""Browser-driven translation over native JSON fields, with bounded serial provider packets."""
import copy
import hashlib
import json
import secrets
from .catalog import Error,TABLES,MODULES,now,label
from .translation_sources import FIELDS,ENGLISH,reference,split_reference,candidate,public_source,manual_english,source_format
from .assistance import Assistance

RETRYABLE={'timeout','rate_limited','failed'}
PHASES={'scan','reconcile','ready','run','retry','done'}
COUNTERS=('checked','queued','existing','manual','english','empty','oversized','invalidated','success','reused','failed','skipped')


def metadata(row):
    """Read bounded scheduler annotations while retaining the native source reference array."""
    raw=row.get('source_refs') or '[]'
    if len(raw)>16000:raise Error('来源元数据过大，请检查此条目')
    try:
        refs=json.loads(raw)
        if not isinstance(refs,list) or len(refs)>20:raise ValueError()
        if not refs:refs=[{}]
        if not isinstance(refs[0],dict):raise ValueError()
        item=refs[0].get('_batch',{})
        if not isinstance(item,dict):raise ValueError()
        if (type(item.get('attempts',0)) is not int or not 0<=item.get('attempts',0)<=3 or
            not isinstance(item.get('retry_at',''),str) or not isinstance(item.get('job',''),str)):raise ValueError()
        return refs,item
    except (ValueError,TypeError):raise Error('来源元数据格式无效') from None


def encoded_metadata(row,values):
    """Keep other source metadata, replacing only this scheduler's bounded annotation."""
    refs,_=metadata(row);refs[0]['_batch']=values
    return json.dumps(refs,ensure_ascii=False,separators=(',',':'))


def eligible_sql(table):
    """Reuse native public gates as transaction-time predicates, with no private text projection."""
    cols=TABLES[table]['columns'];parts=[];args=[]
    if 'visibility' in cols:parts.append("visibility='public'")
    if 'is_active' in cols:parts.append('is_active=1')
    if table=='news':parts.append('published_at IS NOT NULL AND published_at<=?');args.append(now())
    if table in ('navigation_items','student_category_displays'):parts.append('enabled=1')
    if table=='navigation_items':parts.append("location!='admin-sidebar'")
    if table=='site_settings':parts.append('id=(SELECT min(id) FROM site_settings WHERE is_active=1)')
    return ' AND '.join(parts) or '1',tuple(args)


class TranslationBatch:
    def __init__(self,r):
        """Use current request authorization and the same SQL/media/translation adapters on both platforms."""
        self.r=r;self.assistance=Assistance(r)

    async def load(self):
        """Read the single job without writing defaults or disclosing service credentials."""
        self.r.auth.require(self.r.p,'translation_cache')
        rows=await self.r.sql.query('SELECT uid,updated_at,translation_job_state,translation_batch_size,translation_worker_count FROM global_settings ORDER BY id LIMIT 1')
        if not rows:raise Error('请先初始化网站配置',503)
        row=rows[0];raw=row['translation_job_state']
        if len(raw)>32768:raise Error('批次状态过大，请检查配置')
        try:state=json.loads(raw)
        except (ValueError,TypeError):raise Error('批次状态格式无效，请检查配置') from None
        if not isinstance(state,dict):raise Error('批次状态格式无效，请检查配置')
        if state.get('format')!='translation-batch-v1':return row,{}
        if (state.get('phase') not in PHASES or state.get('mode') not in ('scan','once','auto') or
            not isinstance(state.get('modules'),list) or not state['modules'] or any(t not in FIELDS for t in state['modules']) or
            not isinstance(state.get('rev'),int) or not isinstance(state.get('id'),str) or
            not isinstance(state.get('counts'),dict) or any(type(state['counts'].get(k)) is not int for k in COUNTERS) or
            not isinstance(state.get('cursor'),list) or len(state['cursor'])!=3 or any(type(x) is not int or x<0 for x in state['cursor']) or
            not isinstance(state.get('ceilings'),dict) or any(type(state['ceilings'].get(t)) is not int for t in state['modules']) or
            not isinstance(state.get('owner'),str) or not isinstance(state.get('recent'),list) or len(state['recent'])>10 or
            any(k not in state for k in ('paused','total','scanned','message','next_at','created_at','updated_at','budget','cache_cursor','cache_ceiling','provider'))):
            raise Error('批次状态格式无效，请检查配置')
        if state.get('packing'):
            from .translation_packed_batch import METRICS
            if (state['packing']!=1 or not isinstance(state.get('metrics'),dict) or
                any(type(state['metrics'].get(k)) is not int or state['metrics'][k]<0 for k in METRICS) or
                not isinstance(state.get('pack_pending'),list) or len(state['pack_pending'])>12 or
                any(not isinstance(x,str) or len(x)>128 for x in state['pack_pending']) or
                not isinstance(state.get('flight'),dict) or
                (state['flight'] and (not isinstance(state['flight'].get('items'),list) or len(state['flight']['items'])>12))):
                raise Error('合批状态格式无效，请检查配置')
        return row,state

    def own(self,state,admin=False):
        """Restrict control to the initiator; system administrators may pause another user's job."""
        self.r.auth.require(self.r.p,'translation_cache','edit')
        if state.get('owner')!=self.r.p['uid'] and not (admin and self.r.p['is_system']):raise Error('该批次由其他账号创建，请由发起者继续或管理员暂停',403)

    async def status(self):
        """Expose only counters to other users and hide recent source links after permission removal."""
        row,state=await self.load()
        can_create=bool(self.r.p['permissions'].get('translation_cache',{}).get('can_create'))
        can_edit=bool(self.r.p['permissions'].get('translation_cache',{}).get('can_edit'))
        result={'batch_size':row['translation_batch_size'],'configured_workers':row['translation_worker_count'],'actual_workers':1,
                'modules':[{'id':t,'label':MODULES[t],'fields':len(FIELDS[t])} for t in FIELDS if self.r.p['permissions'].get(t,{}).get('can_view') and 'public' in self.r.p['scopes']],
                'can_create':can_create,'can_edit':can_edit,'job':None}
        if state:
            own=state['owner']==self.r.p['uid'];job={k:state[k] for k in ('id','rev','phase','mode','paused','counts','total','scanned','message','next_at','created_at','updated_at')}
            job.update(packing=bool(state.get('packing')),metrics=state.get('metrics',{}),needs_recovery=bool(state.get('pack_pending') or state.get('flight')),own=own,can_pause=can_edit and (own or bool(self.r.p['is_system'])),active=bool(state.get('active')),
                       recovery_at=state.get('active',{}).get('expires',''),modules=state['modules'] if own else [],provider=state['provider'] if own else '',recent=[])
            if own:
                job['recent']=[x|{'field_label':label(x['table'],x['field'])} for x in state.get('recent',[]) if self.r.p['permissions'].get(x['table'],{}).get('can_view')]
            result['job']=job
        return result

    async def write(self,row,state,extra=(),condition='1',args=(),action='edit',audit='translation-step'):
        """Atomically compare the whole job and settings timestamp, then save state plus bounded effects."""
        r=self.r;state=copy.deepcopy(state);state['rev']=state.get('rev',0)+1;state['updated_at']=now(after=row['updated_at'])
        raw=json.dumps(state,ensure_ascii=False,separators=(',',':'))
        if len(raw.encode())>24000:raise Error('批次状态超过处理上限')
        clause='EXISTS(SELECT 1 FROM global_settings WHERE uid=? AND updated_at=? AND translation_job_state=?) AND ('+condition+')'
        gid,guard=r.auth.guard(r.p,'translation_cache',action,clause,(row['uid'],row['updated_at'],row['translation_job_state'],*args))
        await r.sql.batch([guard,*extra,('UPDATE global_settings SET translation_job_state=?,updated_at=? WHERE uid=?',(raw,state['updated_at'],row['uid'])),r.content.audit(r.p,'translation_cache',audit,state['id']),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
        return state

    def guard(self,state,table=None,source=None,field=None):
        """Fence an in-flight result by its job claim and current public source, including manual English."""
        clause="EXISTS(SELECT 1 FROM global_settings WHERE json_extract(translation_job_state,'$.id')=? AND json_extract(translation_job_state,'$.active.token')=? AND json_extract(translation_job_state,'$.active.expires')>strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
        args=(state['id'],state['active']['token'])
        if table:
            eligible,params=eligible_sql(table)
            clause+=f' AND EXISTS(SELECT 1 FROM "{table}" WHERE uid=? AND updated_at=? AND '+eligible
            args+=(source['uid'],source['updated_at'],*params)
            english=ENGLISH.get(table,{}).get(field)
            if english:clause+=' AND coalesce("'+english+'",\'\')=\'\''
            clause+=')'
        return clause,args

    async def action(self,action,job_id='',rev=None,modules=None,provider='default'):
        """Create, resume, pause or explicitly retry a finite scan/run plan; never translate on GET."""
        r=self.r;row,state=await self.load();r.auth.require(r.p,'translation_cache','edit')
        if not isinstance(action,str) or action not in ('scan','resume','once','auto','retry','pause'):raise Error('批次操作无效')
        if action=='scan':
            r.auth.require(r.p,'translation_cache','create')
            if state and ((state.get('active') and state['active']['expires']>now()) or (not state['paused'] and state['phase'] not in ('ready','done'))):raise Error('已有批次，请先暂停并等待当前请求结束',409)
            if state and (state.get('pack_pending') or state.get('flight')):raise Error('上次请求有待确认结果，请先继续原任务完成核对',409)
            if state and state['owner']!=r.p['uid'] and not r.p['is_system']:raise Error('请由管理员处理其他账号的批次',403)
            if not isinstance(modules,list) or not 1<=len(modules)<=len(FIELDS) or any(not isinstance(t,str) or t not in FIELDS for t in modules) or len(set(modules))!=len(modules):raise Error('请选择有效且不重复的来源模块')
            if 'public' not in r.p['scopes']:raise Error('没有公开来源的查看范围',403)
            from .translation_config import PROVIDERS
            if not isinstance(provider,str) or provider not in ('default','fallback',*PROVIDERS):raise Error('翻译服务选项无效')
            ceilings={};total=0
            for table in modules:
                r.auth.require(r.p,table);where,args=eligible_sql(table)
                found=(await r.sql.query(f'SELECT coalesce(max(id),0) ceiling,count(*) n FROM "{table}" WHERE '+where,args))[0]
                ceilings[table]=found['ceiling'];total+=found['n']*len(FIELDS[table])
            at=now();state={'format':'translation-batch-v1','id':secrets.token_hex(16),'owner':r.p['uid'],'rev':0,'modules':modules,'ceilings':ceilings,'cursor':[0,0,0],
                'phase':'scan','mode':'scan','paused':False,'provider':provider,'counts':{k:0 for k in COUNTERS},'total':total,'scanned':0,'recent':[],
                'created_at':at,'updated_at':at,'message':'扫描只检查来源，不调用外部服务。','next_at':'','cache_cursor':0,'cache_ceiling':0,'budget':0}
            from .translation_packed_batch import METRICS
            state.update(packing=1,metrics={k:0 for k in METRICS},pack_pending=[],flight={})
            await self.write(row,state,action='create',audit='translation-scan-start')
        else:
            if not state or state['id']!=job_id:raise Error('批次已变化，请刷新状态',409)
            self.own(state,action=='pause')
            if action=='pause':
                state['paused']=True;state['message']='已暂停后续调度；已发出的请求可完成。'
                await self.write(row,state,audit='translation-pause')
            else:
                if type(rev) is not int or rev!=state['rev']:raise Error('另一页面已改变进度，请刷新',409)
                if state.get('active') and state['active']['expires']>now():raise Error('当前请求尚未结束，请稍后刷新',409)
                state.pop('active',None)
                if action not in ('resume','once','auto','retry'):raise Error('批次操作无效')
                if action=='retry':
                    state.update(phase='retry',cache_cursor=0,mode='once',run_filter='retry',budget=min(50,max(1,int(row['translation_batch_size']))),next_at='',message='重新排入失败条目后执行一个批次。')
                elif action in ('once','auto'):
                    if state['phase'] in ('scan','reconcile','retry') and action=='once':raise Error('请先完成来源扫描')
                    state['mode']=action;state['run_filter']='all';state['budget']=min(50,max(1,int(row['translation_batch_size'])))
                    if state['phase'] in ('ready','done'):state['phase']='run'
                    state['message']='相同原文先复用，不同原文按服务限制合批；请保持本页打开。' if state.get('packing') else '每次仅处理一条；请保持本页打开。'
                state['paused']=False
                await self.write(row,state,audit='translation-'+action)
        return await self.status()

    async def step(self,job_id,rev):
        """Claim and advance exactly one field/cache row/translation; a lost response can resume safely."""
        row,state=await self.load()
        if not state:raise Error('请先建立扫描批次',409)
        self.own(state)
        if 'public' not in self.r.p['scopes']:raise Error('公开来源权限已变化',403)
        if state['id']!=job_id or type(rev) is not int or state['rev']!=rev:raise Error('批次进度已变化，请刷新后继续',409)
        if state['paused'] or state['phase'] in ('ready','done'):return await self.status()
        if state.get('active') and state['active']['expires']>now():raise Error('另一请求正在处理此批次',409)
        if state['next_at'] and state['next_at']>now():return await self.status()
        state['active']={'token':secrets.token_hex(16),'expires':now(seconds=180)}
        state=await self.write(row,state,audit='translation-claim')
        try:
            if state.get('packing') and (state.get('pack_pending') or state.get('flight')):
                from .translation_packed_batch import PackedBatch
                await PackedBatch(self,state).recover();delta={}
            elif state['phase']=='scan':delta=await self.scan(state)
            elif state['phase'] in ('reconcile','retry'):delta=await self.reconcile(state)
            else:delta=await self.run(state)
        except Exception as exc:
            if not isinstance(exc,Error) and exc.__class__.__name__!='IntegrityError':raise
            delta={'paused':True,'message':exc.message if isinstance(exc,Error) else '来源、权限或版本已变化，已暂停；请刷新检查。'}
        current,latest=await self.load()
        if latest.get('id')!=state['id'] or latest.get('active',{}).get('token')!=state['active']['token']:raise Error('批次领取已变化，请刷新',409)
        # A concurrent pause wins; merge progress without restoring the earlier running state.
        effects=delta.pop('_effects',())
        latest.update(delta);latest.pop('active',None)
        await self.write(current,latest,extra=effects)
        return await self.status()

    def cache_statements(self,state,item,patch,table=None,source=None,field=None,observed=None):
        """Prepare one guarded cache mutation for a standalone or shared checkpoint transaction."""
        r=self.r;clause,args=self.guard(state,table,source,field);clause+=' AND EXISTS(SELECT 1 FROM translation_cache WHERE uid=? AND updated_at=?)';args+=(item['uid'],item['updated_at'])
        permission_table=table
        if observed:
            permission_table,uid,previous=observed
            if previous:
                clause+=f' AND EXISTS(SELECT 1 FROM "{permission_table}" WHERE uid=? AND updated_at=?)';args+=(uid,previous['updated_at'])
            else:clause+=f' AND NOT EXISTS(SELECT 1 FROM "{permission_table}" WHERE uid=?)';args+=(uid,)
        gid,guard=r.auth.guard(r.p,'translation_cache','edit',clause,args);at=now(after=item['updated_at']);patch=patch|{'updated_at':at};extra=[]
        if permission_table:
            sid,sguard=r.auth.guard(r.p,permission_table,'view');extra=[sguard]
        else:sid=gid
        if patch.get('is_current'):
            extra.append(('UPDATE translation_cache SET is_current=0,updated_at=? WHERE source_ref_key=? AND target_lang=? AND is_current=1 AND uid<>?',(at,item['source_ref_key'],item['target_lang'],item['uid'])))
        sql='UPDATE translation_cache SET '+','.join('"'+key+'"=?' for key in patch)+' WHERE uid=?'
        return [guard,*extra,(sql,(*patch.values(),item['uid'])),r.content.audit(r.p,'translation_cache','batch-cache',item['uid']),('DELETE FROM admin_mutation_guards WHERE uid IN (?,?)',(gid,sid))],item|patch

    async def cache_write(self,state,item,patch,table=None,source=None,field=None,observed=None):
        """Persist a pre-request attempt or scan annotation through the shared guarded mutation."""
        statements,updated=self.cache_statements(state,item,patch,table,source,field,observed)
        await self.r.sql.batch(statements)
        return updated

    async def activate(self,state,item,table,source,field,donor=None):
        """Reactivate exact results or reuse public automatic text with native media and donor guards."""
        r=self.r;donor=donor or item
        if donor['uid']!=item['uid']:
            from .translation_reuse import TranslationReuse
            return await TranslationReuse(r).apply(item,table,source,field,donor,self.guard(state,table,source,field))
        from .media_references import translated_media,reference_guard
        refs=await translated_media(r.sql,r.auth,r.p,item['source_ref_key'],donor['translated_text'])
        mc,ma=reference_guard(uids=refs);clause,args=self.guard(state,table,source,field)
        clause+=' AND '+mc+' AND EXISTS(SELECT 1 FROM translation_cache WHERE uid=? AND updated_at=?)'
        args+=(*ma,donor['uid'],donor['updated_at'])
        # Preserve manual donor protection and fence both the source and target versions.
        if donor['uid']!=item['uid']:
            dt,du,df=split_reference(donor['source_ref_key']);ds=await r.content.get(dt,du,r.p)
            if ds.get(df)!=item['source_text'] or manual_english(dt,ds,df) or source_format(dt,ds,df)!=source_format(table,source,field):raise Error('可复用来源已变化',409)
            dc,da=eligible_sql(dt);clause+=f' AND EXISTS(SELECT 1 FROM "{dt}" WHERE uid=? AND updated_at=? AND '+dc+')';args+=(du,ds['updated_at'],*da)
            did,dguard=r.auth.guard(r.p,dt,'view');extra=[dguard]
        else:did=None;extra=[]
        clause+=' AND EXISTS(SELECT 1 FROM translation_cache WHERE uid=? AND updated_at=?)';args+=(item['uid'],item['updated_at'])
        clause+=" AND NOT EXISTS(SELECT 1 FROM translation_cache WHERE source_ref_key=? AND target_lang=? AND is_current=1 AND is_manual=1 AND status='success' AND uid<>?)";args+=(item['source_ref_key'],item['target_lang'],item['uid'])
        gid,guard=r.auth.guard(r.p,'translation_cache','edit',clause,args);sid,sguard=r.auth.guard(r.p,table,'view');at=now(after=item['updated_at'])
        await r.sql.batch([guard,sguard,*extra,('UPDATE translation_cache SET is_current=0,updated_at=? WHERE source_ref_key=? AND target_lang=? AND is_current=1',(at,item['source_ref_key'],item['target_lang'])),
            ("UPDATE translation_cache SET translated_text=?,provider=?,status='success',is_current=1,error_message=NULL,updated_at=? WHERE uid=?",(donor['translated_text'],donor['provider'],at,item['uid'])),
            r.content.audit(r.p,'translation_cache','reuse',item['uid']),('DELETE FROM admin_mutation_guards WHERE uid IN (?,?,?)',(gid,sid,did or gid))])

    async def scan(self,state):
        """Advance a keyset/field cursor under fixed start IDs; never gather all source bodies."""
        r=self.r;index,record_id,field_index=state['cursor'];counts=dict(state['counts'])
        if index>=len(state['modules']):
            ceiling=(await r.sql.query('SELECT coalesce(max(id),0) n FROM translation_cache'))[0]['n']
            return {'phase':'reconcile','cache_cursor':0,'cache_ceiling':ceiling,'message':'正在核对历史来源是否仍有效。'}
        table=state['modules'][index];r.auth.require(r.p,table);r.auth.require(r.p,'translation_cache','create')
        if 'public' not in r.p['scopes']:raise Error('公开来源权限已变化',403)
        where,args=eligible_sql(table);compare='>=' if field_index else '>'
        rows=await r.sql.query(f'SELECT * FROM "{table}" WHERE id{compare}? AND id<=? AND '+where+' ORDER BY id LIMIT 1',(record_id,state['ceilings'][table],*args))
        if not rows:return {'cursor':[index+1,0,0]}
        source=rows[0]
        if source['id']!=record_id:field_index=0
        field=FIELDS[table][field_index];cursor=[index,source['id'],field_index+1]
        if cursor[2]>=len(FIELDS[table]):cursor[2]=0
        state_key=candidate(table,source,field);counts['checked']+=1
        if state_key!='pending':counts[state_key if state_key in counts else 'skipped']+=1
        else:
            uid=await self.assistance.queue(table,source['uid'],field,self.guard(state,table,source,field));item=await r.content.get('translation_cache',uid,r.p)
            refs,_=metadata(item)
            if refs[0].get('_inactive'):counts['skipped']+=1
            elif item['is_manual']:
                counts['manual']+=1
                if item['status']=='success' and item['translated_text'] and not item['is_current']:await self.activate(state,item,table,source,field)
            elif item['status']=='success' and item['translated_text']:
                counts['existing']+=1
                if not item['is_current']:await self.activate(state,item,table,source,field)
            else:
                values={'job':state['id'],'attempts':0,'done':0,'retry_at':'','last_status':''}
                await self.cache_write(state,item,{'source_refs':encoded_metadata(item,values)},table,source,field);counts['queued']+=1
            if state.get('packing') and not refs[0].get('_inactive') and (item['is_manual'] or item['status']=='success'):
                item=await r.content.get('translation_cache',uid,r.p)
                values={'job':state['id'],'attempts':0,'done':1,'retry_at':'','last_status':'existing'}
                await self.cache_write(state,item,{'source_refs':encoded_metadata(item,values)},table,source,field)
        return {'cursor':cursor,'counts':counts,'scanned':state['scanned']+1}

    async def reconcile(self,state):
        """Invalidate changed/withdrawn sources or explicitly requeue this job's non-manual failures."""
        r=self.r;counts=dict(state['counts']);retry=state['phase']=='retry'
        if retry:
            rows=await r.sql.query("SELECT * FROM translation_cache WHERE id>? AND is_manual=0 AND status='failed' AND json_extract(source_refs,'$[0]._batch.job')=? ORDER BY id LIMIT 1",(state['cache_cursor'],state['id']))
        else:
            rows=await r.sql.query("SELECT * FROM translation_cache WHERE id>? AND id<=? AND target_lang='en' AND is_current=1 ORDER BY id LIMIT 1",(state['cache_cursor'],state['cache_ceiling']))
        if not rows:
            from .translation_packed_batch import statistics
            extra={'metrics':await statistics(r,state)} if state.get('packing') else {}
            return {'phase':'run' if state['mode'] in ('auto','once') else 'ready','message':'扫描完成，可以执行下一批或连续运行。','next_at':'',**extra}
        item=rows[0]
        try:table,uid,field=split_reference(item['source_ref_key'])
        except Error:return {'cache_cursor':item['id']}
        if table not in state['modules']:return {'cache_cursor':item['id']}
        r.auth.require(r.p,table)
        # Query the one source under current visibility; deletion is distinct from a permission denial.
        rows=await r.sql.query(f'SELECT * FROM "{table}" WHERE uid=?',(uid,));source=rows[0] if rows else None
        from .translation_index import stored_format
        valid=source and public_source(table,source) and not manual_english(table,source,field) and source.get(field)==item['source_text'] and stored_format(item)==source_format(table,source,field) and hashlib.sha256((source.get(field) or '').encode()).hexdigest()==item['source_hash'];effects=[]
        if valid and table=='site_settings':
            valid=bool(await r.sql.query('SELECT 1 FROM site_settings WHERE uid=? AND id=(SELECT min(id) FROM site_settings WHERE is_active=1)',(uid,)))
        if retry and valid:
            _,info=metadata(item);info.update(attempts=0,done=0,retry=1,retry_at='',last_status='')
            effects,_=self.cache_statements(state,item,{'source_refs':encoded_metadata(item,info),'status':'pending','error_message':None},table,source,field)
        elif item['is_current'] and not valid:
            effects,_=self.cache_statements(state,item,{'is_current':0},observed=(table,uid,source));counts['invalidated']+=1
        return {'cache_cursor':item['id'],'counts':counts,'_effects':effects}

    async def donor(self,item,table,source,field):
        """Delegate all exact/manual/source rules to the same service as queue and single translation."""
        from .translation_reuse import TranslationReuse
        return await TranslationReuse(self.r).donor(item)

    def selection(self,state):
        """Share the exact pending set between execution and wait/completion checks."""
        clause="is_manual=0 AND coalesce(json_extract(source_refs,'$[0]._inactive'),0)=0 AND json_extract(source_refs,'$[0]._batch.job')=? AND coalesce(json_extract(source_refs,'$[0]._batch.done'),0)=0"
        if state.get('run_filter')=='retry':clause+=" AND json_extract(source_refs,'$[0]._batch.retry')=1"
        return clause,(state['id'],)

    async def run(self,state):
        """Run one due item; reuse results, bound retries and checkpoint before contacting a provider."""
        if state.get('packing'):
            from .translation_packed_batch import PackedBatch
            try:return await PackedBatch(self,state).run()
            except Error as error:
                if error.status==409 and error.message=='已有同类服务请求正在处理，请稍后重试':
                    return {'next_at':now(seconds=2),'message':'等待当前翻译请求结束，不消耗重试次数。'}
                raise
        r=self.r;counts=dict(state['counts']);where,params=self.selection(state)
        rows=await r.sql.query("SELECT * FROM translation_cache WHERE "+where+" AND coalesce(json_extract(source_refs,'$[0]._batch.retry_at'),'')<=? ORDER BY id LIMIT 1",(*params,now()))
        if not rows:
            remaining=await r.sql.query("SELECT min(json_extract(source_refs,'$[0]._batch.retry_at')) next_at,count(*) n FROM translation_cache WHERE "+where,params)
            return {'next_at':remaining[0]['next_at'] or '', 'phase':'run' if remaining[0]['n'] else 'done','message':'等待可重试任务；可以暂停。' if remaining[0]['n'] else '本批次处理结束；失败与跳过条目请查看原因。'}
        item=rows[0];_,info=metadata(item);outcome='skipped';reason='skipped';message='来源变化、撤下或存在人工英文，已跳过。';next_at='';table=field=''
        try:
            table,source,field=await self.assistance.source(item)
            if table not in state['modules'] or candidate(table,source,field)!='pending':raise Error(message,409)
            if item['status']=='success':outcome='success';message='已保存的成功结果已恢复，不重复请求。'
            else:
                donor=await self.donor(item,table,source,field)
                if donor:
                    await self.activate(state,item,table,source,field,donor);outcome='reused';message='已复用相同原文的有效译文。'
                elif info.get('attempts',0)>=3:outcome='failed';reason='exhausted';message='已达到自动尝试上限，请修正后手动重试。'
                else:
                    info['attempts']=int(info.get('attempts',0))+1
                    item=await self.cache_write(state,item,{'source_refs':encoded_metadata(item,info)},table,source,field)
                    result=await self.assistance.translate(item['uid'],item['updated_at'],state['provider'],self.guard(state,table,source,field))
                    if result['status']=='success':
                        outcome='reused' if result.get('reused') else 'success';message='已复用相同原文的有效译文。' if result.get('reused') else '翻译成功。'
                    else:
                        reason=result['attempts'][-1]['status'];message=result['attempts'][-1]['message'];outcome='failed'
                        if reason in RETRYABLE and info['attempts']<3:
                            next_at=now(seconds=30 if info['attempts']==1 else 120);outcome='waiting'
        except Error as exc:
            if exc.status in (401,403):raise
            message=exc.message
            if exc.status==409 and message=='已有同类服务请求正在处理，请稍后重试':
                # No request was sent: wait for the shared single-item/test lease without consuming a retry.
                outcome='waiting';reason='busy';next_at=now(seconds=2)
        fresh=await r.content.get('translation_cache',item['uid'],r.p);effects=[]
        if not fresh['is_manual']:
            _,info=metadata(fresh)
            if reason=='busy':info['attempts']=max(0,info.get('attempts',0)-1)
            info.update(done=int(outcome!='waiting'),retry_at=next_at,last_status=reason if outcome in ('waiting','failed') else outcome)
            # Completion annotation and counters commit together, so a lost response cannot lose accounting.
            effects,_=self.cache_statements(state,fresh,{'source_refs':encoded_metadata(fresh,info)})
        if outcome in counts:counts[outcome]+=1
        recent=([{'uid':item['uid'],'table':table,'field':field,'status':outcome,'message':message}] +state['recent'])[:10]
        budget=max(0,state['budget']-(reason!='busy'));phase='ready' if state['mode']=='once' and budget==0 else 'run'
        delta={'counts':counts,'recent':recent,'budget':budget,'phase':phase,'next_at':next_at,'message':message,'_effects':effects}
        if outcome=='failed' and info.get('last_status') in ('blocked','not_configured','disabled','blocked_endpoint'):
            delta.update(paused=True,message='服务凭据或配置不可用，已暂停。修正后可重试失败。')
        return delta

    async def invalidate(self,uid,stamp):
        """Explicitly disable a current cache; scans respect that choice until a manual save restores it."""
        r=self.r;r.auth.require(r.p,'translation_cache','edit')
        if not isinstance(uid,str) or not 1<=len(uid)<=128 or not isinstance(stamp,str) or not 1<=len(stamp)<=64:raise Error('译文标识和版本无效')
        row=await r.content.get('translation_cache',uid,r.p)
        if row['updated_at']!=stamp:raise Error('条目已变化，请刷新',409)
        refs,_=metadata(row);refs[0]['_inactive']=True;at=now(after=stamp)
        gid,guard=r.auth.guard(r.p,'translation_cache','edit','EXISTS(SELECT 1 FROM translation_cache WHERE uid=? AND updated_at=?)',(uid,stamp))
        await r.sql.batch([guard,('UPDATE translation_cache SET is_current=0,source_refs=?,updated_at=? WHERE uid=?',(json.dumps(refs,ensure_ascii=False),at,uid)),r.content.audit(r.p,'translation_cache','invalidate',uid),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
        return {'uid':uid,'updated_at':at}
