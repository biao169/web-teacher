"""Inspect official Wrangler multipart artifacts; no network or publication.

The same original bytes can form a Workers Scripts API upload. Non-versioned
settings (subdomain, preview URLs, schedules) and secrets need separate handling
by the future release orchestrator. This module never claims cloud acceptance.
"""
from email.parser import BytesParser
from email import policy
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
from urllib.request import Request

MAX_ARTIFACT = 256 * 1024 * 1024  # Build-host guard, not a Worker runtime limit.


def names(main):
    from site_sync.integration.package import worker_names
    return worker_names(main)


def inspect_artifact(path, config, main_name, role):
    """Reject wrong targets, incomplete modules, secrets, or website bindings."""
    from site_workers import admin_name
    targets={**names(main_name),'admin':admin_name(main_name)}
    if role not in targets or config.get('name')!=targets[role]:
        raise ValueError('Companion target mismatch')
    if config.get('workers_dev') is not False or config.get('preview_urls') is not False:
        raise ValueError('Companions must be private')
    if any(key in config for key in ('assets','routes')):
        raise ValueError('Companion contains website-only configuration')
    expected_do={'bindings':[{'name':'SYNC_COORDINATOR','class_name':'SyncCoordinator'}]}
    expected_migrations=[{'tag':'teacher-sync-alarm-v1','new_sqlite_classes':['SyncCoordinator']}]
    if role=='native':
        if config.get('durable_objects')!=expected_do or config.get('migrations')!=expected_migrations:raise ValueError('Sync coordinator configuration mismatch')
    elif any(k in config for k in ('durable_objects','migrations')):raise ValueError('Executor cannot own DOs')
    if role=='admin' and config.get('triggers')!={'crons':[]}:raise ValueError('Admin must not schedule tasks')
    path=Path(path)
    if not 0<path.stat().st_size<=MAX_ARTIFACT:
        raise ValueError('Invalid multipart artifact size')
    raw=path.read_bytes()
    first=raw.split(b'\r\n',1)[0]
    if not re.fullmatch(rb'--[A-Za-z0-9_-]{1,100}',first):
        raise ValueError('Invalid multipart boundary')
    boundary=first[2:].decode('ascii')
    if not raw.rstrip(b'\r\n').endswith(first+b'--'):
        raise ValueError('Truncated multipart artifact')
    content_type='multipart/form-data; boundary='+boundary
    message=BytesParser(policy=policy.default).parsebytes(
        ('Content-Type: '+content_type+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+raw)
    if not message.is_multipart() or message.defects:
        raise ValueError('Malformed multipart artifact')
    parts={}
    for part in message.iter_parts():
        name=part.get_param('name',header='content-disposition')
        if (part.defects or not name or name in parts or '\\' in name or
            name.startswith('/') or '..' in PurePosixPath(name).parts):
            raise ValueError('Invalid or duplicated module part')
        parts[name]=(part.get_content_type(),part.get_payload(decode=True))
    if 'metadata' not in parts:
        raise ValueError('Missing upload metadata')
    metadata=json.loads(parts.pop('metadata')[1])
    main=metadata.get('main_module')
    if main not in parts:
        raise ValueError('Entrypoint missing from upload')
    for key in ('assets','containers','exports'):
        if metadata.get(key):raise ValueError('Unexpected website upload metadata')
    if metadata.get('compatibility_date')!=config['compatibility_date'] or set(metadata.get('compatibility_flags',[]))!=set(config.get('compatibility_flags',[])):
        raise ValueError('Compatibility metadata mismatch')
    bindings=metadata.get('bindings',[])
    if len({b.get('name') for b in bindings})!=len(bindings):
        raise ValueError('Duplicate binding names')
    if any(b.get('type') not in ('plain_text','d1','r2_bucket','service','durable_object_namespace') for b in bindings):
        raise ValueError('Unexpected or secret binding in artifact')
    actual={b['name']:b for b in bindings}
    if role=='native':
        migration=metadata.get('migrations')
        if migration not in (None,{'new_tag':'teacher-sync-alarm-v1','steps':[{'new_sqlite_classes':['SyncCoordinator']}]}):raise ValueError('Sync coordinator migration mismatch')
    elif metadata.get('migrations'):raise ValueError('Unexpected migration')
    expected={}
    for key,value in config.get('vars',{}).items():
        if re.search(r'(TOKEN|SECRET|PASSWORD|API_KEY|SYNC_KEY)',key,re.I):
            raise ValueError('Credential in plain-text configuration')
        expected[key]={'type':'plain_text','name':key,'text':str(value)}
    for b in config.get('d1_databases',[]):expected[b['binding']]={'type':'d1','name':b['binding'],'id':b['database_id']}
    for b in config.get('r2_buckets',[]):
        expected[b['binding']]={'type':'r2_bucket','name':b['binding'],'bucket_name':b['bucket_name']}
        for key in ('jurisdiction',):
            if key in b:expected[b['binding']][key]=b[key]
    for b in config.get('services',[]):
        expected[b['binding']]={'type':'service','name':b['binding'],'service':b['service']}
    if role=='native':expected['SYNC_COORDINATOR']={'type':'durable_object_namespace','name':'SYNC_COORDINATOR','class_name':'SyncCoordinator'}
    if actual!=expected:raise ValueError('Upload bindings differ from generated configuration')
    if role=='native':
        if parts[main][0]!='application/javascript+module':raise ValueError('Native entrypoint is not an ES module')
    else:
        if parts[main][0]!='text/x-python' or 'python_workers' not in metadata.get('compatibility_flags',[]):
            raise ValueError('Python entrypoint/compatibility flag missing')
        required=('worker_runtime/admin_entrypoint.py','backend/app/native/web_admin.py','generated_admin_templates.py') if role=='admin' else ('worker_runtime/sync_executor.py','site_sync/integration/worker_schedule.py')
        if any(not any(n==suffix or n.endswith('/'+suffix) for n in parts) for suffix in required):
            raise ValueError('Python executor source incomplete')
        if not any(n.startswith('python_modules/') for n in parts):
            raise ValueError('Python vendored dependencies missing; run pywrangler sync')
        if not any('workers_runtime' in n or 'workers-runtime-sdk' in n for n in parts):
            raise ValueError('Python runtime SDK missing')
    content={'metadata':metadata,'modules':{n:{'type':t,'sha256':hashlib.sha256(b).hexdigest()} for n,(t,b) in sorted(parts.items())}}
    content_sha256=hashlib.sha256(json.dumps(content,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    return {'worker':config['name'],'role':role,'main_module':main,'module_count':len(parts),
            'content_sha256':content_sha256,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'content_type':content_type,
            'module_types':sorted({t for t,_ in parts.values()}),
            'bindings':sorted(({'name':b['name'],'type':b['type']} for b in bindings),key=lambda b:b['name']),
            'artifact_validation':'passed','cloud_upload':'not_run','cloud_startup':'not_run',
            'additional_release_steps':['ownership_check','secret_configuration','disable_public_access','schedule_configuration','runtime_check']}


def upload_request(path, config, main_name, role, account_id, token):
    """Construct only; caller must explicitly send after ownership/permission checks."""
    if not re.fullmatch(r'[a-fA-F0-9]{32}',account_id):raise ValueError('Invalid account ID')
    if not token or '\r' in token or '\n' in token:raise ValueError('Invalid API token')
    info=inspect_artifact(path,config,main_name,role)
    payload=Path(path).read_bytes()
    if hashlib.sha256(payload).hexdigest()!=info['sha256']:raise ValueError('Artifact changed during validation')
    return Request('https://api.cloudflare.com/client/v4/accounts/'+account_id+'/workers/scripts/'+info['worker'],
                   data=payload,method='PUT',headers={'Authorization':'Bearer '+token,'Content-Type':info['content_type']})
