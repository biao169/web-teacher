"""Packed scheduling with native per-source commits and a bounded in-flight request journal."""
from .catalog import Error,now
from .translation_sources import candidate,split_reference,ENGLISH
from .translation_index import stored_format,format_sql
from .translation_service import TranslationService
from .translation_reuse import TranslationReuse
from .service_jobs import network_lease

METRICS=('sources','unique','sent_unique','requests','confirmed','uncertain')


async def statistics(r,state):
    """Count scan-tagged source records and distinct originals in SQL, including already reused rows."""
    condition="json_extract(t.source_refs,'$[0]._batch.job')=?"
    rows=await r.sql.query('SELECT count(*) n FROM translation_cache t WHERE '+condition,(state['id'],))
    grouped='SELECT 1 FROM translation_cache t WHERE '+condition+' GROUP BY t.source_hash,t.source_text,t.source_lang,t.target_lang,'+format_sql()
    unique=(await r.sql.query('SELECT count(*) n FROM ('+grouped+')',(state['id'],)))[0]['n']
    sent=(await r.sql.query('SELECT count(*) n FROM ('+grouped.replace(' GROUP BY'," AND coalesce(json_extract(t.source_refs,'$[0]._batch.sent'),0)=1 GROUP BY")+')',(state['id'],)))[0]['n']
    return {k:state.get('metrics',{}).get(k,0) for k in METRICS}|{'sources':rows[0]['n'],'unique':unique,'sent_unique':sent}


