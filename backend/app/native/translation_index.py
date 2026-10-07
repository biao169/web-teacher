"""Native cache identities, source visibility and live reuse predicates; no materialized index."""
import json
from .catalog import TABLES,Error
from .translation_sources import FIELDS,ENGLISH,split_reference


def format_sql(alias='t'):
    """Use saved format; legacy variable-format bodies stay separate until explicitly reviewed."""
    value=f"json_extract({alias}.source_refs,'$[0]._format')"
    return f"CASE WHEN {value} IN ('plain','markdown','html') THEN {value} WHEN {alias}.source_ref_key LIKE 'news:%:content' THEN 'unknown:'||{alias}.uid ELSE 'plain' END"


def stored_format(row):
    """Read the immutable format annotation, without assuming the current body format was historical."""
    try:
        refs=json.loads(row.get('source_refs') or '[]');value=refs[0].get('_format') if refs and isinstance(refs[0],dict) else None
        if value in ('plain','markdown','html'):return value
        ref=row.get('source_ref_key') or ''
        return None if ref.startswith('news:') and ref.endswith(':content') else 'plain'
    except (ValueError,TypeError,IndexError,AttributeError,Error):return None


def source_match(table,alias='t',live=False,allowed_fields=None):
    """Build allowlisted joins to real native fields, optionally requiring exact still-live source bytes."""
    fields=[]
    for field in FIELDS[table]:
        if allowed_fields is not None and field not in allowed_fields.get(table,()):continue
        part=f"{alias}.source_ref_key='{table}:'||s.uid||':{field}'"
        if live:
            part+=f' AND s."{field}"={alias}.source_text'
            english=ENGLISH.get(table,{}).get(field)
            if english:part+=f" AND coalesce(s.\"{english}\",'')=''"
            fmt="coalesce(s.content_format,'plain')" if table=='news' and field=='content' else "'plain'"
            part+=f' AND ({format_sql(alias)})={fmt}'
        fields.append('('+part+')')
    return '('+' OR '.join(fields)+')' if fields else '0'


def source_scope(principal,alias='t',live=False,orphans=False,allowed_fields=None):
    """Bounded SQL scope checks all eligible sources before LIMIT, including older donor candidates."""
    clauses=[];args=[]
    if live and 'public' not in principal['scopes']:return '0',()
    for table in FIELDS:
        if not principal['permissions'].get(table,{}).get('can_view'):continue
        cols=TABLES[table]['columns'];parts=[source_match(table,alias,live,allowed_fields)]
        if live:
            if 'visibility' in cols:parts.append("s.visibility='public'")
            if 'is_active' in cols:parts.append('s.is_active=1')
            if table=='news':parts.append("s.published_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')")
            if table in ('navigation_items','student_category_displays'):parts.append('s.enabled=1')
            if table=='navigation_items':parts.append("s.location!='admin-sidebar'")
            if table=='site_settings':parts.append('s.id=(SELECT min(id) FROM site_settings WHERE is_active=1)')
        elif 'visibility' in cols:
            allowed=principal['scopes'];parts.append('s.visibility IN ('+','.join('?' for _ in allowed)+')' if allowed else '0');args.extend(allowed)
        clauses.append(f'EXISTS(SELECT 1 FROM "{table}" s WHERE '+' AND '.join(parts)+')')
    if orphans and principal.get('is_system') and not live:
        # Missing sources remain maintainable, but inaccessible existing sources never become orphans.
        clauses.append('('+' AND '.join(f'NOT EXISTS(SELECT 1 FROM "{table}" s WHERE {source_match(table,alias)})' for table in FIELDS)+')')
    return '('+' OR '.join(clauses)+')' if clauses else '0',tuple(args)


def identity(row,alias='t'):
    """Exact source bytes/languages/format accompany the digest; hash collisions cannot merge texts."""
    fmt=stored_format(row) or 'unknown:'+row['uid']
    return (f'{alias}.source_hash=? AND {alias}.source_text=? AND {alias}.source_lang=? AND {alias}.target_lang=? AND ({format_sql(alias)})=?',
            (row['source_hash'],row['source_text'],row['source_lang'],row['target_lang'],fmt))


def usable_candidates(principal,alias='d',allowed_fields=None):
    """One eligibility predicate for list summaries, public reads and saved reuse."""
    live,args=source_scope(principal,alias,live=True,allowed_fields=allowed_fields)
    return (f"{alias}.status='success' AND {alias}.is_current=1 AND coalesce({alias}.translated_text,'')<>'' AND coalesce(json_extract({alias}.source_refs,'$[0]._inactive'),0)=0 AND "+live,args)


def candidate_order(alias='d'):
    """Keep the established manual-first, newest-record ordering deterministic."""
    return f'{alias}.is_manual DESC,{alias}.id DESC'


def ranked_candidates(principal,source='translation_cache',extra='1',allowed_fields=None):
    """Rank whole exact groups in SQL, retaining competing manual-text evidence."""
    where,args=usable_candidates(principal,allowed_fields=allowed_fields)
    keys='d.source_hash,d.source_text,d.source_lang,d.target_lang,'+format_sql('d')
    window='PARTITION BY '+keys
    manual="CASE WHEN d.is_manual=1 THEN d.translated_text END"
    return (f'SELECT d.*,row_number() OVER ({window} ORDER BY {candidate_order()}) _rank,'
            f'min({manual}) OVER ({window}) _manual_min,max({manual}) OVER ({window}) _manual_max '
            f'FROM {source} d WHERE '+where+' AND ('+extra+')',args)
