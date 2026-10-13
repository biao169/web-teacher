"""Bounded anonymous Read Models. No SQL cache, writes or provider calls.

v1 supports the eight standard Public modules; existing server lists stay unchanged.
All records in the chosen public scope are required. Limits fail closed rather
than exporting a truncated index with misleading local filter results.
"""
from dataclasses import dataclass
import hashlib
import json
import re
from urllib.parse import quote, urlsplit

from .catalog import Error, TABLES, now
from .content import Content
from .filtering import PUBLIC_FILTER_FIELDS, PUBLIC_SEARCH_FIELDS, operators
from .public_data import PEOPLE_FACETS, PUBLIC_FIELDS, DERIVED_YEARS, trim_snippets
from backend.app.domain.public_projects import project_role, ROLE_LABELS
from .public_revision import revision
from .student_categories import ASCII_LOWER, parse_keywords, MATCH_FIELDS
from .suggestions import MULTIVALUE,split_values
from .translation_sources import FIELDS, ENGLISH, PUBLIC_DONOR_FIELDS, reference
from .translation_index import ranked_candidates, format_sql

SUPPORTED = tuple(PUBLIC_FIELDS)
PRIVATE_PROJECT_FIELDS = frozenset(('principal','amount','members'))
MEDIA_FIELDS = ('avatar_key','cover_key','pdf_key','certificate_key','syllabus_key','material_key')
SCHEMA_VERSION = 'public-read-model-v1'

@dataclass(frozen=True)
class ModelLimits:
    max_rows: int = 500
    max_json_bytes: int = 512 * 1024
    max_field_chars: int = 4096
    max_bio_chars: int = 8192
    max_rules: int = 50
    row_batch: int = 25
    translation_batch: int = 80
    max_queries: int = 40

    def __post_init__(self):
        for name, ceiling in (('max_rows',500),('max_json_bytes',512*1024),
                              ('max_field_chars',4096),('max_bio_chars',8192),
                              ('max_rules',50),('row_batch',25),
                              ('translation_batch',80),('max_queries',40)):
            value=getattr(self,name)
            if type(value) is not int or not 1<=value<=ceiling:
                raise ValueError(name+' is outside the Read Model budget')

class ModelUnavailable(Error):
    def __init__(self, reason):
        super().__init__('公开索引暂不可生成，请使用原列表',503)
        self.code='PUBLIC_MODEL_UNAVAILABLE'
        self.reason=reason

class _Reads:
    """A request-local query budget, never a cache or result store."""
    def __init__(self,sql,limits):
        self.sql,self.limits,self.calls=sql,limits,0
        self.supports_text_hash=getattr(sql,'supports_text_hash',False)
    async def query(self,sql,args=()):
        if self.calls>=self.limits.max_queries:raise ModelUnavailable('query_limit')
        self.calls+=1
        return await self.sql.query(sql,args)

def _json(value):
    return json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)

def _field_limit(field,limits):
    return limits.max_bio_chars if field in ('bio','bio_en') else limits.max_field_chars

def _check_fields(row,limits):
    for field,value in row.items():
        if isinstance(value,str) and len(value)>_field_limit(field,limits):
            raise ModelUnavailable('field_limit')

def _web_link(value,field=''):
    if not isinstance(value,str):return ''
    value=value.strip()
    if field=='orcid' and re.fullmatch(r'\d{4}-\d{4}-\d{4}-\d{3}[\dX]',value):
        return 'https://orcid.org/'+value
    try:
        url=urlsplit(value)
        if url.scheme.lower() in ('http','https') and url.netloc and not url.username and not url.password and not any(ord(c)<33 for c in value):
            return value
    except ValueError:pass
    return ''

async def _rules(reads,limits):
    rows=await reads.query('SELECT uid,substr(label,1,4097) label,substr(label_en,1,4097) label_en,substr(keywords,1,4097) keywords FROM student_category_displays WHERE enabled=1 ORDER BY display_order,id LIMIT ?', (limits.max_rules+1,))
    if len(rows)>limits.max_rules:raise ModelUnavailable('rule_limit')
    rules=[]
    for row in rows:
        _check_fields(row,limits)
        try:words=parse_keywords(row['keywords'])
        except Error:continue # Match the existing public rules_for legacy behavior.
        if words:rules.append({'uid':row['uid'],'label':row['label'],'label_en':row['label_en'],
                               'words':[word.translate(ASCII_LOWER) for word in words]})
    return rules

