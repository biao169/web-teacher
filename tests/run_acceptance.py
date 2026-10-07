"""Portable full acceptance. No package installation or production access."""
import argparse,json,os,platform,shutil,subprocess,sys,tomllib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dom',action='store_true',help='Run Node/jsdom UI regressions (tests/package.json dependencies required)')
    parser.add_argument('--browser',action='store_true',help='Require installed Playwright/Chromium for real website interaction')
    parser.add_argument('--report',type=Path,help='Write results and validation boundaries to this file')
    args=parser.parse_args();node=shutil.which('node')
    if (args.dom or args.browser) and not node:parser.error('DOM/browser checks require Node.js')
    env=dict(os.environ)
    env['NODE_PATH']=os.pathsep.join([str(ROOT/'tests/node_modules'),env.get('NODE_PATH','')])
    env.update(TEST_PYTHON=sys.executable,PYTHON=sys.executable,PYTHONDONTWRITEBYTECODE='1')
    env['PYTHONPATH']=os.pathsep.join([str(ROOT),str(ROOT/'tests'),str(ROOT/'deploy/cloudflare'),str(ROOT/'deploy/cloudflare/tests'),env.get('PYTHONPATH','')])
    steps=[('python',[sys.executable,'-B','-m','pytest','-q','tests','site_sync/tests','site_sync/tests_website','deploy/cloudflare/tests']),
           ('offline_inline',[sys.executable,'-B','tests/stage_release_v016001.py']),
           ('offline_separate_executor',[sys.executable,'-B','tests/stage_release_v016001.py','--separate-sync'])]
    if node:steps.append(('native_stream',[node,'--test',*[str(p.relative_to(ROOT)) for p in sorted((ROOT/'site_sync/worker').glob('*.test.mjs'))],'site_sync/frontend/static/model.test.mjs']))
    if args.dom:
        steps.append(('simulated_dom',[node,'tests/run_dom_tests.cjs']))
        steps.append(('credential_dom_http',[node,'site_sync/tests_website/dom_credentials.cjs']))
    if args.browser:
        steps.append(('real_browser',[node,'site_sync/tests_website/browser_admin.cjs']))
        steps.append(('credential_browser',[node,'site_sync/tests_website/browser_credentials.cjs']))
    results={};checks=[]
    for name,command in steps:
        try:
            result=subprocess.run(command,cwd=ROOT,env=env,text=True,capture_output=True,timeout=1800)
            passed=result.returncode==0;output=result.stdout+result.stderr
        except subprocess.TimeoutExpired:
            passed=False;output='Acceptance step exceeded 1800 seconds; inspect and run this check separately.'
        except OSError as exc:
            passed=False;output=type(exc).__name__+': required executable unavailable'
        results[name]='passed' if passed else 'failed'
        checks.append({'name':name,'status':results[name],'output':output})
        print(name+': '+results[name],flush=True)
        if not passed:print(output[-5000:],flush=True)
    for name,enabled in [('native_stream',bool(node)),('simulated_dom',args.dom),('real_browser',args.browser),('credential_dom_http',args.dom),('credential_browser',args.browser)]:
        if not enabled:results[name]='not_run'
    report={'version':tomllib.loads((ROOT/'pyproject.toml').read_text())['project']['version'],
            'platform':platform.platform(),'python_version':platform.python_version(),'results':results,'checks':checks,
            'real_windows_launch':'not_run','real_systemd_deployment':'not_run','wrangler_sdk_bundle':'not_run',
            'real_cloudflare_d1_r2':'not_run','production_deployed':False}
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(results,ensure_ascii=False,indent=2))
    return int('failed' in results.values())
if __name__=='__main__':raise SystemExit(main())
