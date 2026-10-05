"""Add untouched transfer source/templates to disposable Workers output only."""
import json
import shutil
from pathlib import Path


def extend(root, stage, config):
    from resource_module import generate
    generate(root, stage)
    shutil.copytree(root/'transfer/backend', stage/'src/transfer/backend', ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    source = root/'transfer/frontend/native'
    shutil.copytree(source, stage/'assets/transfer-static', ignore=shutil.ignore_patterns('*.html'))
    templates = {p.name:p.read_text(encoding='utf-8') for p in source.glob('*.html')}
    defaults = json.loads((root/'database/native/transfer-defaults.json').read_text(encoding='utf-8'))
    catalog = (source/'transfer-i18n-catalog.js').read_text(encoding='utf-8')
    with (stage/'src/generated_resources.py').open('a',encoding='utf-8') as f:
        f.write('\nTRANSFER_TEMPLATES = '+repr(templates)+'\nTRANSFER_DEFAULTS = '+repr(defaults)+'\nTRANSFER_CATALOG = '+repr(catalog)+'\n')
    # Only the platform-specific storage status view differs from the local UI.
    shutil.copyfile(Path(__file__).parent/'runtime/storage-status.js', stage/'assets/transfer-static/storage-status.js')
    config['assets']['run_worker_first'] = ['/setup','/transfer','/transfer/*','/admin/*','/api/*']
    config['durable_objects'] = {'bindings':[{'name':'TRANSFER_COORDINATOR','class_name':'TransferCoordinator'}]}
    config['migrations'] = [{'tag':'teacher-transfer-v1','new_sqlite_classes':['TransferCoordinator']}]
    config.setdefault('vars',{}).update(TEACHER_RECOVERY_CRON='internal',TEACHER_CRON_INTERVAL_SECONDS='300')
    config['triggers'] = {'crons':['*/5 * * * *']}
    for source in (root/'transfer/backend').rglob('*.py'):
        if source.read_bytes() != (stage/'src'/source.relative_to(root)).read_bytes():
            raise ValueError('Transfer source changed during packaging')


def verify(root, stage, config):
    """Gate missing exports/bindings/assets before a real deployment can start."""
    from resource_module import verify as verify_resources
    verify_resources(root, stage)
    if 'global_fetch_strictly_public' not in config.get('compatibility_flags',[]):
        raise ValueError('Missing public Worker-to-Worker fetch routing flag')
    expected = {'bindings':[{'name':'TRANSFER_COORDINATOR','class_name':'TransferCoordinator'}]}
    if config.get('durable_objects') != expected:
        raise ValueError('Missing or changed transfer coordinator binding')
    if config.get('migrations') != [{'tag':'teacher-transfer-v1','new_sqlite_classes':['TransferCoordinator']}]:
        raise ValueError('Transfer coordinator registration changed')
    if config.get('vars',{}).get('TEACHER_RECOVERY_CRON')!='internal' or config.get('vars',{}).get('TEACHER_CRON_INTERVAL_SECONDS')!='300':
        raise ValueError('Missing free-plan recovery configuration')
    if config.get('triggers') != {'crons':['*/5 * * * *']}:
        raise ValueError('Missing single five-minute recovery schedule')
    if not {'/setup','/transfer','/transfer/*','/admin/*','/api/*'}.issubset(config.get('assets',{}).get('run_worker_first',[])):
        raise ValueError('Private/application routes must reach Worker first')
    if (stage/'src/main.py').read_text().strip() != 'from worker_runtime.entrypoint import Default, TransferCoordinator':
        raise ValueError('Missing Python Worker exports')
    for source in (root/'transfer/backend').rglob('*.py'):
        target=stage/'src'/source.relative_to(root)
        if not target.is_file() or target.read_bytes()!=source.read_bytes():
            raise ValueError('Transfer source mismatch: '+str(source.relative_to(root)))
    for source in (root/'transfer/frontend/native').iterdir():
        if source.is_file() and source.suffix!='.html':
            original=Path(__file__).parent/'runtime/storage-status.js' if source.name=='storage-status.js' else source
            target=stage/'assets/transfer-static'/source.name
            if not target.is_file() or target.read_bytes()!=original.read_bytes():
                raise ValueError('Transfer asset mismatch: '+source.name)
    forbidden={'.py','.pyc','.sql','.cmd','.sh','.sqlite','.sqlite3','.lock'}
    for asset in (stage/'assets').rglob('*'):
        if asset.is_file() and (asset.suffix in forbidden or asset.name=='.env'):
            raise ValueError('Private source/data included in static assets')