async def _english(reads,table,rows,limits):
    """Batch exact-source lookups, preserving local stop/manual/explicit winners.

Only bounded winner columns are read; provider/credential metadata and historical
translations never enter the index. JSON-packed keys stay below D1 binding limits.
"""
    result=[dict(row) for row in rows]
    slots=[]
    for row in result:
        for field in FIELDS[table]:
            value=row.get(field)
            if not isinstance(value,str) or not value or row.get(ENGLISH.get(table,{}).get(field,'')):
                continue
            slots.append((row,field,reference(table,row['uid'],field),hashlib.sha256(value.encode()).hexdigest(),value))
    principal={'scopes':['public'],'permissions':{name:{'can_view':True} for name in PUBLIC_DONOR_FIELDS}}
    for offset in range(0,len(slots),limits.translation_batch):
        batch=slots[offset:offset+limits.translation_batch]
        refs=list(dict.fromkeys(slot[2] for slot in batch))
        hashes=list(dict.fromkeys(slot[3] for slot in batch))
        fields="source_ref_key,source_hash,source_text,status,is_current,is_manual,substr(translated_text,1,8193) translated_text,"+format_sql('t')+" fmt,json_extract(source_refs,'$[0]._inactive') inactive,json_extract(source_refs,'$[0]._reuse.explicit') explicit"
        own_rows=await reads.query('WITH local AS (SELECT '+fields+",row_number() OVER (PARTITION BY source_ref_key ORDER BY updated_at DESC,id DESC) local_rank FROM translation_cache t WHERE source_lang='zh' AND target_lang='en' AND source_ref_key IN (SELECT value FROM json_each(?)) AND source_hash IN (SELECT value FROM json_each(?)) AND (is_current=1 OR (is_manual=1 AND status<>'success') OR coalesce(json_extract(source_refs,'$[0]._inactive'),0)=1)) SELECT * FROM local WHERE local_rank=1",(_json(refs),_json(hashes)))
        own={item['source_ref_key']:item for item in own_rows}
        keys=list(dict.fromkeys((slot[3],slot[4]) for slot in batch))
        extra="d.source_lang='zh' AND d.target_lang='en' AND ("+format_sql('d')+")='plain' AND d.source_hash IN (SELECT json_extract(value,'$[0]') FROM json_each(?)) AND EXISTS (SELECT 1 FROM json_each(?) k WHERE d.source_hash=json_extract(k.value,'$[0]') AND d.source_text=json_extract(k.value,'$[1]'))"
        ranked,args=ranked_candidates(principal,extra=extra,allowed_fields=PUBLIC_DONOR_FIELDS)
        shared=await reads.query('WITH ranked AS ('+ranked+') SELECT source_hash,source_text,substr(translated_text,1,8193) translated_text FROM ranked WHERE _rank=1 AND coalesce(_manual_min=_manual_max,1)',(*args,_json(keys),_json(keys)))
        winners={(item['source_hash'],item['source_text']):item for item in shared}
        for row,field,ref,digest,value in batch:
            item=own.get(ref)
            if item and (item['source_hash']!=digest or item['source_text']!=value or item['fmt']!='plain'):item=None
            if item and item['inactive']:continue
            usable=item and item['is_current'] and item['status']=='success' and item['translated_text']
            if item and (item['is_manual'] or item['explicit']):
                selected=item if usable else None
            else:selected=winners.get((digest,value)) or (item if usable else None)
            if selected:
                text=selected['translated_text']
                if len(text)>_field_limit(field,limits):raise ModelUnavailable('translation_limit')
                row[field]=text
    for row in result:
        for field,english in ENGLISH.get(table,{}).items():
            if row.get(english):row[field]=row[english]
    return result

async def _media(reads,table,rows):
    keys=list(dict.fromkeys(row[field] for row in rows for field in MEDIA_FIELDS if row.get(field)
                           and (field!='pdf_key' or row.get('pdf_visibility')=='public')
                           and (field!='material_key' or row.get('material_visibility')=='public')))
    result={};types={}
    # Only active media referenced by a currently public record; never raw object keys.
    for offset in range(0,len(keys),40):
        batch=keys[offset:offset+40]
        items=await reads.query("SELECT uid,object_key,substr(mime_type,1,64) mime_type FROM media_assets WHERE status='active' AND object_key IN ("+','.join('?' for _ in batch)+')',batch)
        result.update({item['object_key']:'/media/'+quote(item['uid'],safe='') for item in items})
        types.update({item['object_key']:item['mime_type'] or '' for item in items})
    return result,types


def _tokens(value):
    return split_values(value)

