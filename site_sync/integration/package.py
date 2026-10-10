"""Package private native stream companion from this source tree only."""
import json,shutil,ast
from backend.app.public_performance import KEYS as PUBLIC_KEYS

def worker_names(main):
    import re,hashlib
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,62}',main):raise ValueError('Invalid main Worker name')
    def name(limit,suffix):
        base=main if len(main)<=limit else main[:limit-9]+'-'+hashlib.sha256(main.encode()).hexdigest()[:8]
        return base+suffix
    return {'native':name(51,'-sync-native'),'executor':name(49,'-sync-executor')}

def write_native(root,stage,config):
    native=stage/'sync-native';native.mkdir()
    shutil.copytree(root/'site_sync/worker',native/'worker',ignore=shutil.ignore_patterns('*.test.mjs'))
    name=worker_names(config['name'])['native']
    media=next(b for b in config['r2_buckets'] if b['binding']==config['vars']['TEACHER_MEDIA_BINDING'])
    db=config['d1_databases'][0]
    cfg={'name':name,'main':'worker/native_service.mjs','compatibility_date':config['compatibility_date'],
         'compatibility_flags':['global_fetch_strictly_public'],'workers_dev':False,'preview_urls':False,
         'vars':{'TEACHER_MEDIA_PREFIX':config['vars']['TEACHER_MEDIA_PREFIX']},
         'd1_databases':[dict(db,binding='DB')],'r2_buckets':[dict(media,binding='MEDIA')]}
    if config.get('vars',{}).get('TEACHER_RELEASE'):cfg['vars']['TEACHER_RELEASE']=config['vars']['TEACHER_RELEASE']
    cfg['vars']['TEACHER_SYNC_PAUSED']=str(config.get('vars',{}).get('TEACHER_SYNC_PAUSED','0'))
    cfg['durable_objects']={'bindings':[{'name':'SYNC_COORDINATOR','class_name':'SyncCoordinator'}]}
    cfg['migrations']=[{'tag':'teacher-sync-alarm-v1','new_sqlite_classes':['SyncCoordinator']}]
    (native/'wrangler.jsonc').write_text(json.dumps(cfg,indent=2))
    return cfg

def native_package(root,stage,config):
    native=write_native(root,stage,config)
    name=native['name']
    config['services']=[{'binding':'SYNC_NATIVE','service':name}]
    config['assets']['run_worker_first'].append('/sync/*')
    mode=config.get('vars',{}).get('TEACHER_SYNC_EXECUTOR_MODE','inline')
    if mode not in ('inline','separate'):raise ValueError('TEACHER_SYNC_EXECUTOR_MODE must be inline or separate')
    if mode=='separate':
        # Same staged source and locked Python dependencies; no second website,
        # database initialization file, public route, assets or admin session.
        executor={k:config[k] for k in ('compatibility_date','compatibility_flags','vars','d1_databases','r2_buckets','services')}
        executor['vars']={k:v for k,v in config['vars'].items() if k not in PUBLIC_KEYS}
        executor.update(name=worker_names(config['name'])['executor'],main='src/sync_executor.py',workers_dev=False,preview_urls=False,triggers={'crons':['* * * * *']})
        (stage/'src/sync_executor.py').write_text('from worker_runtime.sync_executor import Default\n')
        (stage/'wrangler.sync-executor.jsonc').write_text(json.dumps(executor,indent=2))
        config['services']=[*config['services'],{'binding':'SYNC_EXECUTOR','service':executor['name']}]

def verify(root,stage):
    for folder in ('core','adapters','runtime','transport','integration','admin'):
        for p in (root/'site_sync'/folder).rglob('*.py'):
            target=stage/'src/site_sync'/p.relative_to(root/'site_sync')
            if not target.is_file() or target.read_bytes()!=p.read_bytes():raise ValueError('Sync source differs: '+str(p))
    for p in (root/'site_sync/frontend/static').iterdir():
        if p.is_file() and (stage/'assets/assets/site-sync'/p.name).read_bytes()!=p.read_bytes():raise ValueError('Sync asset differs')
    cfg=json.loads((stage/'wrangler.jsonc').read_text())
    if not any(b.get('binding')=='SYNC_NATIVE' for b in cfg.get('services',[])):raise ValueError('Native service binding missing')

    if cfg.get('vars',{}).get('TEACHER_SYNC_EXECUTOR_MODE')=='separate':
        executor=json.loads((stage/'wrangler.sync-executor.jsonc').read_text())
        if executor.get('workers_dev') is not False or executor.get('preview_urls') is not False or any(k in executor for k in ('routes','assets','durable_objects')):raise ValueError('Executor must remain private and scheduled only')
        if executor.get('triggers')!={'crons':['* * * * *']}:raise ValueError('Executor recovery schedule missing')
        for key in ('d1_databases','r2_buckets','compatibility_flags'):
            if executor.get(key)!=cfg.get(key):raise ValueError('Executor resource/config mismatch: '+key)
        expected_vars={k:v for k,v in cfg.get('vars',{}).items() if k not in PUBLIC_KEYS}
        if executor.get('vars')!=expected_vars:raise ValueError('Executor variable scope mismatch')
        if executor.get('services')!=[b for b in cfg['services'] if b['binding'] not in ('SYNC_EXECUTOR','SITE_ADMIN')]:raise ValueError('Executor native binding mismatch')
        if not any(b.get('binding')=='SYNC_EXECUTOR' and b.get('service')==executor['name'] for b in cfg['services']):raise ValueError('Main executor binding missing')
        if executor.get('main')!='src/sync_executor.py' or (stage/'src/sync_executor.py').read_text().strip()!='from worker_runtime.sync_executor import Default':raise ValueError('Executor entrypoint missing')
        if (stage/'src/worker_runtime/sync_executor.py').read_bytes()!=(root/'deploy/cloudflare/runtime/sync_executor.py').read_bytes():raise ValueError('Executor source mismatch')
