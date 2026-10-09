"""Offline deployment staging; never installs dependencies, publishes or connects to hosts."""
import io,json,shutil,subprocess,sys,tempfile
from contextlib import redirect_stdout
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT),str(ROOT/'deploy/cloudflare')]
from deploy.shared.worker_package import prepare
from deploy.vps.release import render
from domains import settings,apply
from integration_package import extend
from pipeline import verify_stage

def main(separate=False):
    with tempfile.TemporaryDirectory(prefix='teacher-offline-acceptance-') as temp:
        work=Path(temp);stage=work/'worker'
        domains=settings({'TEACHER_ORIGIN':'https://primary.university.edu','TEACHER_CUSTOM_DOMAINS':'primary.university.edu,alias.university.edu'},'teacher-offline-test')
        with redirect_stdout(io.StringIO()):prepare(False,['--output',str(stage),'--database-id','00000000-0000-0000-0000-000000000001','--origin',domains['origin'],'--allowed-origins',','.join(domains['allowed_origins']),'--bucket','offline-test-media'],migration_plan=False)
        (stage/'wrangler.json').rename(stage/'wrangler.jsonc');(stage/'src').mkdir()
        for name in ('main.py','backend','site_sync','generated_native_resources.py','generated_resources.py'):shutil.move(str(stage/name),str(stage/'src'/name))
        shutil.copytree(ROOT/'deploy/cloudflare/runtime',stage/'src/worker_runtime',ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
        (stage/'src/main.py').write_text('from worker_runtime.entrypoint import Default, TransferCoordinator\n')
        cfg=json.loads((stage/'wrangler.jsonc').read_text());cfg['main']='src/main.py'
        if separate:cfg['vars']['TEACHER_SYNC_EXECUTOR_MODE']='separate'
        import tomllib
        cfg['vars']['TEACHER_RELEASE']=tomllib.loads((ROOT/'pyproject.toml').read_text())['project']['version']
        apply(cfg,domains);extend(ROOT,stage,cfg)
        (stage/'wrangler.jsonc').write_text(json.dumps(cfg))
        verify_stage(stage)
        site_package=subprocess.run([sys.executable,'-B',str(ROOT/'deploy/cloudflare/site_workers.py'),'--stage',str(stage)],cwd=stage,text=True,capture_output=True)
        if site_package.returncode:raise RuntimeError(site_package.stdout+site_package.stderr)
        cfg=json.loads((stage/'wrangler.jsonc').read_text())
        print(site_package.stdout)
        admin_check=subprocess.run([sys.executable,'-B',str(ROOT/'deploy/cloudflare/startup_check.py'),'--runtime',str(stage/'src/worker_runtime'),'--source',str(stage/'src'),'--admin-only'],cwd=stage,text=True,capture_output=True)
        if admin_check.returncode:raise RuntimeError(admin_check.stdout+admin_check.stderr)
        print(admin_check.stdout)
        for role in ('public','admin','full'):
            boundary=subprocess.run([sys.executable,'-B',str(ROOT/'tests/check_app_boundaries_step3.py'),'--source',str(stage/'src'),'--role',role],cwd=stage,text=True,capture_output=True)
            if boundary.returncode:raise RuntimeError(boundary.stdout+boundary.stderr)
            result=json.loads(boundary.stdout)
            print(json.dumps({'staged_app_boundary':role,'route_count':len(result['routes']),'project_module_count':len(result['project_modules'])}))
        check=subprocess.run([sys.executable,'-B',str(ROOT/'deploy/cloudflare/startup_check.py'),'--runtime',str(stage/'src/worker_runtime'),'--source',str(stage/'src')],cwd=stage,text=True,capture_output=True)
        if check.returncode:raise RuntimeError(check.stdout+check.stderr)
        isolated=subprocess.run([sys.executable,'-B',str(ROOT/'deploy/cloudflare/startup_check.py'),'--runtime',str(stage/'src/worker_runtime'),'--source',str(stage/'src'),'--executor-only'],cwd=stage,text=True,capture_output=True)
        if isolated.returncode:raise RuntimeError(isolated.stdout+isolated.stderr)
        deferred=subprocess.run([sys.executable,'-B',str(ROOT/'deploy/cloudflare/startup_check.py'),'--runtime',str(stage/'src/worker_runtime'),'--source',str(stage/'src'),'--executor-dependencies'],cwd=stage,text=True,capture_output=True)
        if deferred.returncode:raise RuntimeError(deferred.stdout+deferred.stderr)
        assert 'generated_native_resources' in deferred.stdout
        print(isolated.stdout+deferred.stdout)
        import ast
        for filename in ('generated_native_resources.py','generated_public_templates.py','generated_admin_templates.py','generated_transfer_templates.py'):
            tree=ast.parse((stage/'src'/filename).read_text())
            print(json.dumps({'generated_file':filename,'bytes':(stage/'src'/filename).stat().st_size,'values':{n.targets[0].id:len(repr(ast.literal_eval(n.value)).encode()) for n in tree.body if isinstance(n,ast.Assign)}}))
        # Both deploy targets must use the canonical sync page and assets.
        resources_tree=ast.parse((stage/'src/generated_admin_templates.py').read_text())
        templates=next(ast.literal_eval(n.value) for n in resources_tree.body if isinstance(n,ast.Assign) and n.targets[0].id=='TEMPLATES')
        from backend.app.web.rendering import Renderer
        local=Renderer.local(ROOT)
        for source in (ROOT/'site_sync/frontend/templates').glob('*.html'):
            name='sync/'+source.name
            assert templates[name]==local.env.loader.get_source(local.env,name)[0]==source.read_text(),name
        for source in (ROOT/'site_sync/frontend/static').iterdir():
            if source.is_file():assert (stage/'assets/assets/site-sync'/source.name).read_bytes()==source.read_bytes(),source.name
        for file in ('backend/app/native/request_cache.py','backend/maintenance/log_retention.py','site_sync/integration/web.py'):
            assert (stage/'src'/file).is_file(),file
        assert (stage/'assets/assets/public/js/public-stream.js').read_bytes()==(ROOT/'frontend/public/static/js/public-stream.js').read_bytes()
        public_tree=ast.parse((stage/'src/generated_public_templates.py').read_text())
        public_templates=next(ast.literal_eval(n.value) for n in public_tree.body if isinstance(n,ast.Assign) and n.targets[0].id=='TEMPLATES')
        assert public_templates['public/home-section.html']==(ROOT/'frontend/public/templates/home-section.html').read_text()
        dashboard=ROOT/'frontend/admin/static/js/native-dashboard.js'
        assert (stage/'assets/assets/admin/js/native-dashboard.js').read_bytes()==dashboard.read_bytes()
        assert 'data-dashboard-count=' in templates['admin/native-dashboard.html']
        for file in ('favicon.svg','site-logo.png','apple-touch-icon.png'):
            assert (stage/'assets/assets/shared'/file).read_bytes()==(ROOT/'frontend/shared/static'/file).read_bytes()
        render(work/'vps','/opt/teacher-offline-test','primary.university.edu',None,'/opt/teacher-offline-test/venv/bin/python',allowed_origins='https://alias.university.edu')
        assert 'alias.university.edu' in (work/'vps/Caddyfile.fragment').read_text()
        assert 'TEACHER_ALLOWED_ORIGINS=' in (work/'vps/teacher-site.env').read_text()
        report={'worker_source_staging':'passed','worker_snapshot_imports':'passed','executor_staged_cold_imports':'passed','executor_staged_deferred_imports':'passed','vps_config_generation':'passed','assets_and_feature_modules':'passed','worker_custom_domain_count':len(cfg['routes']),'cron':cfg['triggers']['crons'],'wrangler_sdk_bundle':'not_run','production_d1_r2':'not_run','real_server_deployment':'not_run'}
        print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main('--separate-sync' in sys.argv)