async def build(r,table,lang,*,limits=None):
    """Generate a complete module/locale index; never accept visitor queries/principals."""
    if table not in SUPPORTED:raise Error('此模块尚未启用公开索引',400)
    if lang not in ('zh','en'):raise Error('页面语言无效',400)
    limits=limits or ModelLimits();reads=_Reads(r.sql,limits)
    start=await revision(reads)
    # Do not reuse r.content or r.p: even an admin caller gets the anonymous scope.
    content=Content(reads,None);where,args=content.scope(table,public=True)
    identities=await reads.query(f'SELECT uid FROM "{table}" WHERE '+where+' ORDER BY id LIMIT ?',(*args,limits.max_rows+1))
    if len(identities)>limits.max_rows:raise ModelUnavailable('row_limit')
    rules=await _rules(reads,limits) if table=='students' else []
    citation=None
    if table=='publications':
        from .public_data import citation_style
        settings=await reads.query('SELECT publication_citation_style FROM site_settings WHERE is_active=1 ORDER BY id LIMIT 1')
        citation=citation_style(settings[0] if settings else {})
    raw=[];used=0
    projection=list(dict.fromkeys((*PUBLIC_FIELDS[table],*PUBLIC_FILTER_FIELDS[table],*PUBLIC_SEARCH_FIELDS[table],'id','sort_order')))
    columns=TABLES[table]['columns'];projection=[field for field in projection if field in columns
        and not (table=='projects' and field in PRIVATE_PROJECT_FIELDS)
        and (not field.startswith(('citation_','highlight_')) or field in ('citation_'+str(citation),'highlight_'+str(citation)))]
    def projected(field):
        value=f'"{field}"'
        if columns[field]['kind'] in ('text','json'):value=f'substr({value},1,{_field_limit(field,limits)+1})'
        if field in ('pdf_key','material_key'):
            policy='pdf_visibility' if field=='pdf_key' else 'material_visibility'
            value="CASE WHEN "+policy+"='public' THEN "+value+" ELSE NULL END"
        if field in ('email','phone','office'):value="CASE WHEN contact_visibility='public' THEN "+value+" ELSE NULL END"
        return value+' AS "'+field+'"'
    selected=','.join(projected(field) for field in projection)
    for offset in range(0,len(identities),limits.row_batch):
        uids=[item['uid'] for item in identities[offset:offset+limits.row_batch]]
        rows=await reads.query(f'SELECT {selected} FROM "{table}" WHERE '+where+' AND uid IN ('+','.join('?' for _ in uids)+')',(*args,*uids))
        if len(rows)!=len(uids):raise ModelUnavailable('source_changed')
        for row in rows:
            _check_fields(row,limits);used+=len(_json(row).encode())
            if used>limits.max_json_bytes:raise ModelUnavailable('byte_limit')
        raw.extend(rows)
    # Canonical order exactly matches public listing; internal database IDs stay internal.
    for row in raw:
        if table=='students':
            joined=' '.join(str(row.get(field) or '') for field in MATCH_FIELDS).translate(ASCII_LOWER)
            row['_group_rank']=next((i for i,rule in enumerate(rules) if any(word in joined for word in rule['words'])),len(rules))
        else:row['_group_rank']=0
    raw.sort(key=lambda row:(row['_group_rank'],row['sort_order'],row['id']))
    english=[]
    for offset in range(0,len(raw),limits.row_batch):
        english.extend(await _english(reads,table,raw[offset:offset+limits.row_batch],limits))
    media,media_types=await _media(reads,table,raw)
    items=[];used=0
    display_fields=[field for field in PUBLIC_FIELDS[table] if field not in (*MEDIA_FIELDS,'contact_visibility','pdf_visibility','material_visibility','sort_order','is_featured','recruiting')
                    and not (table=='projects' and field in PRIVATE_PROJECT_FIELDS)
                    and not field.startswith(('citation_','highlight_'))]
    filter_fields=(*PUBLIC_FILTER_FIELDS[table],*DERIVED_YEARS.get(table,{}))
    for rank,(source,en) in enumerate(zip(raw,english)):
        display={field:(en if lang=='en' else source).get(field) for field in display_fields}
        # Native aliases are presentation overrides, not public internals.
        display.pop('name_en',None);display.pop('bio_en',None)
        if source.get('contact_visibility')!='public':
            for field in ('email','phone','office'):display.pop(field,None)
        trim_snippets(display,table)
        truncated=display.pop('_truncated_fields',[])
        if table=='projects':display['project_role']=project_role(display.get('project_role'),lang)
        filters={field:source.get(field) for field in filter_fields}
        for derived,original in DERIVED_YEARS.get(table,{}).items():
            value=str(source.get(original) or '').strip()
            filters[derived]=value[:4] if re.match(r'[0-9]{4}-',value) else None
        tokens={field:_tokens(source.get(field)) for field in MULTIVALUE.get(table,set()) if field in filter_fields}
        if table=='projects':tokens['project_role']=[project_role(token) for token in tokens.get('project_role',[])]
        search=list(dict.fromkeys(str(row.get(field)) for row in (source,en) for field in PUBLIC_SEARCH_FIELDS[table] if row.get(field) is not None))
        fields=('orcid','personal_homepage','google_scholar','dblp','github','cnki') if table=='profiles' else ('homepage',) if table=='students' else ('url',) if table=='publications' else ()
        links={field:_web_link(source.get(field),field) for field in fields if _web_link(source.get(field),field)}
        item={'uid':source['uid'],'display':display,'truncated_fields':truncated,'filter_values':filters,'filter_tokens':tokens,
              'search_values':search,'order':{'group':source['_group_rank'],'rank':rank},
              'media':{field.removesuffix('_key')+'_url':media[source[field]] for field in MEDIA_FIELDS if source.get(field) in media},'media_types':{field.removesuffix('_key')+'_url':media_types[source[field]] for field in MEDIA_FIELDS if source.get(field) in media},'links':links,
              'detail_url':'/'+lang+'/'+table+'/'+quote(source['uid'],safe='') if table in ('profiles','courses','news') else '/'+lang+'/'+table+'#record-'+quote(source['uid'],safe='')}
        if citation:
            # Only the configured public display format, not all citation variants.
            item['citation']={'style':citation,'text':source.get('citation_'+citation) or '',
                              'highlight':source.get('highlight_'+citation) or ''}
        items.append(item);used+=len(_json(item).encode())
        if used>limits.max_json_bytes:raise ModelUnavailable('byte_limit')
    facets=[]
    for field,zh,en_label in PEOPLE_FACETS.get(table,()):
        values=set()
        for row in raw:
            if field in DERIVED_YEARS.get(table,{}):
                value=str(row.get(DERIVED_YEARS[table][field]) or '').strip()
                if re.match(r'[0-9]{4}-',value):values.add(value[:4])
            elif table=='projects' and field=='project_role':
                values.update(project_role(token) for token in _tokens(row.get(field)))
            else:values.update(_tokens(row.get(field)) if field in MULTIVALUE.get(table,set()) else [str(row[field])] if row.get(field) is not None and str(row[field]).strip() else [])
        if field in MULTIVALUE.get(table,set()):
            distinct={}
            for value in values:
                key=value.translate(ASCII_LOWER)
                distinct[key]=min(value,distinct.get(key,value))
            values=set(distinct.values())
        values=sorted(values,key=lambda value:(value.translate(ASCII_LOWER),value),reverse=field=='year' or field in DERIVED_YEARS.get(table,{}))
        labels={}
        if lang=='en':
            from .public_translation import facet_labels
            for offset in range(0,len(values),40):labels.update(await facet_labels(content,table,field,values[offset:offset+40]))
        if lang=='en' and table=='projects' and field=='project_role':labels.update({key:value for key,value in ROLE_LABELS.items() if key in values})
        facets.append({'field':field,'label':en_label if lang=='en' else zh,'values':values,'labels':labels})
    end=await revision(reads)
    if start!=end:raise ModelUnavailable('source_changed')
    model={'schema_version':SCHEMA_VERSION,'model_key':table+'-public-index-'+lang,
           'module':table,'lang':lang,'revision':start,'generated_at':now(),'complete':True,
           'total':len(items),'items':items,'facets':facets,
           'groups':[{'uid':rule['uid'],'label':(rule['label_en'] or rule['label']) if lang=='en' else rule['label']} for rule in rules]+([{'uid':'_other','label':'Other students' if lang=='en' else '其他学生'}] if table=='students' else []),
           'semantics':{'search':'literal-substring-ascii-nocase-raw-or-effective-English',
                        'filters':{field:{'kind':'text' if field in DERIVED_YEARS.get(table,{}) else columns[field]['kind'],
                                          'operators':['eq'] if field in DERIVED_YEARS.get(table,{}) else list(operators(table,field,public=True)),
                                          'facet_tokens':field in MULTIVALUE.get(table,set()) and field in {f[0] for f in PEOPLE_FACETS.get(table,())},
                                          'equality':'raw-binary-or-token-ascii-nocase' if field in MULTIVALUE.get(table,set()) and field in {f[0] for f in PEOPLE_FACETS.get(table,())} else 'raw-binary'} for field in filter_fields},
                        'default_order':'group-then-rank' if table=='students' else 'rank',
                        'descending':'reverse-within-group','page_sizes':[10,20],
                        'project_role_aliases':table=='projects',
                        'custom_navigation':'server-fallback-until-client-parity'},
           'stats':{'queries':reads.calls}}
    payload=_json(model).encode()
    if len(payload)>limits.max_json_bytes:raise ModelUnavailable('byte_limit')
    model['stats']['json_bytes']=len(payload)
    # Include the byte statistic itself in the final budget.
    for _ in range(3):
        length=len(_json(model).encode())
        if length==model['stats']['json_bytes']:break
        model['stats']['json_bytes']=length
    if model['stats']['json_bytes']>limits.max_json_bytes:raise ModelUnavailable('byte_limit')
    return model
