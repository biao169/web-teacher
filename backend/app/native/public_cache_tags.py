"""Dependency tags and bounded, post-commit change plans; no cache contents or SQL reads."""
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass,field
import hashlib,re
from urllib.parse import urlsplit,unquote
from backend.app.public_performance import PUBLIC_TABLES
from .public_revision import WRITE

MODULES=frozenset(PUBLIC_TABLES)
SINGULAR={'profiles':'profile','students':'student','research_interests':'research-interest','projects':'project','publications':'publication','patents':'patent','courses':'course','news':'news'}
COMMON={'public-layout','public-translations','public-media','public-home'}
HEADER='x-teacher-public-cache-commit'
_hint=ContextVar('public_mutation_hint',default=None)
_current=ContextVar('public_committed_changes',default=None)

def record_tag(table,uid):
    if table not in MODULES:raise ValueError('Invalid public module')
    value=uid if isinstance(uid,str) and re.fullmatch('[a-f0-9]{32}',uid) else hashlib.sha256(str(uid).encode()).hexdigest()[:32]
    return SINGULAR[table]+'-'+value

def module_tag(table):return 'public-'+table.replace('_','-')

def page_tags(request):
    parts=urlsplit(str(request.url)).path.strip('/').split('/')
    tags={'public-layout','public-translations','public-media'}
    if len(parts)==1:tags.add('public-home')
    elif len(parts)>=2 and parts[1] in MODULES:
        tags.add(module_tag(parts[1]))
        if len(parts)==3:tags.add(record_tag(parts[1],unquote(parts[2])))
    return ','.join(sorted(tags))

def data_tags(table):return ','.join(sorted({module_tag(table),'public-translations','public-media'}))

def valid_tag(tag):
    return isinstance(tag,str) and (tag in COMMON or tag in {module_tag(t) for t in MODULES} or any(re.fullmatch(prefix+'-[a-f0-9]{32}',tag) for prefix in SINGULAR.values()))

@dataclass
class Plan:
    invalidate:set=field(default_factory=set)
    purge:set=field(default_factory=set)
    def add(self,tags,hard=False):
        (self.purge if hard else self.invalidate).update(tags)
        self.invalidate.difference_update(self.purge)
    def merge(self,other):
        self.add(other.invalidate);self.add(other.purge,True)
    def payload(self):
        def bounded(tags):
            tags=set(tags)
            if len(tags)>48:
                # A module tag also covers its detail responses; drop redundant row tags.
                for table,prefix in SINGULAR.items():
                    if module_tag(table) in tags:
                        tags={tag for tag in tags if not re.fullmatch(prefix+'-[a-f0-9]{32}',tag)}
            if len(tags)>64:raise ValueError('Too many cache tags')
            return sorted(tags)
        return {'invalidate':bounded(self.invalidate-self.purge),'purge':bounded(self.purge)}
    def __bool__(self):return bool(self.invalidate or self.purge)

def validate_payload(value):
    if not isinstance(value,dict) or set(value)!={'invalidate','purge'}:raise ValueError('Invalid cache plan')
    for mode,tags in value.items():
        if not isinstance(tags,list) or len(tags)>64 or any(not valid_tag(t) for t in tags):raise ValueError('Invalid cache tags')
    plan=Plan();plan.add(value['invalidate']);plan.add(value['purge'],True);return plan

