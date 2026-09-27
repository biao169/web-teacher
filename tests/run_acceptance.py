"""Portable acceptance entry point; never installs packages or touches production data."""
import argparse
import json
import os
import platform
from pathlib import Path
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dom',action='store_true',help='Also run the optional Node/jsdom suite')
    parser.add_argument('--report',type=Path,help='Write a JSON acceptance summary to this explicit path')
    args=parser.parse_args()
    steps=[('python',[sys.executable,'-B','-m','pytest','-q','tests'])]
    if args.dom:
        node=shutil.which('node')
        if not node:parser.error('--dom requires Node and tests/package.json dependencies')
        steps.append(('simulated_dom',[node,'tests/run_dom_tests.cjs']))
    results={}
    for name,command in steps:
        result=subprocess.run(command,cwd=ROOT,env=os.environ|{'TEST_PYTHON':sys.executable,'PYTHONDONTWRITEBYTECODE':'1'})
        results[name]='passed' if result.returncode==0 else 'failed'
    if not args.dom:results['simulated_dom']='not_run'
    results['windows_browser']='manual_acceptance_required'
    print(json.dumps(results,ensure_ascii=False,indent=2))
    if args.report:
        report={'platform':platform.platform(),'python_version':platform.python_version(),'results':results,'real_browser':'not_run','real_systemd_deployment':'not_run','public_https':'not_run'}
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return int('failed' in results.values())

if __name__=='__main__':raise SystemExit(main())
