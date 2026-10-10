"""Website role packaging. Independent of synchronization protocol packaging."""
import ast,copy,hashlib,json
from pathlib import Path

def admin_name(main):
    base=main if len(main)<=57 else main[:48]+'-'+hashlib.sha256(main.encode()).hexdigest()[:8]
    return base+'-admin'

def literals(path):
    return {n.targets[0].id:ast.literal_eval(n.value) for n in ast.parse(path.read_text()).body if isinstance(n,ast.Assign)}

def subset(templates,roots):
    from jinja2 import Environment,meta
    result={};pending=list(roots);env=Environment()
    while pending:
        name=pending.pop()
        if name in result:continue
        result[name]=templates[name]
        pending.extend(n for n in meta.find_referenced_templates(env.parse(templates[name])) if n is not None)
    return result

ADMIN_VARS=("TEACHER_METADATA_EMAIL","TEACHER_TRANSLATION_HOSTS")
ADMIN_SECRETS=("TEACHER_SETUP_TOKEN","TEACHER_OPENALEX_API_KEY","TEACHER_SEMANTIC_SCHOLAR_API_KEY","TEACHER_PUBMED_API_KEY","TEACHER_GOOGLE_TRANSLATE_KEY","TEACHER_DEEPL_API_KEY","TEACHER_MICROSOFT_TRANSLATOR_KEY","TEACHER_LIBRETRANSLATE_API_KEY")

def extend(root,stage,cfg,env=None):
    src=stage/'src'
    (src/'worker_runtime/site_mode.py').write_text('SYNC_EXECUTOR_MODE = '+repr(cfg.get('vars',{}).get('TEACHER_SYNC_EXECUTOR_MODE','inline'))+'\n')
    values=literals(src/'generated_resources.py');templates=values['TEMPLATES']
    groups={
      'public':{n:v for n,v in templates.items() if n.startswith(('shared/','public/'))},
      'admin':subset(templates,[n for n in templates if n.startswith(('shared/','admin/','sync/'))]+['public/auth-page.html','public/native-footer-links.html']),
      'transfer':subset(templates,[n for n in templates if n.startswith(('shared/','public/'))]+['admin/native-transfer.html','admin/native-access-error.html'])}
    for role,selected in groups.items():
        file=src/('generated_'+role+'_templates.py')
        file.write_text('TEMPLATES = '+repr(selected)+'\n'+(''.join(k+' = '+repr(values[k])+'\n' for k in ('TRANSFER_TEMPLATES','TRANSFER_DEFAULTS','TRANSFER_CATALOG')) if role=='transfer' else ''))
        (src/'worker_runtime'/(role+'_resources.py')).write_text('from generated_'+role+'_templates import TEMPLATES\nfrom backend.app.web.rendering import Renderer\nfrom worker_runtime.site_resources import resource\nrenderer=Renderer.bundled(TEMPLATES)\ndef resource_factory(request):\n    return resource(request,renderer,admin='+str(role=='admin')+')\n')
    admin={k:copy.deepcopy(cfg[k]) for k in ('compatibility_date','compatibility_flags','vars','d1_databases','r2_buckets','services')}
    # HTTP control needs Native but never calls the Executor itself.
    from backend.app.public_performance import KEYS
    for key in KEYS:admin['vars'].pop(key,None)
    admin['vars'].update({k:env[k] for k in ADMIN_VARS if env and k in env})
    admin['services']=[b for b in admin['services'] if b['binding']=='SYNC_NATIVE']
    admin.update(name=admin_name(cfg['name']),main='src/admin_main.py',workers_dev=False,preview_urls=False,triggers={'crons':[]})
    (src/'admin_main.py').write_text('from worker_runtime.admin_entrypoint import Default\n')
    (stage/'wrangler.admin.jsonc').write_text(json.dumps(admin,indent=2))
    cfg['services'].append({'binding':'SITE_ADMIN','service':admin['name']})
    # Assets stay on the existing origin; only template literals are role-specific.
    required=['/admin','/admin/*','/auth','/auth/*','/setup','/setup/*','/api/*','/sync','/sync/*','/transfer','/transfer/*','/health','/health/*']
    cfg['assets']['run_worker_first']=list(dict.fromkeys(cfg['assets']['run_worker_first']+required))
    (stage/'wrangler.jsonc').write_text(json.dumps(cfg,indent=2))
    # Full template literals are build input only, not another deployed copy.
    (src/'generated_resources.py').unlink()
    verify(stage)
    (stage/'site-route-ownership.json').write_text(json.dumps(verify_routes(),ensure_ascii=False,indent=2))

def verify(stage):
    cfg=json.loads((stage/'wrangler.jsonc').read_text());admin=json.loads((stage/'wrangler.admin.jsonc').read_text())
    assert admin['name']==admin_name(cfg['name'])
    assert admin['triggers']=={'crons':[]} and admin['workers_dev'] is False and admin['preview_urls'] is False
    assert not any(k in admin for k in ('assets','routes','durable_objects','migrations'))
    assert admin['d1_databases']==cfg['d1_databases'] and admin['r2_buckets']==cfg['r2_buckets']
    assert any(b=={'binding':'SITE_ADMIN','service':admin['name']} for b in cfg['services'])
    public=literals(stage/'src/generated_public_templates.py')['TEMPLATES']
    assert not any(n.startswith(('admin/','sync/')) for n in public)
    assert 'NATIVE' not in literals(stage/'src/generated_public_templates.py')
    return admin

def verify_routes():
    """Build-host check of the actual route installers; no runtime resources."""
    import importlib.util
    spec=importlib.util.spec_from_file_location('teacher_site_ownership',Path(__file__).parent/'runtime/site_routes.py')
    routing=importlib.util.module_from_spec(spec);spec.loader.exec_module(routing)
    from backend.app.native.web_admin import create_admin_app
    from backend.app.native.web_public import create_public_app
    result=[]
    def blocked(request):raise RuntimeError('Route inventory requested runtime resources')
    for role,builder in [('public',create_public_app),('admin',create_admin_app)]:
        for route in builder(blocked).routes:
            path=getattr(route,'path',None)
            if path is None:continue
            target=routing.owner(path)
            if not path.startswith('/health') and target not in (role,'sync','transfer'):
                raise ValueError('Unowned '+role+' route: '+path)
            result.append({'path':path,'methods':sorted(getattr(route,'methods',[]) or []),'owner':target})
    result.append({'path':'/setup','methods':['GET','POST'],'owner':'admin'})
    return result

if __name__=='__main__':
    import argparse,os,sys
    parser=argparse.ArgumentParser();parser.add_argument('--stage',type=Path,required=True)
    args=parser.parse_args();root=Path(__file__).resolve().parents[2]
    sys.path.insert(0,str(root))
    config=json.loads((args.stage/'wrangler.jsonc').read_text())
    extend(root,args.stage,config,os.environ)
    print(json.dumps({'site_roles':['public','admin'],'admin':admin_name(config['name']),'publication':'not_run'}))