def change_plan(table,uid,before,after,deleted=False):
    plan=Plan()
    if table not in MODULES and table not in ('student_category_displays','navigation_items','site_settings','global_settings','translation_cache','media_assets'):return plan
    from .catalog import defaults
    from .translation_sources import public_source,PUBLIC_DONOR_FIELDS
    had_before=bool(before);before=defaults(table)|dict(before or {});after=defaults(table)|dict(after or {})
    changed={k for k in set(before)|set(after) if before.get(k)!=after.get(k)}-{'id','uid','created_at','updated_at'}
    if not deleted and not changed:return plan
    was=had_before and public_source(table,before);visible=not deleted and public_source(table,after)
    hard=deleted or (was and not visible)
    for gate in ('contact_visibility','pdf_visibility','material_visibility'):
        hard=hard or (before.get(gate)=='public' and after.get(gate)!='public')
    if table in MODULES:
        # Private-only project edits never affect an anonymous result or public donor.
        if table=='projects' and not deleted and changed<= {'principal','members','amount'}:return plan
        if not (was or visible or deleted):return plan
        plan.add({module_tag(table),'public-home',record_tag(table,uid)},hard)
        if deleted or was!=visible or changed & set(PUBLIC_DONOR_FIELDS.get(table,())):
            plan.add({'public-translations'},hard)
    elif table=='translation_cache':plan.add({'public-translations'},hard)
    elif table=='media_assets':
        hard=deleted or before.get('status')=='active' and (after.get('status')!='active' or bool(changed & {'object_key','storage_kind'}))
        plan.add({'public-media'},hard)
    elif table=='student_category_displays':
        plan.add({module_tag('students'),'public-home','public-translations'},hard)
    elif table=='navigation_items':
        if before.get('location')=='admin-sidebar' and after.get('location')=='admin-sidebar':return plan
        plan.add({'public-layout'},hard)
        if changed & set(PUBLIC_DONOR_FIELDS[table]) or hard:plan.add({'public-translations'},hard)
    elif table=='site_settings':
        plan.add({'public-layout'},hard)
        if 'publication_citation_style' in changed:plan.add({module_tag('publications')},hard)
        if changed & set(PUBLIC_DONOR_FIELDS[table]) or hard:plan.add({'public-translations'},hard)
    # global_settings controls dynamic forms/PDF/tools, not these cached read models.
    # In particular, translation job/checkpoint progress must not invalidate pages.
    return plan

@contextmanager
def mutation_hint(table,uid,before,after,deleted=False):
    token=_hint.set((table,change_plan(table,uid,before,after,deleted)))
    try:yield
    finally:_hint.reset(token)

def statements_plan(statements):
    result=Plan();hint=_hint.get()
    for sql,args in statements:
        match=WRITE.match(sql)
        if not match:continue
        table=match[1].lower()
        if hint and table==hint[0]:result.merge(hint[1]);continue
        # Bulk/tool writes lack before/after rows. Conservative per-dependency fallback.
        hard=bool(re.match(r'^\s*(DELETE|REPLACE)\b',sql,re.I) or re.search(r'ON\s+CONFLICT.*DO\s+UPDATE',sql,re.I))
        assignments=sql.split('WHERE',1)[0]
        hard=hard or bool(re.match(r'^\s*UPDATE\b',sql,re.I) and re.search(r'\b(visibility|contact_visibility|pdf_visibility|material_visibility|is_active|enabled)\b',assignments,re.I))
        if table in MODULES:result.add({module_tag(table),'public-home','public-translations'},hard)
        elif table=='student_category_displays':result.add({module_tag('students'),'public-home','public-translations'},hard)
        elif table=='translation_cache':result.add({'public-translations'},hard)
        elif table=='media_assets':
            hard=hard or bool(re.match(r'^\s*UPDATE\b',sql,re.I) and re.search(r'\b(status|object_key|storage_kind)\b',assignments,re.I))
            result.add({'public-media'},hard)
        elif table in ('site_settings','navigation_items'):
            result.add({'public-layout'},hard)
            result.add({'public-translations'},hard)
            if table=='site_settings':result.add({module_tag('publications')},hard)
        elif table.startswith('news_'):result.add({module_tag('news')},hard)
    return result

class CommittedChanges:
    def __init__(self):self.plan=Plan()
    async def record(self,statements):
        self.plan.merge(statements_plan(statements))
        compact=self.plan.payload();self.plan=Plan(set(compact['invalidate']),set(compact['purge']))
    def __enter__(self):self.token=_current.set(self);return self
    def __exit__(self,*exc):_current.reset(self.token)

async def record_commit(statements):
    changes=_current.get()
    if changes is not None:await changes.record(statements)

async def after_commit(sql,statements):
    callback=getattr(sql,'on_public_commit',None)
    if callback is None:return
    try:await callback(statements)
    except Exception:
        import logging
        logging.getLogger(__name__).error('Public cache notification could not be recorded after commit')
