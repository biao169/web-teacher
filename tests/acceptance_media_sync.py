"""Offline release gate. Never deploys, installs packages or reads production credentials."""
import argparse
from datetime import datetime,timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True,help='New directory for report and individual stage logs')
    parser.add_argument('--skip-workerd',action='store_true',help='Explicitly mark workerd validation skipped, never passed')
    args=parser.parse_args()
    output=args.output.resolve();output.mkdir(parents=True,exist_ok=False)
    env=os.environ.copy()
    env['PYTHONPATH']=os.pathsep.join([str(ROOT),str(ROOT/'tests'),str(ROOT/'site_sync/tests_website'),str(ROOT/'deploy/cloudflare'),str(ROOT/'deploy/cloudflare/tests'),env.get('PYTHONPATH','')])
    python=[sys.executable,'-B']
    js=sorted(str(p.relative_to(ROOT)) for folder in ('site_sync/worker','site_sync/frontend/static') for p in (ROOT/folder).glob('*.test.mjs'))
    stages=[('python-regression',python+['-m','pytest','site_sync/tests','site_sync/tests_website','deploy/cloudflare/tests','tests/test_upload_diagnostics_v038.py','tests/test_media_stream_v039.py','tests/test_media_recovery_v040.py','-q']),
            ('javascript', ['node','--test',*js]),
            ('workerd-rpc-r2', ['node','--test','site_sync/tests/media_upload_stream.test.mjs','site_sync/tests/worker_binary_rpc.test.mjs','site_sync/tests/clone_verify_d1.test.mjs']),
            ('stage-inline',python+['tests/stage_release_v016001.py']),
            ('stage-separate',python+['tests/stage_release_v016001.py','--separate-sync'])]
    manifest=json.loads((ROOT/'release-manifest.json').read_text())
    report={'version':manifest['version'],'started_at':datetime.now(timezone.utc).isoformat(),'scope':'offline-only','stages':[],
            'not_validated':['production Cloudflare CPU/memory quotas and PoPs','Python Worker SDK bundle and deployed Python/JS FFI','live Cloudflare/Ubuntu deployment','browser visual acceptance']}
    for name,command in stages:
        item={'name':name,'status':'skipped' if args.skip_workerd and name=='workerd-rpc-r2' else 'running','log':name+'.log'}
        report['stages'].append(item)
        (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        if item['status']=='running':
            print(json.dumps({'stage':name,'status':'start'}),flush=True);start=time.monotonic()
            try:
                with (output/item['log']).open('w',encoding='utf-8') as log:
                    result=subprocess.run(command,cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=900)
                item.update(status='passed' if result.returncode==0 else 'failed',exit_code=result.returncode)
            except (OSError,subprocess.TimeoutExpired) as exc:
                item.update(status='failed',error_type=type(exc).__name__)
                with (output/item['log']).open('a',encoding='utf-8') as log:log.write('\nStage could not complete: '+type(exc).__name__+'\n')
            item['duration_seconds']=round(time.monotonic()-start,2)
        print(json.dumps(item),flush=True)
        (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    failed=any(s['status']=='failed' for s in report['stages'])
    report.update(status='failed' if failed else ('partial' if args.skip_workerd else 'passed'),finished_at=datetime.now(timezone.utc).isoformat())
    (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    return 1 if failed else 0

if __name__=='__main__':raise SystemExit(main())
