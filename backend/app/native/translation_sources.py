"""Allowlisted public text sources and exact-hash English overlays shared by scan and display."""
import hashlib
import re
from .catalog import Error,now

FIELDS={
 'profiles':('name','role','title','organization','lab','bio','education','experience','recruiting'),
 'research_interests':('name','description'),
 'publications':('title','authors','venue','publication_type','author_role','corresponding_authors','index_type','display_tags','keywords'),
 'projects':('name','source','fund_name','project_role','principal','members','status'),
 'patents':('name','country','patent_type','inventors','owner','legal_status','summary'),
 'students':('name','degree','category','direction','status','destination','awards','bio'),
 'student_category_displays':('label',),
 'news':('title','category','content'),
 'courses':('name','semester','audience','summary','references_text'),
 'navigation_items':('title',),
 'site_settings':('site_name','hero_title','hero_subtitle','seo_title','seo_description','seo_keywords','footer_text'),
}
ENGLISH={'profiles':{'name':'name_en','bio':'bio_en'},'students':{'name':'name_en'},
         'research_interests':{'name':'name_en'},'navigation_items':{'title':'title_en'},
         'site_settings':{'site_name':'site_name_en'},'student_category_displays':{'label':'label_en'}}
PUBLIC_DONOR_FIELDS={table:tuple(f for f in fields if not(table=='projects' and f in ('principal','members'))) for table,fields in FIELDS.items()}
CJK=re.compile(r'[\u3400-\u9fff\uf900-\ufaff]')


def reference(table,uid,field):
    """Construct a source key from native table/field allowlists, retaining colon-bearing UIDs."""
    if not isinstance(table,str) or not isinstance(field,str) or table not in FIELDS or field not in FIELDS[table] or not isinstance(uid,str) or not uid or len(uid)>128:
        raise Error('不支持该翻译来源')
    return table+':'+uid+':'+field


def split_reference(value):
    """Decode a source reference without accepting arbitrary SQL identifiers."""
    try:
        table,rest=value.split(':',1);uid,field=rest.rsplit(':',1)
        reference(table,uid,field)
        return table,uid,field
    except (AttributeError,ValueError):raise Error('此条目没有受支持的原文关联') from None


def public_source(table,row):
    """Apply public/active/published gates before any automatic provider request."""
    if row.get('visibility','public')!='public' or not row.get('is_active',1):return False
    if table=='news' and (not row.get('published_at') or row['published_at']>now()):return False
    if table in ('navigation_items','student_category_displays') and not row.get('enabled'):return False
    if table=='navigation_items' and row.get('location')=='admin-sidebar':return False
    return True


def manual_english(table,row,field):
    """Prefer explicitly maintained native English fields over all automatic caches."""
    return row.get(ENGLISH.get(table,{}).get(field,'')) or ''


def source_format(table,row,field):
    """缓存复用区分纯文本、Markdown和HTML，不能只判断是否HTML。"""
    return (row.get('content_format') or 'plain') if table=='news' and field=='content' else 'plain'


def html_source(table,row,field):
    """Only news HTML body fields require structural translation and media validation."""
    return table=='news' and field=='content' and row.get('content_format')=='html'


def candidate(table,row,field):
    """Classify empty, manual, English-only and oversized text without transmitting it."""
    text=row.get(field)
    if not public_source(table,row):return 'unavailable'
    if manual_english(table,row,field):return 'manual'
    if not isinstance(text,str) or not text.strip():return 'empty'
    if not CJK.search(text):return 'english'
    if len(text.encode('utf-8'))>60000:return 'oversized'
    return 'pending'


async def overlay(sql,table,row):
    """Read shared live translations without writing caches or invoking providers."""
    if table not in FIELDS or not row.get('uid'):return row
    from .translation_index import ranked_candidates,stored_format,format_sql
    import json
    wanted={reference(table,row['uid'],field):field for field in FIELDS[table] if isinstance(row.get(field),str) and row[field] and not manual_english(table,row,field)} if public_source(table,row) else {}
    if wanted:
        snapshots={field:(hashlib.sha256(row[field].encode()).hexdigest(),row[field],source_format(table,row,field)) for field in wanted.values()}
        # One winner per field: never fetch an unbounded history into application memory.
        hashes=list(dict.fromkeys(value[0] for value in snapshots.values()))
        local=await sql.query("WITH local AS (SELECT t.*,row_number() OVER (PARTITION BY source_ref_key ORDER BY updated_at DESC,id DESC) local_rank FROM translation_cache t WHERE source_lang='zh' AND target_lang='en' AND source_ref_key IN ("+','.join('?' for _ in wanted)+") AND source_hash IN ("+','.join('?' for _ in hashes)+") AND (is_current=1 OR (is_manual=1 AND status<>'success') OR coalesce(json_extract(source_refs,'$[0]._inactive'),0)=1)) SELECT * FROM local WHERE local_rank=1",(*wanted,*hashes))
        own={}
        for item in local:
            field=wanted[item['source_ref_key']]
            if (item['source_hash'],item['source_text'],stored_format(item))==snapshots[field]:own[field]=item
        # Public eligibility is checked against live source tables, never an admin session.
        principal={'scopes':['public'],'permissions':{name:{'can_view':True} for name in FIELDS}}
        clauses=[];params=[]
        for digest,text,fmt in dict.fromkeys(snapshots.values()):
            clauses.append('(d.source_hash=? AND d.source_text=? AND ('+format_sql('d')+')=?)');params.extend((digest,text,fmt))
        ranked,args=ranked_candidates(principal,extra="d.source_lang='zh' AND d.target_lang='en' AND ("+' OR '.join(clauses)+')',allowed_fields=PUBLIC_DONOR_FIELDS)
        shared=await sql.query('WITH ranked AS ('+ranked+') SELECT * FROM ranked WHERE _rank=1 AND coalesce(_manual_min=_manual_max,1)',(*args,*params))
        winners={(item['source_hash'],item['source_text'],stored_format(item)):item for item in shared}
        for field,key in snapshots.items():
            item=own.get(field);meta={}
            if item:
                refs=json.loads(item['source_refs'] or '[]');meta=refs[0] if refs and isinstance(refs[0],dict) else {}
                if meta.get('_inactive'):continue
            usable=item and item['is_current'] and item['status']=='success' and item['translated_text']
            explicit=isinstance(meta.get('_reuse'),dict) and meta['_reuse'].get('explicit')
            if item and (item['is_manual'] or explicit):
                if usable:row[field]=item['translated_text']
                continue
            selected=winners.get(key) or (item if usable else None)
            if selected:row[field]=selected['translated_text']
    for field,english in ENGLISH.get(table,{}).items():
        if row.get(english):row[field]=row[english]
    return row
