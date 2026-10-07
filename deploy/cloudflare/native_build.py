"""Native companion validation without website staging or Python dependencies."""
import json,os,shutil
from pathlib import Path
from site_sync.integration.package import write_native
from companions import inspect_artifact


def execute(config,runner,log,report_path=None):
    from pipeline import ROOT,HERE,workspace
    from deploy.shared.worker_package import COMPATIBILITY_DATE
    node=shutil.which('node');npm=shutil.which('npm.cmd' if os.name=='nt' else 'npm')
    if not node or not npm:raise ValueError('Node.js 22+ and npm required')
    with workspace() as work:
        stage=work/'worker';stage.mkdir()
        base={'name':config['name'],'compatibility_date':COMPATIBILITY_DATE,
              'vars':{'TEACHER_MEDIA_BINDING':'MEDIA','TEACHER_MEDIA_PREFIX':'media/'},
              'd1_databases':[{'binding':'DB','database_id':config['database'],'database_name':config['dbname']}],
              'r2_buckets':[{'binding':'MEDIA','bucket_name':config['bucket']}]}
        cfg=write_native(ROOT,stage,base)
        for file in ('package.json','package-lock.json'):shutil.copy2(HERE/file,stage/file)
        # No application/auxiliary credentials are needed by offline compilation.
        env={k:v for k,v in os.environ.items() if not k.startswith(('TEACHER_','CLOUDFLARE_','CF_'))}
        env['WRANGLER_SEND_METRICS']='false'
        runner('NATIVE-TOOLS',[npm,'ci','--no-audit','--no-fund'],stage,env)
        output=work/'native.multipart'
        runner('SYNC-NATIVE-BUNDLE',[node,str(stage/'node_modules/wrangler/bin/wrangler.js'),'deploy',
               '--config',str(stage/'sync-native/wrangler.jsonc'),'--dry-run','--outfile',str(output)],stage,env)
        report={'mode':config['sync_executor'],'native_only':True,'python_dependencies':'not_installed',
                'website_staging':'not_run','publication':'not_run',
                'artifacts':[inspect_artifact(output,cfg,config['name'],'native')]}
        if report_path:
            path=Path(report_path);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(report,indent=2))
        log('NATIVE-VERIFIED','原生辅助轻量构建通过；未发布 / Native-only build verified',**report)
        return report
