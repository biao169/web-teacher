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
        for name in ('main.py','backend','site_sync','generated_resources.py'):shutil.move(str(stage/name),str(stage/'src'/name))
        shutil.copytree(ROOT/'deploy/cloudflare/runtime',stage/'src/worker_runtime',ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
        (stage/'src/main.py').write_text('from worker_runtime.entrypoint import Default, TransferCoordinator\n')
        cfg=json.loads((stage/'wrangler.jsonc').read_text());cfg['main']='src/main.py'
        if separate:cfg['vars']['TEACHER_SYNC_EXECUTOR_MODE']='separate'
        apply(cfg,domains);extend(ROOT,stage,cfg)
        (stage/'wrangler.jsonc').write_text(json.dumps(cfg))
        verify_stage(stage)
        check=subprocess.run([sys.executable,'-B',str(ROOT/'deploy/cloudflare/startup_check.py'),'--runtime',str(stage/'src/worker_runtime'),'--source',str(stage/'src')],cwd=stage,text=True,capture_output=True)
        if check.returncode:raise RuntimeError(check.stdout+check.stderr)
        for file in ('backend/app/native/request_cache.py','backend/maintenance/log_retention.py','site_sync/integration/web.py'):
            assert (stage/'src'/file).is_file(),file
        for file in ('favicon.svg','site-logo.png','apple-touch-icon.png'):
            assert (stage/'assets/assets/shared'/file).read_bytes()==(ROOT/'frontend/shared/static'/file).read_bytes()
        render(work/'vps','/opt/teacher-offline-test','primary.university.edu',None,'/opt/teacher-offline-test/venv/bin/python',allowed_origins='https://alias.university.edu')
        assert 'alias.university.edu' in (work/'vps/Caddyfile.fragment').read_text()
        assert 'TEACHER_ALLOWED_ORIGINS=' in (work/'vps/teacher-site.env').read_text()
        report={'worker_source_staging':'passed','worker_snapshot_imports':'passed','vps_config_generation':'passed','assets_and_feature_modules':'passed','worker_custom_domain_count':len(cfg['routes']),'cron':cfg['triggers']['crons'],'wrangler_sdk_bundle':'not_run','production_d1_r2':'not_run','real_server_deployment':'not_run'}
        print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main('--separate-sync' in sys.argv)
