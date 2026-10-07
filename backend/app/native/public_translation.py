"""Read-only effective English predicates and facet labels, sharing cache winner rules.

No reverse translation, providers, writes, or in-memory scan of content records.
"""
import hashlib
from .translation_sources import FIELDS,ENGLISH,PUBLIC_DONOR_FIELDS
from .translation_index import ranked_candidates,format_sql
from .filtering import PUBLIC_SEARCH_FIELDS,contains_pattern

# Shared donors must themselves be publicly displayable, including manual-English gates.
# Project private fields cannot donate labels or search keywords to public content.
DONORS=PUBLIC_DONOR_FIELDS
PRINCIPAL={'scopes':['public'],'permissions':{table:{'can_view':True} for table in DONORS}}

def ctes(sql,values=None):
    # Hash literals are computed here, never interpolated from request strings.
    hashes=','.join("'"+hashlib.sha256(value.encode()).hexdigest()+"'" for value in dict.fromkeys(values or []))
    indexed=' AND d.source_hash IN ('+hashes+')' if hashes else ''
    digest=" AND d.source_hash=ts_sha256(d.source_text)" if getattr(sql,'supports_text_hash',False) else ''
    ranked,args=ranked_candidates(PRINCIPAL,extra="d.source_lang='zh' AND d.target_lang='en' AND ("+format_sql('d')+")='plain'"+digest+indexed,allowed_fields=DONORS)
    assert not args
    local_digest=" AND t.source_hash=ts_sha256(t.source_text)" if getattr(sql,'supports_text_hash',False) else ''
    if hashes:local_digest+=' AND t.source_hash IN ('+hashes+')'
    return ("WITH public_ranked AS ("+ranked+"), public_shared AS (SELECT * FROM public_ranked WHERE _rank=1 AND coalesce(_manual_min=_manual_max,1)), "
            "public_local AS (SELECT t.*,row_number() OVER (PARTITION BY source_ref_key,source_text ORDER BY updated_at DESC,id DESC) local_rank FROM translation_cache t "
            "WHERE source_lang='zh' AND target_lang='en' AND ("+format_sql('t')+")='plain'"+local_digest+
            " AND (is_current=1 OR (is_manual=1 AND status<>'success') OR coalesce(json_extract(source_refs,'$[0]._inactive'),0)=1)) ")

def effective(table,field):
    """Scalar expression: local stop/manual/explicit, then conflict-free shared, then local."""
    assert field in FIELDS.get(table,()) and field not in ('principal','members')
    column=f'"{table}"."{field}"';ref=f"'{table}:'||\"{table}\".uid||':{field}'"
    own="CASE WHEN own.is_current=1 AND own.status='success' AND coalesce(own.translated_text,'')<>'' THEN own.translated_text END"
    shared=f'(SELECT translated_text FROM public_shared WHERE source_text={column} ORDER BY is_manual DESC,id DESC LIMIT 1)'
    expression=("(SELECT CASE WHEN coalesce(json_extract(own.source_refs,'$[0]._inactive'),0)=1 THEN NULL "
        "WHEN own.is_manual=1 OR coalesce(json_extract(own.source_refs,'$[0]._reuse.explicit'),0)=1 THEN "+own+
        " ELSE coalesce("+shared+','+own+") END FROM (SELECT 1) seed LEFT JOIN public_local own ON own.source_ref_key="+ref+f' AND own.source_text={column} AND own.local_rank=1)')
    english=ENGLISH.get(table,{}).get(field)
    if english:expression=f'CASE WHEN coalesce("{table}"."{english}",\'\')<>\'\' THEN "{table}"."{english}" ELSE '+expression+' END'
    return '('+expression+')'

def search(table,term,sql):
    clauses=[];args=[]
    for field in PUBLIC_SEARCH_FIELDS.get(table,()):
        if field not in FIELDS.get(table,()):continue
        clauses.append(effective(table,field)+" LIKE ? ESCAPE '\\'");args.append(contains_pattern(term))
    return ctes(sql),'('+' OR '.join(clauses)+')' if clauses else '0',args

async def facet_labels(content,table,field,values,fixed_conditions=None):
    """At most one option batch; raw values remain keys even when labels collide.

Only exact token translations are reused. A combined multi-value translation is
never heuristically split into labels. Conflicting row-specific labels fall back.
"""
    if not values or field not in FIELDS.get(table,()) or field in ('principal','members'):return {}
    values=list(dict.fromkeys(values));prefix=ctes(content.sql,values);marks=','.join('?' for _ in values)
    shared=await content.sql.query(prefix+f'SELECT source_text,translated_text FROM public_shared WHERE source_text IN ({marks}) ORDER BY is_manual DESC,id DESC',values)
    labels={}
    for row in shared:labels.setdefault(row['source_text'],row['translated_text'])
    where,args=content.scope(table,public=True,fixed_conditions=fixed_conditions)
    column=f'"{table}"."{field}"';expr='coalesce('+effective(table,field)+','+column+')'
    rows=await content.sql.query(prefix+f'SELECT {column} value,min({expr}) lo,max({expr}) hi FROM "{table}" WHERE '+where+f' AND {column} IN ({marks}) GROUP BY {column}',[*args,*values])
    for row in rows:
        labels.pop(row['value'],None)
        if row['lo']==row['hi'] and row['lo']!=row['value']:labels[row['value']]=row['lo']
    return {key:value for key,value in labels.items() if isinstance(value,str) and value.strip() and len(value)<=2000}
