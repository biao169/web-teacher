"""Read-only platform configuration checks; no upload, SQL or Cron mutation."""
import json
from pathlib import Path
from companion_release import Client,owned,APIError
from deploy_config import validate


def check(env,config,log,report_path=None,*,client=None):
    targets=validate(env,config['name'],credentials=False)
    api=client or Client(env.get('CLOUDFLARE_ACCOUNT_ID',''),env.get('TEACHER_AUX_API_TOKEN',''))
    result={'mode':config['sync_executor'],'read_only':True,'runtime_execution':'not_checked','workers':[]}
    for role,worker in [('main',config['name']),*targets.items()]:
        row={'role':role,'worker':worker,'problems':[]}
        try:
            settings=api.request('GET',worker,'/settings',missing=True)
            if settings is None:
                if role=='executor' and config['sync_executor']=='inline':row['status']='not_required'
                else:row['problems'].append('worker_missing')
            else:
                if role!='main':owned(settings,config['name'],role)
                bindings={b.get('name'):b for b in settings.get('bindings',[])}
                if bindings.get('DB',{}).get('id')!=config['database']:row['problems'].append('database_binding_mismatch')
                if bindings.get('MEDIA',{}).get('bucket_name')!=config['bucket']:row['problems'].append('media_binding_mismatch')
                if bindings.get('TEACHER_SYNC_KEY',{}).get('type')!='secret_text':row['problems'].append('sync_secret_missing')
                if role in ('main','executor') and bindings.get('SYNC_NATIVE',{}).get('service')!=targets['native']:
                    row['problems'].append('native_service_binding_mismatch')
                if role=='main':
                    if bindings.get('TEACHER_SYNC_EXECUTOR_MODE',{}).get('text')!=config['sync_executor']:row['problems'].append('main_mode_mismatch')
                    if bindings.get('TRANSFER_COORDINATOR',{}).get('class_name')!='TransferCoordinator':row['problems'].append('transfer_coordinator_missing')
                else:
                    visibility=api.request('GET',worker,'/subdomain')
                    if visibility.get('enabled') is not False or visibility.get('previews_enabled') is not False:row['problems'].append('public_entry_enabled')
                schedules=api.request('GET',worker,'/schedules')
                actual=sorted(x.get('cron') for x in schedules.get('schedules',[]))
                expected=['* * * * *'] if role=='main' or (role=='executor' and config['sync_executor']=='separate') else []
                if actual!=expected:row['problems'].append('cron_mismatch')
        except APIError as exc:
            row['problems'].append('api_error');row['http_status']=exc.status;row['codes']=list(exc.codes)
        except ValueError:row['problems'].append('ownership_mismatch')
        row.setdefault('status','failed' if row['problems'] else 'passed')
        result['workers'].append(row)
        log('CLOUD-CHECK-ITEM','平台只读检查 / Read-only platform check',**row)
    result['passed']=all(not x['problems'] for x in result['workers'])
    if report_path:
        path=Path(report_path);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(result,ensure_ascii=False,indent=2))
    log('CLOUD-CHECK','平台配置检查结束；不代表业务验收 / Configuration check finished; runtime acceptance still required',passed=result['passed'])
    return result