class PackedBatch:
    def __init__(self,batch,state):
        """One request owns at most twelve source rows and one bounded provider lease."""
        self.batch=batch;self.r=batch.r;self.initial=state;self.docs=[];self.charged=set();self.lease=None

    async def current(self):
        """Refresh counters after concurrent pause/settings edits while preserving the original claim fence."""
        row,state=await self.batch.load()
        if state.get('id')!=self.initial['id'] or state.get('active',{}).get('token')!=self.initial['active']['token']:raise Error('批次领取已变化，请刷新',409)
        return row,state

    async def valid(self,item,source_state=None):
        """Read exact cache/source snapshots; changed or inaccessible sources never enter a new packet."""
        fresh=await self.r.content.get('translation_cache',item['uid'],self.r.p)
        if fresh['updated_at']!=item['updated_at'] or fresh['is_manual']:return None
        from .translation_batch import metadata
        if metadata(fresh)[0][0].get('_inactive'):return None
        table,source,field=await self.batch.assistance.source(fresh)
        if table not in self.initial['modules'] or candidate(table,source,field)!='pending':return None
        if source_state and source['updated_at']!=source_state[1]['updated_at']:return None
        if await TranslationReuse(self.r).donor(fresh):
            # A newly published donor changes this snapshot; do not send the obsolete candidate.
            return None
        return table,source,field

    async def eligible(self,index):
        """A document can proceed when at least one captured source is still eligible."""
        doc=self.docs[index];valid=[]
        for item,source in doc['aliases']:
            try:
                if await self.valid(item,source):valid.append((item,source));continue
            except Error as error:
                if error.status in (401,403):raise
            await self.finish(item,source,{'status':'skipped'})
        doc['aliases']=valid
        return bool(valid)

    async def before(self,indices,provider):
        """Persist request intent and source attempts before HTTP; pause prevents further packets."""
        from .translation_batch import metadata,encoded_metadata,eligible_sql
        row,state=await self.current()
        if state['paused']:return False
        clause,args=self.batch.guard(self.initial);effects=[];updates=[]
        pending=list(state.get('pack_pending',[]))
        for index in indices:
            for item,source_state in self.docs[index]['aliases']:
                table,source,field=source_state;eligible,params=eligible_sql(table)
                clause+=' AND EXISTS(SELECT 1 FROM translation_cache WHERE uid=? AND updated_at=? AND is_manual=0)';args+=(item['uid'],item['updated_at'])
                english=ENGLISH.get(table,{}).get(field)
                if english:eligible+=' AND coalesce("'+english+'",\'\')=\'\''
                clause+=f' AND EXISTS(SELECT 1 FROM "{table}" WHERE uid=? AND updated_at=? AND '+eligible+')';args+=(source['uid'],source['updated_at'],*params)
                clause+=" AND EXISTS(SELECT 1 FROM auth_permissions WHERE role_uid=? AND module=? AND can_view=1)";args+=(self.r.p['role_uid'],table)
                _,info=metadata(item);info=dict(info);info['sent']=1
                if item['uid'] not in self.charged:info['attempts']=info.get('attempts',0)+1
                at=now(after=item['updated_at']);raw=encoded_metadata(item,info)
                effects.append(('UPDATE translation_cache SET source_refs=?,updated_at=? WHERE uid=?',(raw,at,item['uid'])))
                updates.append((item,raw,at));pending.append(item['uid'])
        state['pack_pending']=list(dict.fromkeys(pending))
        state['flight']={'provider':provider,'received':False,'items':[item['uid'] for index in indices for item,_ in self.docs[index]['aliases']]}
        state['metrics']['requests']+=1
        await self.batch.write(row,state,effects,clause,args,audit='translation-request-start')
        for item,raw,at in updates:item.update(source_refs=raw,updated_at=at);self.charged.add(item['uid'])
        return True

    async def after(self,indices,provider,received,uncertain):
        """Record whether a response arrived; incomplete documents stay journalled until committed."""
        row,state=await self.current()
        if received:state['metrics']['confirmed']+=1
        elif uncertain:state['metrics']['uncertain']+=1
        state['flight']={};state['metrics']=await statistics(self.r,state)
        await self.batch.write(row,state,condition=self.batch.guard(self.initial)[0],args=self.batch.guard(self.initial)[1],audit='translation-request-result')

    async def finish(self,item,source_state,result):
        """Commit one complete source result together with its done flag, counters and journal removal."""
        from .translation_batch import metadata,encoded_metadata,RETRYABLE
        r=self.r;row,state=await self.current();uid=item['uid'];effects=[];status=result['status']
        if status=='paused':return
        found=await r.sql.query('SELECT * FROM translation_cache WHERE uid=?',(uid,));fresh=found[0] if found else None
        if fresh:
            _,info=metadata(fresh);info=dict(info)
            if info.get('job')!=state['id']:fresh=None
            elif info.get('done'):
                # The previous response may have been lost after its complete atomic result commit.
                state['pack_pending']=[x for x in state.get('pack_pending',[]) if x!=uid]
                await self.batch.write(row,state,audit='translation-result-recovered');return
        if not fresh or fresh['updated_at']!=item['updated_at'] or fresh['is_manual']:status='skipped'
        outcome='skipped';reason=status;message='来源或译文已变化，保留现有内容。';next_at=''
        if status in ('success','failed'):
            try:
                current_source=await self.batch.assistance.source(fresh)
                if candidate(current_source[0],current_source[1],current_source[2])!='pending' or (source_state and current_source[1]['updated_at']!=source_state[1]['updated_at']):raise Error(message,409)
                if status=='success':outcome='reused' if result.get('reused') or result.get('count_reused') else 'success';message='已复用有效译文。' if outcome=='reused' else '合批译文已完整保存。'
                else:
                    reason=result['attempts'][-1]['status'];message=result['attempts'][-1]['message'];outcome='failed'
                    if not result.get('uncertain') and reason in RETRYABLE and info.get('attempts',0)<3:
                        outcome='waiting';next_at=now(seconds=30 if info.get('attempts',0)<=1 else 120)
                info.update(done=int(outcome!='waiting'),retry_at=next_at,last_status='uncertain' if result.get('uncertain') else reason)
                if result.get('reused'):
                    effects,_=self.batch.cache_statements(self.initial,fresh,{'source_refs':encoded_metadata(fresh,info)})
                else:
                    effects,_=await self.batch.assistance.result_statements(fresh,current_source,result,self.lease,self.batch.guard(self.initial,*current_source),encoded_metadata(fresh,info))
            except Error as error:
                if error.status in (401,403):raise
                status='skipped';outcome='skipped';message=error.message
        if status in ('skipped','interrupted','exhausted'):
            if status in ('interrupted','exhausted'):
                outcome='failed';message='中断前的请求或片段未完整保存，结果待确认；核对后可明确重试。' if status=='interrupted' else '已达到重试上限，请检查后明确重试。'
            if fresh and not fresh['is_manual']:
                _,info=metadata(fresh);info=dict(info);info.update(done=1,retry_at='',last_status=status)
                patch={'source_refs':encoded_metadata(fresh,info)}
                if status in ('interrupted','exhausted') and fresh['status']!='success':patch.update(status='failed',error_message=message)
                effects,_=self.batch.cache_statements(self.initial,fresh,patch)
        state['pack_pending']=[x for x in state.get('pack_pending',[]) if x!=uid]
        if outcome in state['counts']:state['counts'][outcome]+=1
        if source_state:table,_,field=source_state
        else:
            try:table,_,field=split_reference(item['source_ref_key'])
            except Error:table=field=''
        state['recent']=([{'uid':uid,'table':table,'field':field,'status':outcome,'message':message}]+state['recent'])[:10]
        state['message']=message;state['budget']=max(0,state['budget']-1)
        if state['mode']=='once' and not state['budget']:state['phase']='ready'
        if status=='failed' and reason in ('blocked','not_configured','disabled','blocked_endpoint'):state.update(paused=True,message='服务配置不可用，已暂停后续调度。')
        try:await self.batch.write(row,state,effects,audit='translation-packed-result')
        except Exception as exc:
            if status not in ('success','failed') or not isinstance(exc,Error) and exc.__class__.__name__!='IntegrityError':raise
            # Per-source conflicts do not discard other already completed documents from the packet.
            await self.finish(item,source_state,{'status':'skipped'})

    async def recover(self):
        """An expired interrupted request is never replayed implicitly; saved results remain untouched."""
        row,state=await self.current()
        if state.get('flight'):
            state['metrics']['uncertain']+=1;state['flight']={}
            await self.batch.write(row,state,audit='translation-request-uncertain')
        for uid in list(state.get('pack_pending',[])):
            found=await self.r.sql.query('SELECT * FROM translation_cache WHERE uid=?',(uid,))
            if found:await self.finish(found[0],None,{'status':'interrupted'})
            else:
                row,current=await self.current();current['pack_pending']=[x for x in current.get('pack_pending',[]) if x!=uid]
                await self.batch.write(row,current,audit='translation-result-missing')
        row,current=await self.current();current['metrics']=await statistics(self.r,current)
        if self.initial['phase']=='retry':current.update(phase='retry',budget=self.initial['budget'])
        await self.batch.write(row,current,audit='translation-recovery-complete')

    async def run(self):
        """Reuse first, collect twelve bounded sources, deduplicate documents and send serial packets."""
        from .translation_batch import metadata
        state=self.initial
        if state.get('pack_pending') or state.get('flight'):
            await self.recover();return {}
        where,args=self.batch.selection(state);limit=min(12,state['budget']) if state['mode']=='once' else 12
        if limit<=0:return {'phase':'ready'}
        rows=await self.r.sql.query('SELECT * FROM translation_cache WHERE '+where+" AND coalesce(json_extract(source_refs,'$[0]._batch.retry_at'),'')<=? ORDER BY id LIMIT ?",(*args,now(),limit))
        if not rows:
            remaining=(await self.r.sql.query("SELECT min(json_extract(source_refs,'$[0]._batch.retry_at')) next_at,count(*) n FROM translation_cache WHERE "+where,args))[0]
            return {'next_at':remaining['next_at'] or '', 'phase':'run' if remaining['n'] else 'done','message':'等待可重试条目。' if remaining['n'] else '本批次处理结束；未完成条目请查看原因。'}
        documents={};size=0
        async with network_lease(self.r,'translation','translation_cache') as lease:
            self.lease=lease
            for item in rows:
                source_state=None
                try:
                    source_state=await self.batch.assistance.source(item)
                    table,source,field=source_state
                    if table not in state['modules'] or candidate(table,source,field)!='pending':raise Error('来源已变化',409)
                    if item['status']=='success':
                        await self.finish(item,source_state,{'status':'success','reused':True});continue
                    reused=await TranslationReuse(self.r).try_reuse(item,table,source,field,self.batch.guard(state,table,source,field))
                    if reused:
                        fresh=await self.r.content.get('translation_cache',item['uid'],self.r.p);await self.finish(fresh,source_state,{'status':'success','reused':True});continue
                    if metadata(item)[1].get('attempts',0)>=3:
                        await self.finish(item,source_state,{'status':'exhausted'});continue
                    key=(item['source_hash'],item['source_text'],item['source_lang'],item['target_lang'],stored_format(item))
                    if key not in documents:
                        if size+len(item['source_text'].encode())>60000:break
                        size+=len(item['source_text'].encode());documents[key]={'text':item['source_text'],'source':item['source_lang'],'target':item['target_lang'],'format':key[-1],'aliases':[]}
                    documents[key]['aliases'].append((item,source_state))
                except Error as error:
                    if error.status in (401,403):raise
                    await self.finish(item,source_state,{'status':'skipped'})
            self.docs=list(documents.values())
            if self.docs:
                async def result(index,value):
                    for number,(item,source) in enumerate(self.docs[index]['aliases']):
                        await self.finish(item,source,value|({'count_reused':True} if value['status']=='success' and number>0 else {}))
                await TranslationService(self.r).execute_many(self.docs,state['provider'],hooks={'eligible':self.eligible,'before':self.before,'after':self.after,'result':result})
        return {}
