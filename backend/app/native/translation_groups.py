"""SQL-first translation grouping, scoped sources, review choices and bounded exports."""
import json
from urllib.parse import quote,urlencode
from .catalog import TABLES,MODULES,TITLE,SECRET,Error,label
from .translation_sources import FIELDS,split_reference
from .translation_index import source_scope,format_sql,identity,stored_format,ranked_candidates
from .source_links import field_link

KEYS='source_hash,source_text,source_lang,target_lang,_format'
COLUMNS=('source_text','translated_text','__sources','target_lang','status','updated_at','source_lang','provider','is_manual','is_current','__format')
RECOMMENDED=COLUMNS[:6]


def pattern(value):
    """Escape LIKE metacharacters rather than treating search text as a query language."""
    return '%'+str(value)[:500].replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'


class TranslationGroups:
    def __init__(self,r,query=None,base=None):
        """Retain the same filters for list, sources, explicit reuse and export."""
        self.r=r;self.query=query or {};self.base=base or {}
        r.auth.require(r.p,'translation_cache')

    def categories(self):
        """Offer only source modules the current role can open; multiple selections mean OR."""
        return [{'id':t,'label':MODULES[t],'selected':self.query.get('source.'+t)=='1'} for t in FIELDS if self.r.p['permissions'].get(t,{}).get('can_view')]

    def predicate(self):
        """Intersect source ACL, fixed navigation and user filters before grouping/pagination."""
        where,args=source_scope(self.r.p,orphans=True);parts=[where];args=list(args)
        cols=TABLES['translation_cache']['columns']
        for filters in (self.base,{k[2:]:v for k,v in self.query.items() if k.startswith('f.') and v!=''}):
            for field,value in filters.items():
                if field not in cols or field in SECRET:raise Error('未知筛选列')
                parts.append(f't."{field}"=?');args.append(value)
        for key,value in self.query.items():
            if not key.startswith('c.') or not value:continue
            field=key[2:]
            if field not in cols or field in SECRET or cols[field]['kind'] not in ('text','json'):raise Error('未知文本筛选列')
            parts.append(f't."{field}" LIKE ? ESCAPE \'\\\'');args.append(pattern(value))
        if str(self.query.get('q','')).strip():
            parts.append("(t.source_text LIKE ? ESCAPE '\\' OR t.translated_text LIKE ? ESCAPE '\\')");args.extend([pattern(str(self.query['q']).strip()[:200])]*2)
        categories=[]
        for key,value in self.query.items():
            if not key.startswith('source.'):continue
            table=key[7:]
            if table not in FIELDS or value!='1':raise Error('来源分类筛选无效')
            if not self.r.p['permissions'].get(table,{}).get('can_view'):raise Error('没有此来源分类的进入权限',403,'access_denied')
            categories.append("substr(t.source_ref_key,1,instr(t.source_ref_key,':')-1)=?");args.append(table)
        if categories:parts.append('('+' OR '.join(categories)+')')
        if len(args)>80:raise Error('筛选条件过多，请减少后重试')
        return ' AND '.join(parts),tuple(args)

    def cte(self):
        """Keep aggregation in SQLite/D1; Python receives only this page's bounded previews."""
        where,args=self.predicate()
        ranked,params=ranked_candidates(self.r.p,'filtered')
        return (f'''WITH filtered AS (
            SELECT t.*,{format_sql()} _format FROM translation_cache t WHERE {where}
        ), ranked AS ({ranked}), scoped AS (
            SELECT f.*,
                CASE WHEN d._rank=1 AND coalesce(d._manual_min=d._manual_max,1) THEN d.translated_text END chosen_text,
                CASE WHEN d._rank=1 AND coalesce(d._manual_min=d._manual_max,1) THEN d.provider END chosen_provider,
                CASE WHEN d.is_manual=1 THEN d.translated_text END eligible_manual
            FROM filtered f LEFT JOIN ranked d ON d.uid=f.uid
        ) ''',(*args,*params))

    async def listing(self):
        """Count complete groups then page, never grouping only a fetched 100-row slice."""
        try:size=int(self.query.get('size',20));page=max(1,int(self.query.get('page',1)))
        except (TypeError,ValueError):raise Error('页码无效') from None
        if size not in (10,20,50,100):raise Error('每页支持10、20、50、100组')
        sort=self.query.get('sort','id')
        if sort not in (*COLUMNS,'id') or sort.startswith('__'):raise Error('未知排序列')
        direction='DESC' if self.query.get('direction')=='desc' else 'ASC'
        cte,args=self.cte()
        total=(await self.r.sql.query(cte+'SELECT count(*) n FROM (SELECT 1 FROM scoped GROUP BY '+KEYS+')',args))[0]['n']
        pages=max(1,(total+size-1)//size);page=min(page,pages)
        aggregate="""SELECT min(id) id,min(uid) uid,max(updated_at) updated_at,substr(source_text,1,320) source_text,
            substr(max(chosen_text),1,320) translated_text,
            max(CASE WHEN chosen_text IS NOT NULL THEN uid END) edit_uid,
            min(CASE WHEN is_manual=0 AND status IN ('pending','failed') AND coalesce(translated_text,'')='' AND coalesce(json_extract(source_refs,'$[0]._inactive'),0)=0 THEN uid END) translate_uid,
            source_lang,target_lang,_format,count(*) records,count(DISTINCT source_ref_key) sources,
            min(source_ref_key) first_ref,max(source_ref_key) last_ref,max(chosen_provider) provider,
            sum(is_manual) manual_count,max(is_manual) is_manual,max(is_current) is_current,
            sum(status='pending') pending,sum(status='failed') failed,sum(status='success') success,
            count(DISTINCT eligible_manual) manual_versions,
            CASE WHEN sum(status='pending')>0 THEN 'pending' WHEN sum(status='failed')>0 THEN 'failed' ELSE 'success' END status
            FROM scoped GROUP BY """+KEYS
        order='scoped.source_text' if sort=='source_text' else 'max(chosen_text)' if sort=='translated_text' else '"'+sort+'"'
        rows=await self.r.sql.query(cte+aggregate+f' ORDER BY {order} {direction},id ASC LIMIT ? OFFSET ?',(*args,size,(page-1)*size))
        previews={row['uid']:[] for row in rows};stamps={}
        # Batch source previews in SQL, capped at 20 distinct references per visible group.
        for offset in range(0,len(rows),10):
            chunk=rows[offset:offset+10];uids=[v['uid'] for v in chunk]
            equal=' AND '.join('a.'+key+'=f.'+key for key in KEYS.split(','))
            query=cte+", previews AS (SELECT a.uid group_uid,f.source_ref_key,row_number() OVER (PARTITION BY a.uid ORDER BY f.source_ref_key) position FROM filtered a JOIN filtered f ON "+equal+' WHERE a.uid IN ('+','.join('?' for _ in uids)+') GROUP BY a.uid,f.source_ref_key) SELECT group_uid,source_ref_key FROM previews WHERE position<=20 ORDER BY group_uid,position'
            for item in await self.r.sql.query(query,(*args,*uids)):previews[item['group_uid']].append(item['source_ref_key'])
            targets=[v['translate_uid'] for v in chunk if v['translate_uid']]
            if targets:
                stamps.update({v['uid']:v['updated_at'] for v in await self.r.sql.query('SELECT uid,updated_at FROM translation_cache WHERE uid IN ('+','.join('?' for _ in targets)+')',targets)})
        titles=await self.sources([ref for refs in previews.values() for ref in refs])
        for row in rows:
            row['source_items']=[titles[ref] for ref in previews[row['uid']]]
            row['edit_uid']=row['edit_uid'] or row['uid']
            row['translate_stamp']=stamps.get(row['translate_uid'],'')
            row['group_url']=self.url(row['uid']);row['format_label']={'plain':'纯文本','html':'HTML','markdown':'Markdown'}.get(row['_format'],'旧格式待核对')
        from .student_categories import page_numbers
        return {'rows':rows,'total':total,'page':page,'pages':pages,'size':size,'numbers':page_numbers(page,pages)}

    def url(self,uid,page=1):
        """Carry the complete list scope into source/history review, retaining a no-JavaScript link."""
        query={k:v for k,v in self.query.items() if k not in ('page','selected')};query['part']=page
        return '/admin/translation-groups/'+quote(uid,safe='')+'?'+urlencode(query)

    async def sources(self,refs):
        """Resolve readable titles with bounded per-table IN queries, not one source query per cache."""
        parsed={};tables={};result={}
        for ref in dict.fromkeys(refs):
            try:table,uid,field=split_reference(ref)
            except Error:
                result[ref]={'title':'来源已移除或未关联','url':'','module_label':'历史记录','field_label':''};continue
            parsed[ref]=(table,uid,field);tables.setdefault(table,set()).add(uid)
        loaded={}
        for table,uids in tables.items():
            where,params=self.r.content.scope(table,self.r.p);values=list(uids)
            for offset in range(0,len(values),60):
                chunk=values[offset:offset+60]
                rows=await self.r.sql.query(f'SELECT uid,substr("{TITLE[table]}",1,160) title FROM "{table}" WHERE uid IN ('+','.join('?' for _ in chunk)+') AND '+where,(*chunk,*params)) if self.r.p['permissions'].get(table,{}).get('can_view') else []
                loaded.update({(table,row['uid']):row['title'] for row in rows})
        for ref,(table,uid,field) in parsed.items():
            if (table,uid) in loaded:result[ref]=field_link(self.r.p,table,uid,field)|{'title':loaded[(table,uid)] or '未命名记录'}
            else:result[ref]={'title':'来源已移除或不可访问','url':'','module_label':'历史记录','field_label':''}
        return result

    async def anchor(self,uid):
        """An opaque representative is only an identity hint; it cannot bypass the current filters."""
        where,args=self.predicate()
        rows=await self.r.sql.query('SELECT t.* FROM translation_cache t WHERE t.uid=? AND '+where,(uid,*args))
        if not rows:raise Error('该组已变化或不在当前筛选范围内，请刷新列表',404)
        return rows[0]

    async def members(self,uid,page=1,size=10):
        """Page preserved source/history rows of one exact group under the same source scope."""
        anchor=await self.anchor(uid);where,args=self.predicate();match,params=identity(anchor)
        where+=' AND '+match;args+=params
        try:page=max(1,int(page))
        except (TypeError,ValueError):raise Error('页码无效') from None
        total=(await self.r.sql.query('SELECT count(*) n FROM translation_cache t WHERE '+where,args))[0]['n'];pages=max(1,(total+size-1)//size);page=min(page,pages)
        rows=await self.r.sql.query('SELECT t.* FROM translation_cache t WHERE '+where+' ORDER BY t.is_manual DESC,t.is_current DESC,t.id ASC LIMIT ? OFFSET ?',(*args,size,(page-1)*size))
        titles=await self.sources([row['source_ref_key'] for row in rows])
        for row in rows:row['source']=titles[row['source_ref_key']]
        from .student_categories import page_numbers
        return {'anchor':anchor,'rows':rows,'page':page,'pages':pages,'size':size,'total':total,'numbers':page_numbers(page,pages)}

    async def choose(self,uid,donor_uid,donor_stamp,target_uid,target_stamp,nav_guard=None):
        """Explicitly adopt a reviewed version for one selected pending source, retaining all manual variants."""
        from .translation_reuse import TranslationReuse
        from .assistance import Assistance
        self.r.auth.require(self.r.p,'translation_cache','edit')
        anchor=await self.anchor(uid);match,args=identity(anchor);where,params=self.predicate()
        found=await self.r.sql.query('SELECT t.* FROM translation_cache t WHERE '+where+' AND '+match+' AND t.uid=? AND t.updated_at=?',(*params,*args,target_uid,target_stamp))
        if not found:raise Error('待译来源已变化或超出当前范围，请重新核对',409)
        target=found[0]
        if target['is_manual'] or target['status']=='success' or target['translated_text']:raise Error('仅可填入待译或失败的空译文；已有版本保持不变',409)
        # A donor must itself be in the filtered group; direct IDs never widen the operation scope.
        if not await self.r.sql.query('SELECT 1 FROM translation_cache t WHERE '+where+' AND '+match+' AND t.uid=?',(*params,*args,donor_uid)):raise Error('所选版本不在当前范围',403)
        reuse=TranslationReuse(self.r);donor=await reuse.donor(target,(donor_uid,donor_stamp))
        table,source,field=await Assistance(self.r).source(target)
        result=await reuse.apply(target,table,source,field,donor,nav_guard,explicit=True)
        if not result:raise Error('来源不是有效公开原文，无法复用',409)
        return result

    async def export(self):
        """Export complete matching groups, or selected groups, with 10-row reads and a 4 MiB cap."""
        self.r.auth.require(self.r.p,'translation_cache','export')
        selected=self.query.get('selected','')
        if not isinstance(selected,str) or len(selected)>13000:raise Error('所选组无效')
        selected=list(dict.fromkeys(selected.split(','))) if selected else []
        if len(selected)>100 or any(not x or len(x)>128 for x in selected):raise Error('一次最多导出本页100组')
        result=[];bytes_used=0;records=0
        if selected:
            for uid in selected:await self.anchor(uid)
        page=1
        while True:
            listing=None if selected else await TranslationGroups(self.r,self.query|{'page':page,'size':10},self.base).listing()
            anchors=selected if selected else [x['uid'] for x in listing['rows']]
            for uid in anchors:
                group=await self.members(uid);members=[]
                for part in range(1,group['pages']+1):
                    rows=group['rows'] if part==1 else (await self.members(uid,part))['rows']
                    for row in rows:
                        row.pop('source',None);records+=1;bytes_used+=len(json.dumps(row,ensure_ascii=False).encode())+1
                        if records>20000 or bytes_used>4*1024*1024-65536:raise Error('导出超过20000条来源或4MiB，请缩小筛选范围')
                        members.append(row)
                result.append({'group':uid,'format':stored_format(group['anchor']) or 'unknown','sources':members})
            if selected or page>=listing['pages']:break
            page+=1
        body=json.dumps({'table':'translation_cache','grouped':True,'groups':result},ensure_ascii=False).encode()
        if len(body)>4*1024*1024:raise Error('导出结果超过4MiB，请缩小筛选范围')
        return body
