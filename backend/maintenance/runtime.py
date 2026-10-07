"""Bounded local maintenance. Preview and apply use the same eligibility checks."""
import asyncio,json,logging,re,time,secrets
from backend.app.native.catalog import now
from backend.app.native.storage import LocalStore
from backend.app.native.media_inventory_store import LocalInventory
from backend.app.native.locking import RuntimeLock

LIMIT=200
REPORT=re.compile(r'media-audit/([a-f0-9]{32})/(state\.json|page-\d+\.json|plan-[a-f0-9]{64}\.json)')
TEMP=re.compile(r'(?:metadata/v2/[a-f0-9]{2}\.json|media-audit/(?:latest-[a-f0-9]{64}\.json|[a-f0-9]{32}/(?:state\.json|page-\d+\.json|plan-[a-f0-9]{64}\.json)))\.[a-f0-9]{16}\.tmp')

class Maintenance:
    def __init__(self,sql,settings):
        self.sql=sql;self.settings=settings;self.store=LocalStore(settings.cache_dir)
        self.inventory=LocalInventory(self.store)
        self.meta=LocalStore(settings.data_dir/'maintenance')
        self.stopped=asyncio.Event();self.next_run=0
        from .policy import DEFAULTS
        self.policy=dict(DEFAULTS)

    async def load(self,key):
        data=await self.meta.get(key,max_bytes=65536)
        return json.loads(data) if data else {}

    async def save(self,key,data):
        await self.meta.put(key,json.dumps(data,ensure_ascii=False).encode())

    async def report_state(self,report):
        key=f'media-audit/{report}/state.json'
        if not await self.inventory.head(key):return None
        raw=await self.inventory.read(key,1048576)
        state=json.loads(raw)
        if state.get('id')!=report or not re.fullmatch('[a-f0-9]{64}',state.get('owner','')):return None
        expiry=state.get('expires','')
        if not isinstance(expiry,str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z',expiry):return None
        return state if expiry<now(seconds=-self.policy['report_grace_hours']*3600) else None

    async def file(self,row,apply):
        key=row['key']
        if row.get('error'):return 'skipped'
        if TEMP.fullmatch(key):
            path=self.inventory.path(key)
            if time.time()-path.stat().st_mtime<self.policy['temporary_hours']*3600:return 'skipped'
            # Cache writes are synchronous atomic replacements, never long-lived uploads.
            if apply:await self.inventory.delete(key,row['version'])
            return 'temporary_files'
        match=REPORT.fullmatch(key)
        if not match:return 'skipped'
        report,name=match.groups();state=await self.report_state(report)
        if not state:return 'skipped'
        lock='media:scan:'+report
        if await self.sql.query('SELECT 1 FROM admin_mutation_guards WHERE uid=? AND created_at>=?',(lock,now(seconds=-300))):return 'skipped'
        if not apply:return 'report_files'
        owner=secrets.token_hex(16);at=now()
        await self.sql.batch([('DELETE FROM admin_mutation_guards WHERE uid=? AND created_at<?',(lock,now(seconds=-300))),('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES (?,?,?,?,?)',(lock,'media_assets',owner,at,at))])
        try:
            if not await self.report_state(report):return 'skipped'
            if name=='state.json':
                # Keep state until all report pages are gone, so a partial failure is retryable.
                folder=self.inventory.path('media-audit/'+report)
                import os
                with os.scandir(folder) as entries:
                    if any(item.name!='state.json' for item in entries):return 'skipped'
                latest='media-audit/latest-'+state['owner']+'.json'
                info=await self.inventory.head(latest)
                if info:
                    data=json.loads(await self.inventory.read(latest,4096))
                    if data.get('id')==report:await self.inventory.delete(latest,info['version'])
                await self.inventory.delete(key,row['version'])
                folder.rmdir()
            else:await self.inventory.delete(key,row['version'])
            return 'report_files'
        finally:await self.sql.batch([('DELETE FROM admin_mutation_guards WHERE uid=? AND target_uid=?',(lock,owner))])

    async def tick(self,apply=False,batches=1):
        if not 1<=batches<=100:raise ValueError('batches must be 1..100')
        from .policy import load
        self.policy=(await load(self.sql))['values']
        result={'mode':'apply' if apply else 'preview','at':now(),'counts':{},'errors':[],'scanned_files':0,'retained_tasks':0,'more':False}
        # Cross-process lock also serializes CLI and scheduled work. No database service lock.
        with RuntimeLock(self.settings.data_dir/'maintenance'/'operation'):
            cursor=(await self.load('cursor.json')).get('cursor')
            for _ in range(batches):
                cutoff=now(seconds=-self.policy['session_days']*86400);at=now()
                rules=[('auth_sessions','uid','updated_at<? AND (expires_at<? OR idle_expires_at<? OR revoked_at<?)',(cutoff,cutoff,cutoff,cutoff)),
                       ('auth_login_throttles','key_hash','expires_at<=? AND (blocked_until IS NULL OR blocked_until<=?)',(at,at)),
                       ('public_action_throttles','key_hash','expires_at<=? AND (blocked_until IS NULL OR blocked_until<=?)',(at,at))]
                for table,pk,condition,args in rules:
                    try:
                        selection=f'SELECT {pk} FROM {table} WHERE {condition} LIMIT {LIMIT}'
                        if apply:
                            rows=(await self.sql.batch([(f'DELETE FROM {table} WHERE {pk} IN ({selection}) AND ({condition}) RETURNING {pk}',args+args)]))[0]
                        else:rows=await self.sql.query(selection,args)
                        result['counts'][table]=result['counts'].get(table,0)+len(rows)
                        result['more']|=len(rows)==LIMIT
                    except Exception as exc:result['errors'].append({'category':table,'reason':type(exc).__name__})
                from backend.maintenance.history import History,HistoryPolicy
                try:
                    after=(await self.load('history-cursor.json')).get('after','')
                    history=await History(self.sql,self.settings,HistoryPolicy(self.policy['operation_days'],self.policy['transfer_days'])).tick(apply,after)
                    result['retention']=history['retention']
                    for category,count in history['counts'].items():result['counts'][category]=result['counts'].get(category,0)+count
                    result['errors'].extend(history['errors']);result['more']|=history['more']
                    result['retained_tasks']+=history['retained_tasks']
                    if apply:await self.save('history-cursor.json',{'after':history['cursor']})
                except Exception as exc:result['errors'].append({'category':'history','reason':type(exc).__name__})
                page=await self.inventory.list_page(cursor,20,'')
                result['scanned_files']+=page['visited'];cursor=page['cursor']
                for row in page['objects']:
                    try:
                        category=await self.file(row,apply)
                        if category!='skipped':result['counts'][category]=result['counts'].get(category,0)+1
                    except FileNotFoundError:pass
                    except Exception as exc:result['errors'].append({'category':'cache_file','reason':type(exc).__name__})
                result['more']|=page['truncated']
                if not apply:break # Preview describes one bounded batch, never double-counts DB rows.
                await self.save('cursor.json',{'cursor':cursor})
                await asyncio.sleep(0)
                if not result['more']:break
            result['errors']=result['errors'][:20]
            if apply:await self.save('status.json',result)
        return result

    async def run(self):
        from .policy import load
        while not self.stopped.is_set():
            delay=30
            try:
                config=(await load(self.sql))['values']
                for handler in logging.getLogger().handlers:
                    if hasattr(handler,'apply_policy'):handler.apply_policy(config)
                if config['enabled'] and time.monotonic()>=self.next_run:
                    result=await self.tick(True)
                    delay=60 if result['errors'] else 1 if result['more'] else config['interval_minutes']*60
                    self.next_run=time.monotonic()+delay
                    if result['errors']:logging.getLogger('maintenance').warning('Cleanup had retryable failures: %s',result['errors'])
                delay=min(30,max(1,self.next_run-time.monotonic())) if config['enabled'] else 30
            except Exception as exc:
                logging.getLogger('maintenance').warning('Maintenance batch failed: %s',type(exc).__name__);delay=60
            try:await asyncio.wait_for(self.stopped.wait(),delay)
            except TimeoutError:pass
