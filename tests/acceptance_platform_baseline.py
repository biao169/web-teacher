"""Supplement acceptance_media_sync.py with Linux topology and HTTP cost baselines.
Offline only: disposable data; host systemd/account/Git commands are simulated.
DOM stages require existing jsdom via NODE_PATH/JSDOM_PATH. No dependency install.
"""
import argparse,json,os,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PLATFORM_TESTS=['test_app_boundaries_step3.py','test_home_lazy_step2.py','test_public_stream_v46.py','test_public_home_v54.py','test_dashboard_step1.py','test_platform_baseline_step0.py','test_linux_manager_v76.py','test_linux_process_v77.py',
 'test_public_home_step2.py','test_public_auth_v65.py','test_media_regression.py',
 'test_transfer_integration_v66.py','test_domain_deploy_v157.py','test_deploy_multi_v146.py']

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
    env=os.environ.copy();env['PYTHONPATH']=os.pathsep.join([str(ROOT),str(ROOT/'tests'),env.get('PYTHONPATH','')])
    env['SYNC_UI_FIXTURE']=str(out/'sync-ui.json')
    stages=[('platform',[sys.executable,'-B','-m','pytest',*['tests/'+x for x in PLATFORM_TESTS],'-q']),
      ('capture',[sys.executable,'-B','tests/capture_platform_baseline.py','--output',str(out/'baseline.json')]),
      ('render-sync',[sys.executable,'-B','tests/render_sync_pages_v046.py',env['SYNC_UI_FIXTURE']]),
      ('dom',['node','--test','tests/dashboard-step1.test.cjs','tests/public-stream-dom.test.cjs','site_sync/tests/pages_v046.test.cjs'])]
    report={'source_version':json.loads((ROOT/'release-manifest.json').read_text())['version'],'step':0,'scope':'offline-only','stages':[]}
    for name,cmd in stages:
        start=time.monotonic()
        with (out/(name+'.log')).open('w') as log:
            try:code=subprocess.run(cmd,cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180).returncode
            except (OSError,subprocess.TimeoutExpired) as exc:log.write(type(exc).__name__+'\n');code=1
        result={'name':name,'status':'passed' if code==0 else 'failed','exit_code':code,'seconds':round(time.monotonic()-start,2)}
        report['stages'].append(result);print(json.dumps(result),flush=True)
        if code:break
    report['status']='passed' if len(report['stages'])==len(stages) and all(x['exit_code']==0 for x in report['stages']) else 'failed'
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    return 0 if report['status']=='passed' else 1
if __name__=='__main__':raise SystemExit(main())
