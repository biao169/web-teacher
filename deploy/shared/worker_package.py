"""Copy shared native resources into independent Worker packages; never publish or run SQL."""
from pathlib import Path
import argparse,json,re,shutil,sys
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
def prepare(transfer=False,argv=None,*,migration_plan=True):
    """Write UTF-8 resources and binding configuration without depending on host code pages."""
    from backend.app.config import Settings
    from backend.app.security.http import AuthConfig
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path);p.add_argument('--worker-name');p.add_argument('--database-id',required=True);p.add_argument('--database-name',default='teacher-transfer' if transfer else 'teacher-site');p.add_argument('--origin',required=True);p.add_argument('--allowed-origins',default='');p.add_argument('--bucket',required=True);p.add_argument('--cache-bucket');p.add_argument('--database-binding',default='TRANSFER_DB' if transfer else 'DB');p.add_argument('--media-binding',default='TRANSFER_FILES' if transfer else 'MEDIA');p.add_argument('--cache-binding');p.add_argument('--media-prefix',default='transfer/media/' if transfer else 'media/');p.add_argument('--cache-prefix',default='transfer/cache/' if transfer else 'cache/');p.add_argument('--teacher-origin',required=transfer);p.add_argument('--grant-uid',required=transfer);p.add_argument('--migration-plan',action=argparse.BooleanOptionalAction,default=migration_plan,help='Generate legacy migration plan; requires a Python interpreter with SQLite');a=p.parse_args(argv)
    origin_config=AuthConfig.from_origin(a.origin,a.allowed_origins)
    if not origin_config.secure or (transfer and not AuthConfig.from_origin(a.teacher_origin).secure):p.error('HTTPS origin required')
    if not re.fullmatch(r'[a-fA-F0-9-]{36}',a.database_id):p.error('Invalid D1 UUID')
    if transfer and not re.fullmatch(r'[A-Za-z0-9:._-]{1,128}',a.grant_uid):p.error('Invalid CMS manager UID')
    cache=a.cache_binding or (('TRANSFER_CACHE' if transfer else 'CACHE') if a.cache_bucket else a.media_binding)
    settings=Settings(Path('/runtime-data'),database_binding=a.database_binding,media_binding=a.media_binding,cache_binding=cache,media_prefix=a.media_prefix,cache_prefix=a.cache_prefix)
    if a.database_binding in (a.media_binding,cache) or (a.cache_bucket and cache==a.media_binding):p.error('Binding names conflict')
    # The normal Cloudflare entrypoint opts out; retain the shared helper's legacy default.
    plan=None
    if not transfer and a.migration_plan:
        try:
            from backend.app.native.schema_migrations import SUPPORTED,statements_for
            plan={'warning':'DDL only. Stop writes, back up and verify exact predecessor. Legacy transfer parts require the local Python data migration; do not run DDL alone on those databases.','predecessors':{v:statements_for(v) for v in SUPPORTED}}
        except ModuleNotFoundError as exc:
            if exc.name not in ('sqlite3','_sqlite3'):raise
            p.error('Legacy migration plan requires SQLite support; omit --migration-plan in Cloudflare or use --no-migration-plan / 旧迁移计划需要带 SQLite 的 Python，正常 Workers 部署无需此计划')
    if a.output:
        out=a.output.resolve()
        if out==ROOT or out.is_relative_to(ROOT) or ROOT.is_relative_to(out):p.error('Output must be outside source tree')
        if out.exists():p.error('Explicit output must not exist; refusing to overwrite')
        out.mkdir(parents=True)
    else:
        out=ROOT/('.transfer-worker' if transfer else '.worker')
        if out.exists():shutil.rmtree(out)
        out.mkdir()
    shutil.copytree(ROOT/'backend',out/'backend',ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    shutil.copytree(ROOT/'site_sync',out/'site_sync',ignore=shutil.ignore_patterns('__pycache__','*.pyc','tests','tests_website','prototypes','examples','docs','frontend','README.md'))
    native={n:json.loads((ROOT/'database/native'/(n+'.json')).read_text(encoding='utf-8')) for n in ('schema-spec','editor-contract')}
    code='NATIVE = '+repr(native)+'\n'
    # Copy the canonical installer without importing SQLite-dependent schema helpers.
    if transfer:
        objects=json.loads((ROOT/'database/native/transfer.json').read_text(encoding='utf-8'))['objects']
        sql='\n\n'.join(item['sql'].rstrip(';')+';' for item in objects)
    else:
        sql=(ROOT/'database/schema.sql').read_text(encoding='utf-8')
    if transfer:
        shutil.copytree(ROOT/'transfer/backend',out/'transfer/backend',ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
        templates={f.name:f.read_text(encoding='utf-8') for f in (ROOT/'transfer/frontend/native').glob('*.html')};defaults=json.loads((ROOT/'database/native/transfer-defaults.json').read_text(encoding='utf-8'));code+='TRANSFER_TEMPLATES = '+repr(templates)+'\nTRANSFER_DEFAULTS = '+repr(defaults)+'\n'
        shutil.copytree(ROOT/'transfer/frontend/native',out/'assets/transfer-static',ignore=shutil.ignore_patterns('*.html'))
        literal=lambda value:"'"+value.replace("'","''")+"'"
        sql+="\nINSERT INTO service_meta VALUES('owner','academic-file-transfer');\nINSERT INTO vpn_state VALUES(1,'{}');\nINSERT INTO tool_settings VALUES(1,0,"+literal(json.dumps(defaults))+",strftime('%Y-%m-%dT%H:%M:%fZ','now'),'initial-defaults');\nINSERT INTO admin_grants VALUES("+literal(a.grant_uid)+",strftime('%Y-%m-%dT%H:%M:%fZ','now'),'operator');\n"
    else:
        templates={}
        for area in ('shared','admin','public'):templates.update({area+'/'+f.relative_to(ROOT/'frontend'/area/'templates').as_posix():f.read_text(encoding='utf-8') for f in (ROOT/'frontend'/area/'templates').rglob('*.html')})
        templates.update({'sync/'+f.relative_to(ROOT/'site_sync/frontend/templates').as_posix():f.read_text(encoding='utf-8') for f in (ROOT/'site_sync/frontend/templates').rglob('*.html')})
        shutil.copytree(ROOT/'site_sync/frontend/static',out/'assets/assets/site-sync')
        code+='TEMPLATES = '+repr(templates)+'\n'
    for area in (('shared','admin') if transfer else ('shared','admin','public')):shutil.copytree(ROOT/'frontend'/area/'static',out/'assets/assets'/area)
    (out/'generated_resources.py').write_text(code,encoding='utf-8');(out/'initialize.sql').write_text(sql,encoding='utf-8');(out/'main.py').write_text('from '+('transfer.backend.worker' if transfer else 'backend.entrypoints.worker')+' import Default\n',encoding='utf-8');shutil.copy2(ROOT/'deploy/cloudflare/pyproject.toml',out/'pyproject.toml')
    if plan is not None:
        (out/'migration-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
    prefix='TRANSFER_' if transfer else 'TEACHER_';variables={prefix+'ORIGIN':a.origin.rstrip('/'),prefix+'DATABASE_BINDING':a.database_binding,prefix+'MEDIA_BINDING':a.media_binding,prefix+'CACHE_BINDING':cache,prefix+'MEDIA_PREFIX':settings.media_prefix,prefix+'CACHE_PREFIX':settings.cache_prefix}
    if not transfer:variables['TEACHER_ALLOWED_ORIGINS']=','.join(origin_config.allowed_origins)
    if transfer:variables['TEACHER_ORIGIN']=a.teacher_origin.rstrip('/')
    buckets=[{'binding':a.media_binding,'bucket_name':a.bucket}]
    if cache!=a.media_binding:buckets.append({'binding':cache,'bucket_name':a.cache_bucket or a.bucket})
    config={'name':a.worker_name or ('teacher-transfer' if transfer else 'teacher-site'),'main':'main.py','compatibility_date':'2026-09-14','compatibility_flags':['python_workers','global_fetch_strictly_public'],'vars':variables,'assets':{'directory':'./assets','binding':'ASSETS'},'d1_databases':[{'binding':a.database_binding,'database_name':a.database_name,'database_id':a.database_id}],'r2_buckets':buckets}
    (out/'wrangler.json').write_text(json.dumps(config,indent=2),encoding='utf-8');print('Prepared '+str(out)+'. initialize.sql is for an EMPTY database; nothing deployed.');return out
