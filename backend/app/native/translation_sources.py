"""Allowlisted public text sources and exact-hash English overlays shared by scan and display."""
import hashlib
import re
from .catalog import Error,now

FIELDS={
 'profiles':('name','role','title','organization','lab','office','bio','education','experience','recruiting'),
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


# Request-local batches only: no provider calls, persistent cache or whole-library reads.
OVERLAY_BATCH_FIELDS=80
OVERLAY_BATCH_BYTES=128*1024

def _overlay_slots(table,rows):
    """Capture each row's original field hashes before changing any presentation text."""
    for row in rows:
        if not row.get('uid') or not public_source(table,row):continue
        wanted={field:(hashlib.sha256(row[field].encode()).hexdigest(),row[field],source_format(table,row,field))
                for field in FIELDS[table] if isinstance(row.get(field),str) and row[field] and not manual_english(table,row,field)}
        hashes=list(dict.fromkeys(key[0] for key in wanted.values()))
        for field,(digest,text,fmt) in wanted.items():
            yield row,field,reference(table,row['uid'],field),digest,text,fmt,hashes

async def _overlay_batch(sql,batch):
    """Bounded local winners, then donors only for fields that allow shared fallback."""
    import json
    from .translation_index import ranked_candidates,format_sql
    pack=lambda value:json.dumps(value,ensure_ascii=False,separators=(',',':'))
    # Per-slot partitioning also handles repeated UIDs without mixing row snapshots.
    requested=pack([[i,slot[2],slot[6]] for i,slot in enumerate(batch)])
    columns="t.source_hash,t.source_text,t.translated_text,t.status,t.is_current,t.is_manual,"+format_sql('t')+" fmt,json_extract(t.source_refs,'$[0]._inactive') inactive,json_extract(t.source_refs,'$[0]._reuse.explicit') explicit"
    own_rows=await sql.query("WITH requested AS (SELECT json_extract(value,'$[0]') slot,json_extract(value,'$[1]') ref,json_extract(value,'$[2]') hashes FROM json_each(?)),local AS (SELECT k.slot overlay_slot,"+columns+",row_number() OVER (PARTITION BY k.slot ORDER BY t.updated_at DESC,t.id DESC) local_rank FROM requested k JOIN translation_cache t ON t.source_ref_key=k.ref WHERE t.source_lang='zh' AND t.target_lang='en' AND t.source_hash IN (SELECT value FROM json_each(k.hashes)) AND (t.is_current=1 OR (t.is_manual=1 AND t.status<>'success') OR coalesce(json_extract(t.source_refs,'$[0]._inactive'),0)=1)) SELECT * FROM local WHERE local_rank=1",(requested,))
    own={item['overlay_slot']:item for item in own_rows}
    pending=[]
    for i,slot in enumerate(batch):
        item=own.get(i)
        if item and (item['source_hash'],item['source_text'],item['fmt'])!=(slot[3],slot[4],slot[5]):
            item=None;own.pop(i,None)
        # These exact local decisions already block shared donors, including
        # stopped/failed manual entries. Auto entries still consult donors.
        if not item or not (item['inactive'] or item['is_manual'] or item['explicit']):pending.append(slot)
    keys=list(dict.fromkeys((slot[3],slot[4],slot[5]) for slot in pending))
    shared=[]
    if keys:
        packed=pack(keys)
        principal={'scopes':['public'],'permissions':{name:{'can_view':True} for name in FIELDS}}
        extra="d.source_lang='zh' AND d.target_lang='en' AND d.source_hash IN (SELECT json_extract(value,'$[0]') FROM json_each(?)) AND EXISTS (SELECT 1 FROM json_each(?) k WHERE d.source_hash=json_extract(k.value,'$[0]') AND d.source_text=json_extract(k.value,'$[1]') AND ("+format_sql('d')+")=json_extract(k.value,'$[2]'))"
        ranked,args=ranked_candidates(principal,extra=extra,allowed_fields=PUBLIC_DONOR_FIELDS)
        shared=await sql.query('WITH ranked AS ('+ranked+') SELECT source_hash,source_text,translated_text,'+format_sql('ranked')+' fmt FROM ranked WHERE _rank=1 AND coalesce(_manual_min=_manual_max,1)',(*args,packed,packed))
    winners={(item['source_hash'],item['source_text'],item['fmt']):item for item in shared}
    for i,(row,field,ref,digest,text,fmt,hashes) in enumerate(batch):
        item=own.get(i)
        if item and item['inactive']:continue
        usable=item and item['is_current'] and item['status']=='success' and item['translated_text']
        if item and (item['is_manual'] or item['explicit']):selected=item if usable else None
        else:selected=winners.get((digest,text,fmt)) or (item if usable else None)
        if selected:row[field]=selected['translated_text']

async def overlay_many(sql,table,rows):
    """Mutate only these presentation rows, preserving native English and exact-source rules.

At most 80 fields / 128KiB of packed key estimates per batch. A single larger
existing field is processed alone rather than silently dropping its translation.
Private/inactive sources never become shared donors; no read model dependency.
"""
    if table not in FIELDS:return rows
    import json
    batch=[];size=0
    for slot in _overlay_slots(table,rows):
        # Account for both request keys and exact source text, including JSON escaping.
        needed=len(json.dumps([slot[2],slot[3],slot[4],slot[5],slot[6]],ensure_ascii=False,separators=(',',':')).encode())
        if batch and (len(batch)>=OVERLAY_BATCH_FIELDS or size+needed>OVERLAY_BATCH_BYTES):
            await _overlay_batch(sql,batch);batch=[];size=0
        batch.append(slot);size+=needed
    if batch:await _overlay_batch(sql,batch)
    for row in rows:
        if not row.get('uid'):continue
        for field,english in ENGLISH.get(table,{}).items():
            if row.get(english):row[field]=row[english]
    return rows

async def overlay(sql,table,row):
    """Compatible single-record entry; share the same bounded selection implementation."""
    await overlay_many(sql,table,[row])
    return row
