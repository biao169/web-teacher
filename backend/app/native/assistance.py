"""Read-only input assistance and translation cache writes using native reference fields."""
import hashlib,json,secrets
from .catalog import CONTENT,Error,now
class Assistance:
    def __init__(self,r):"""保存构造参数和适配器，供此对象后续操作复用。""";self.r=r
    async def metadata(self,doi,uid=''):
        """供已有服务调用取得默认提供方的首条DOI建议，复用同一查询执行器。"""
        from .metadata_search import MetadataSearch
        result=await MetadataSearch(self.r).search(doi,'doi','default',uid)
        if result['candidates']:return result['candidates'][0]['fields']
        attempt=result['attempts'][-1]
        raise Error(attempt['message'],429 if attempt['status']=='rate_limited' else 503 if attempt['status']=='not_configured' else 502)
    async def source(self,row):
        """Check exact source text/hash and live visibility before sending content to a provider."""
        from .translation_sources import split_reference
        table,uid,field=split_reference(row.get('source_ref_key'));source=await self.r.content.get(table,uid,self.r.p)
        text=source.get(field)
        if not isinstance(text,str) or text!=row['source_text'] or hashlib.sha256(text.encode()).hexdigest()!=row['source_hash']:raise Error('原文已变化，请从最新原文重新建立翻译条目',409)
        from .translation_index import stored_format
        from .translation_sources import source_format
        if stored_format(row)!=source_format(table,source,field):raise Error('原文格式已变化或旧条目未记录格式，请从当前来源重新建立翻译条目',409)
        return table,source,field
    async def queue(self,table,uid,field,job_guard=None,initial_text=None):
        """Create a bounded source-linked entry; reuse identical existing entries without overwriting."""
        r=self.r;r.auth.require(r.p,'translation_cache','create')
        if initial_text is not None:
            r.auth.require(r.p,'translation_cache','edit')
            if not isinstance(initial_text,str) or not initial_text.strip() or len(initial_text)>60000:raise Error('初始人工译文无效')
        from .translation_sources import reference,source_format
        from .translation_index import format_sql
        ref=reference(table,uid,field)
        source=await r.content.get(table,uid,r.p);text=source.get(field)
        if not isinstance(text,str) or not text:raise Error('源内容为空')
        digest=hashlib.sha256(text.encode()).hexdigest()
        fmt=source_format(table,source,field)
        existing=await r.sql.query("SELECT t.* FROM translation_cache t WHERE source_ref_key=? AND source_hash=? AND source_text=? AND source_lang='zh' AND target_lang='en' AND ("+format_sql()+")=? ORDER BY is_manual DESC,is_current DESC,id DESC LIMIT 1",(ref,digest,text,fmt))
        if existing:
            if initial_text is None:await self.reuse_queued(existing[0],table,source,field,job_guard)
            return existing[0]['uid']
        condition,args=job_guard or ('1',())
        new=secrets.token_hex(16);gid,guard=r.auth.guard(r.p,'translation_cache','create',condition,args)
        sid,source_guard=r.auth.guard(r.p,table,'view',f'EXISTS(SELECT 1 FROM "{table}" WHERE uid=? AND updated_at=?)',(uid,source['updated_at']))
        if initial_text is not None:
            from .media_references import translated_media
            if await translated_media(r.sql,r.auth,r.p,ref,initial_text):raise Error('初始人工译文请使用不含媒体的文本')
        await r.sql.batch([guard,source_guard,('INSERT INTO translation_cache(uid,source_hash,source_ref_key,source_text,source_lang,target_lang,source_refs,translated_text,provider,status,is_manual,is_current) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',(new,digest,ref,text,'zh','en',json.dumps([{'table':table,'uid':uid,'field':field,'_format':fmt}]),initial_text,'manual' if initial_text is not None else None,'success' if initial_text is not None else 'pending',int(initial_text is not None),int(initial_text is not None))),r.content.audit(r.p,'translation_cache','queue-manual' if initial_text is not None else 'queue',new),('DELETE FROM admin_mutation_guards WHERE uid IN (?,?)',(gid,sid))])
        await self.reuse_queued(await r.content.get('translation_cache',new,r.p),table,source,field,job_guard)
        return new
    async def reuse_queued(self,row,table,source,field,job_guard=None):
        """Populate new/pending entries from a cache; ambiguity keeps a reviewable pending row."""
        from .translation_reuse import TranslationReuse
        from .translation_batch import metadata
        if row['is_manual'] or row['status']=='success' or metadata(row)[0][0].get('_inactive') or not self.r.p['permissions'].get('translation_cache',{}).get('can_edit'):return
        try:await TranslationReuse(self.r).try_reuse(row,table,source,field,job_guard)
        except Error as error:
            if error.code!='translation_conflict':raise
    async def translate(self,uid,stamp,provider='default',job_guard=None):
        """Translate with source/version/manual protection and one atomic native result commit."""
        from .translation_service import TranslationService
        from .service_jobs import network_lease
        r=self.r;r.auth.require(r.p,'translation_cache','edit');row=await r.content.get('translation_cache',uid,r.p)
        if row['updated_at']!=stamp:raise Error('翻译条目已变化，请重新打开',409)
        if row['is_manual']:raise Error('此条目为人工维护，自动翻译不会覆盖；请保留人工译文',409)
        from .translation_batch import metadata
        refs,_=metadata(row)
        if refs[0].get('_inactive'):raise Error('此译文已停用；人工编辑并保存后可以恢复生效',409)
        table,source,field=await self.source(row)
        condition,args=job_guard or ('1',())
        if not (await r.sql.query('SELECT '+condition+' ok',args))[0]['ok']:raise Error('批次或来源状态已变化',409)
        manual_clause="NOT EXISTS(SELECT 1 FROM translation_cache WHERE source_ref_key=? AND source_hash=? AND target_lang=? AND is_current=1 AND is_manual=1 AND status='success')"
        manual_args=(row['source_ref_key'],row['source_hash'],row['target_lang'])
        if not (await r.sql.query('SELECT '+manual_clause+' ok',manual_args))[0]['ok']:raise Error('已有当前人工译文，自动翻译不会覆盖',409)
        async with network_lease(r,'translation','translation_cache') as (lease_key,owner):
            from .translation_reuse import TranslationReuse
            # Both single and batch callers recheck reuse inside the shared provider lease.
            reused=await TranslationReuse(r).try_reuse(row,table,source,field,job_guard)
            if reused:return reused
            if row['status']=='success' and row['is_current'] and row['translated_text']:
                return {'status':'success','provider':row['provider'],'attempts':[],'requests':0,'reused':True,'uid':uid,'updated_at':stamp}
            result=await TranslationService(r).execute(row['source_text'],row['source_lang'],row['target_lang'],provider,table=='news' and field=='content' and source.get('content_format')=='html')
            statements,at=await self.result_statements(row,(table,source,field),result,(lease_key,owner),job_guard)
            await r.sql.batch(statements)
            return {k:v for k,v in result.items() if k!='text'}|{'uid':uid,'updated_at':at}
    async def result_statements(self,row,source_state,result,lease,job_guard=None,source_refs=None):
        """Prepare the same guarded result write for single calls and per-document packed checkpoints."""
        from .translation_reuse import TranslationReuse
        r=self.r;uid=row['uid'];stamp=row['updated_at'];table,source,field=source_state;lease_key,owner=lease
        manual_clause="NOT EXISTS(SELECT 1 FROM translation_cache WHERE source_ref_key=? AND source_hash=? AND target_lang=? AND is_current=1 AND is_manual=1 AND status='success')"
        manual_args=(row['source_ref_key'],row['source_hash'],row['target_lang'])
        await self.source(row)
        from .media_references import translated_media,reference_guard
        refs=await translated_media(r.sql,r.auth,r.p,row['source_ref_key'],result['text']) if result['status']=='success' else []
        media_condition,media_args=reference_guard(uids=refs)
        extra,extra_args=job_guard or ('1',())
        donor_condition,donor_args=TranslationReuse(r).candidates(row)
        # A new cross-source manual version arriving during HTTP requires a fresh review/reuse.
        extra+=' AND NOT EXISTS(SELECT 1 FROM translation_cache d WHERE '+donor_condition+' AND d.is_manual=1)'
        extra_args+=donor_args
        condition='EXISTS(SELECT 1 FROM translation_cache WHERE uid=? AND updated_at=? AND is_manual=0) AND '+manual_clause+' AND '+media_condition+" AND EXISTS(SELECT 1 FROM admin_mutation_guards WHERE uid=? AND target_uid=? AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-180 seconds')) AND ("+extra+')'
        gid,guard=r.auth.guard(r.p,'translation_cache','edit',condition,(uid,stamp,*manual_args,*media_args,lease_key,owner,*extra_args))
        sid,source_guard=r.auth.guard(r.p,table,'view',f'EXISTS(SELECT 1 FROM "{table}" WHERE uid=? AND updated_at=?)',(source['uid'],source['updated_at']))
        at=now(after=stamp);statements=[guard,source_guard]
        if result['status']=='success':
            statements += [('UPDATE translation_cache SET is_current=0,updated_at=? WHERE source_ref_key=? AND target_lang=? AND is_current=1',(at,row['source_ref_key'],row['target_lang'])),("UPDATE translation_cache SET translated_text=?,provider=?,status='success',is_current=1,is_manual=0,error_message=NULL,updated_at=? WHERE uid=?",(result['text'],result['provider'],at,uid))]
        elif row['status']!='success':
            statements += [("UPDATE translation_cache SET status='failed',error_message=?,updated_at=? WHERE uid=?",(result['attempts'][-1]['message'],at,uid))]
        else:at=stamp  # Failed reruns must retain a previously successful translation.
        if source_refs is not None:statements.append(('UPDATE translation_cache SET source_refs=? WHERE uid=?',(source_refs,uid)))
        audit=r.content.audit(r.p,'translation_cache','translate' if result['status']=='success' else 'translate-failed',uid)
        if result['status']!='success':audit=(audit[0],(*audit[1][:-1],'failed'))
        statements += [audit,('DELETE FROM admin_mutation_guards WHERE uid IN (?,?)',(gid,sid))]
        return statements,at
