"""One exact, permission-aware reuse service for queue, single translation and batch execution."""
import json
from .catalog import Error,now
from .translation_index import identity,source_scope,stored_format,usable_candidates,candidate_order
from .translation_sources import source_format,public_source,manual_english,split_reference


class TranslationReuse:
    def __init__(self,r):
        """Share native SQL/auth/media adapters; reuse never invokes a provider."""
        self.r=r

    def candidates(self,item):
        """Filter invalid sources in SQL before selecting any donor, without a latest-N cutoff."""
        match,args=identity(item,'d');usable,params=usable_candidates(self.r.p)
        return (match+' AND '+usable,(*args,*params))

    async def donor(self,item,explicit=None):
        """Prefer unambiguous manual text; refuse competing manual variants without explicit selection."""
        where,args=self.candidates(item)
        if explicit:
            where+=' AND d.uid=? AND d.updated_at=?';args+=explicit
        rows=await self.r.sql.query('SELECT d.* FROM translation_cache d WHERE '+where+' ORDER BY '+candidate_order()+' LIMIT 1',args)
        if explicit and not rows:raise Error('所选译文或来源已变化，请重新核对',409)
        if not rows:return None
        donor=rows[0]
        if not explicit and donor['is_manual']:
            conflicts=await self.r.sql.query('SELECT 1 FROM translation_cache d WHERE '+where+' AND d.is_manual=1 AND d.translated_text<>? LIMIT 1',(*args,donor['translated_text']))
            if conflicts:raise Error('相同原文存在不同人工译文，请在来源与版本中选用，或保留各来源版本',409,'translation_conflict')
        return donor

    async def apply(self,item,table,source,field,donor,job_guard=None,explicit=False):
        """Copy to one non-manual target with source, donor, media, role and conflict CAS in one transaction."""
        r=self.r;r.auth.require(r.p,'translation_cache','edit')
        from .translation_batch import metadata
        refs,_=metadata(item)
        if item['is_manual'] or refs[0].get('_inactive'):raise Error('人工维护或已停用的译文不自动覆盖',409)
        if not public_source(table,source) or manual_english(table,source,field) or stored_format(item)!=source_format(table,source,field):return None
        target_live,target_args=source_scope(r.p,'t',live=True)
        if not await r.sql.query('SELECT 1 FROM translation_cache t WHERE t.uid=? AND '+target_live,(item['uid'],*target_args)):return None
        dt,du,df=split_reference(donor['source_ref_key']);ds=await r.content.get(dt,du,r.p)
        from .media_references import translated_media,reference_guard
        media=await translated_media(r.sql,r.auth,r.p,item['source_ref_key'],donor['translated_text'])
        mc,ma=reference_guard(uids=media);dc,da=self.candidates(item)
        extra,ea=job_guard or ('1',())
        condition='EXISTS(SELECT 1 FROM translation_cache t WHERE t.uid=? AND t.updated_at=? AND t.is_manual=0 AND '+target_live+')'
        params=(item['uid'],item['updated_at'],*target_args)
        condition+=' AND EXISTS(SELECT 1 FROM translation_cache d WHERE '+dc+' AND d.uid=? AND d.updated_at=?)'
        params+=(*da,donor['uid'],donor['updated_at'])
        if not explicit:
            # A manual version arriving after lookup must win, or turn this into a review conflict.
            condition+=' AND NOT EXISTS(SELECT 1 FROM translation_cache d WHERE '+dc+' AND d.is_manual=1 AND d.translated_text<>?)'
            params+=(*da,donor['translated_text'])
        condition+=" AND NOT EXISTS(SELECT 1 FROM translation_cache WHERE source_ref_key=? AND target_lang=? AND is_current=1 AND is_manual=1 AND status='success' AND uid<>?)"
        params+=(item['source_ref_key'],item['target_lang'],item['uid'])
        condition+=' AND '+mc+' AND ('+extra+')';params+=(*ma,*ea)
        gid,guard=r.auth.guard(r.p,'translation_cache','edit',condition,params)
        sid,sg=r.auth.guard(r.p,table,'view',f'EXISTS(SELECT 1 FROM "{table}" WHERE uid=? AND updated_at=?)',(source['uid'],source['updated_at']))
        did,dg=r.auth.guard(r.p,dt,'view',f'EXISTS(SELECT 1 FROM "{dt}" WHERE uid=? AND updated_at=?)',(du,ds['updated_at']))
        at=now(after=item['updated_at']);refs[0]['_reuse']={'uid':donor['uid'],'stamp':donor['updated_at'],'explicit':bool(explicit)}
        await r.sql.batch([guard,sg,dg,
            ('UPDATE translation_cache SET is_current=0,updated_at=? WHERE source_ref_key=? AND target_lang=? AND is_current=1',(at,item['source_ref_key'],item['target_lang'])),
            ("UPDATE translation_cache SET translated_text=?,provider=?,status='success',is_current=1,is_manual=0,error_message=NULL,source_refs=?,updated_at=? WHERE uid=?",(donor['translated_text'],donor['provider'],json.dumps(refs,ensure_ascii=False),at,item['uid'])),
            r.content.audit(r.p,'translation_cache','reuse-selected' if explicit else 'reuse',item['uid']),
            ('DELETE FROM admin_mutation_guards WHERE uid IN (?,?,?)',(gid,sid,did))])
        return {'status':'success','provider':donor['provider'],'attempts':[],'requests':0,'reused':True,'uid':item['uid'],'updated_at':at}

    async def try_reuse(self,item,table,source,field,job_guard=None):
        """Reuse only public live sources; hidden/local-only sources never publish a cached donor."""
        if not public_source(table,source) or manual_english(table,source,field) or stored_format(item)!=source_format(table,source,field):return None
        donor=await self.donor(item)
        if donor and donor['uid']!=item['uid']:return await self.apply(item,table,source,field,donor,job_guard)
        return None
