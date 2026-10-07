"""Publish authorized private companion Workers through the Cloudflare API.

No main-site upload, resource creation, or deletion. Secrets exist in memory only.
All API URLs are fixed to api.cloudflare.com and requests reject redirects.
"""
import json
import re
import time
from pathlib import Path
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.error import HTTPError,URLError
from companions import inspect_artifact,names
from deploy_config import validate


class APIError(ValueError):
    def __init__(self,status,codes=()):
        self.status=status;self.codes=tuple(codes)
        super().__init__('辅助发布 API 失败 / Auxiliary API failed: HTTP '+str(status)+'; codes='+','.join(map(str,codes))+
                         ('; 请检查账号范围和 Workers Scripts 编辑权限' if status in (401,403) else ''))


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None


class Client:
    def __init__(self,account,token,*,opener=None,sleep=time.sleep):
        if not re.fullmatch('[a-fA-F0-9]{32}',account) or not token or any(c.isspace() for c in token):
            raise ValueError('Invalid auxiliary API credentials')
        self.base='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'
        self.token=token;self.opener=opener or build_opener(NoRedirect());self.sleep=sleep
    def request(self,method,worker,suffix='',body=None,content_type='application/json',missing=False):
        if not re.fullmatch('[a-z0-9][a-z0-9-]{0,62}',worker) or suffix not in ('','/settings','/subdomain','/schedules'):
            raise ValueError('Invalid auxiliary API target')
        return self._request(self.base+worker+suffix,method,body,content_type,missing,bool(suffix))

    def migration_tag(self,worker):
        if not re.fullmatch('[a-z0-9][a-z0-9-]{0,62}',worker):raise ValueError('Invalid Worker')
        url=self.base.replace('/workers/scripts/','/workers/services/')+worker
        result=self._request(url,'GET',None,'application/json',False,True)
        try:return result['default_environment']['script'].get('migration_tag')
        except (KeyError,TypeError):raise APIError(200,('invalid_migration_metadata',)) from None

    def credential_status(self,database):
        if not re.fullmatch(r'[a-fA-F0-9-]{36}',database):raise ValueError('Invalid D1 database ID')
        from credential_probe import SQL
        base=self.base.split('/workers/scripts/')[0]
        result=self._request(base+'/d1/database/'+database+'/query','POST',{'sql':SQL},'application/json',False,False)
        try:
            state=result[0]['results'][0]['state']
            if result[0].get('success') is False or state not in ('valid','invalid','missing'):raise ValueError()
            return state
        except (KeyError,TypeError,IndexError,ValueError):raise APIError(200,('invalid_credential_status',)) from None

    def _request(self,url,method,body,content_type,missing,object_result):
        payload=body if isinstance(body,bytes) else None if body is None else json.dumps(body).encode()
        for attempt in range(3):
            req=Request(url,data=payload,method=method,
                        headers={'Authorization':'Bearer '+self.token,'Content-Type':content_type})
            status=0;raw=b''
            try:
                with self.opener.open(req,timeout=120) as response:
                    status=response.status;raw=response.read(2*1024*1024+1)
            except HTTPError as exc:
                status=exc.code;raw=exc.read(2*1024*1024+1);exc.close()
            except (URLError,TimeoutError,OSError):
                if attempt<2:self.sleep(2**attempt);continue
                raise APIError(0) from None
            if len(raw)>2*1024*1024:raise APIError(status,('response_too_large',))
            try:data=json.loads(raw)
            except (ValueError,UnicodeError):data={}
            if not isinstance(data,dict):data={}
            errors=data.get('errors',[])
            codes=[e.get('code') for e in errors if isinstance(e,dict) and isinstance(e.get('code'),int)] if isinstance(errors,list) else []
            if 200<=status<300 and data.get('success') is True:
                result=data.get('result')
                if object_result and not isinstance(result,dict):raise APIError(status,('invalid_result',))
                return result
            if missing and status==404 and 10007 in codes:return None
            if (status==429 or status>=500) and attempt<2:self.sleep(2**attempt);continue
            # Do not include response messages: APIs may echo secrets or payloads.
            raise APIError(status,codes) from None


def owned(settings,main,role):
    bindings=settings.get('bindings',[]) if isinstance(settings,dict) else []
    values={b.get('name'):b.get('text') for b in bindings if b.get('type')=='plain_text'}
    if values.get('TEACHER_AUX_OWNER')!=main or values.get('TEACHER_AUX_ROLE')!=role:
        raise ValueError('辅助 Worker 同名冲突，拒绝覆盖 / Companion ownership mismatch: '+names(main)[role])


def private(client,worker):
    client.request('POST',worker,'/subdomain',{'enabled':False,'previews_enabled':False})
    value=client.request('GET',worker,'/subdomain')
    if not isinstance(value,dict) or value.get('enabled') is not False or value.get('previews_enabled') is not False:
        raise ValueError('辅助 Worker 私有访问配置尚未确认 / Private access not confirmed: '+worker)


def schedule(client,worker,crons):
    client.request('PUT',worker,'/schedules',[{'cron':v} for v in crons])
    value=client.request('GET',worker,'/schedules')
    if not isinstance(value,dict) or sorted(x.get('cron') for x in value.get('schedules',[]))!=sorted(crons):
        raise ValueError('Cron configuration not confirmed: '+worker)


def revision(info,key):
    import hashlib
    return hashlib.sha256((info['content_sha256']+':'+key).encode()).hexdigest()


def check_bindings(settings,cfg,require_key=False):
    remote={b.get('name'):b for b in settings.get('bindings',[])}
    if require_key and remote.get('TEACHER_SYNC_KEY',{}).get('type')!='secret_text':raise ValueError('Companion sync secret missing')
    for b in cfg.get('d1_databases',[]):
        if remote.get(b['binding'],{}).get('id')!=b['database_id']:raise ValueError('Companion D1 ID mismatch')
    for b in cfg.get('r2_buckets',[]):
        if remote.get(b['binding'],{}).get('bucket_name')!=b['bucket_name']:raise ValueError('Companion R2 bucket mismatch')
    for b in cfg.get('durable_objects',{}).get('bindings',[]):
        if remote.get(b['name'],{}).get('class_name')!=b['class_name']:raise ValueError('Companion coordinator mismatch')
    for b in cfg.get('services',[]):
        if remote.get(b['binding'],{}).get('service')!=b['service']:raise ValueError('Companion service mismatch')
    for key,value in cfg.get('vars',{}).items():
        if remote.get(key,{}).get('text')!=str(value):raise ValueError('Companion variable mismatch: '+key)
    return remote


def payload_with_secret(path,info,main,role,key,migration_tag=None,runner=None):
    """Change metadata only, preserving the original binary module parts."""
    raw=Path(path).read_bytes()
    import hashlib
    if hashlib.sha256(raw).hexdigest()!=info['sha256']:raise ValueError('Artifact changed after validation')
    boundary=info['content_type'].split('boundary=',1)[1].encode()
    pattern=rb'(--'+re.escape(boundary)+rb'\r\n(?:(?!\r\n\r\n).)*name="metadata"(?:(?!\r\n\r\n).)*\r\n\r\n)(.*?)(?=\r\n--'+re.escape(boundary)+rb')'
    matches=list(re.finditer(pattern,raw,re.S))
    if len(matches)!=1:raise ValueError('Cannot locate unique upload metadata')
    match=matches[0];metadata=json.loads(match.group(2))
    if role=='native' and not migration_tag:metadata['migrations']={'new_tag':'teacher-sync-alarm-v1','steps':[{'new_sqlite_classes':['SyncCoordinator']}]}
    if role=='native' and migration_tag:
        if migration_tag!='teacher-sync-alarm-v1':raise ValueError('Unknown native migration tag')
        metadata.pop('migrations',None)
    binding_names={b['name'] for b in metadata.get('bindings',[])}
    if binding_names & {'TEACHER_AUX_OWNER','TEACHER_AUX_ROLE','TEACHER_AUX_REVISION','TEACHER_SYNC_KEY'}:
        raise ValueError('Reserved companion binding in artifact')
    metadata.setdefault('bindings',[]).extend([
        {'name':'TEACHER_AUX_OWNER','type':'plain_text','text':main},
        {'name':'TEACHER_AUX_ROLE','type':'plain_text','text':role},
        {'name':'TEACHER_AUX_REVISION','type':'plain_text','text':revision(info,key)}])
    if runner:metadata['bindings'].append({'name':'SYNC_RUNNER','type':'service','service':runner})
    if key:metadata['bindings'].append({'name':'TEACHER_SYNC_KEY','type':'secret_text','text':key})
    else:metadata['keep_bindings']=['secret_text','secret_key']
    # No key means preserve existing secrets; new sites configure the key in admin.
    return raw[:match.start(2)]+json.dumps(metadata,separators=(',',':')).encode()+raw[match.end(2):]


class Release:
    def __init__(self,env,config,log,*,client=None):
        self.main=config['name'];self.mode=config['sync_executor'];self.targets=validate(env,self.main)
        self.key=env.get('TEACHER_SYNC_KEY','');self.log=log
        self.client=client or Client(env['CLOUDFLARE_ACCOUNT_ID'],env['TEACHER_AUX_API_TOKEN'])
        self.existing={};self.remote={};self.migration_tags={}
    def preflight(self):
        # Inspect both names before any database or Worker mutation, including an
        # old executor which must be stopped when returning to inline mode.
        for role,worker in self.targets.items():
            self.log('AUX-CHECK','检查辅助 Worker / Inspect companion',worker=worker,role=role)
            value=self.client.request('GET',worker,'/settings',missing=True)
            if value is not None:owned(value,self.main,role)
            self.existing[role]=value is not None
            self.remote[role]=value
            if role=='native':self.migration_tags[role]=self.client.migration_tag(worker) if value is not None else None
        self.log('AUX-PREFLIGHT','辅助名称/现有归属检查通过；写入权限在发布时确认 / Targets checked; write permission checked on upload')
    def prepare(self,stage,work):
        stage=Path(stage);work=Path(work)
        roles=['native']+(['executor'] if self.mode=='separate' else [])
        artifacts={}
        for role in roles:
            cfgpath=stage/'sync-native/wrangler.jsonc' if role=='native' else stage/'wrangler.sync-executor.jsonc'
            cfg=json.loads(cfgpath.read_text());path=work/(role+'.multipart')
            info=inspect_artifact(path,cfg,self.main,role)
            artifacts[role]=(info,payload_with_secret(path,info,self.main,role,self.key,self.migration_tags.get(role)),cfg)
        self.native_artifact=(work/'native.multipart',artifacts['native'][0])
        # Recheck ownership immediately before changes. Do not touch unowned names.
        self.preflight()
        if self.existing.get('executor'):schedule(self.client,self.targets['executor'],[])
        for role in roles:
            worker=self.targets[role];info,payload,cfg=artifacts[role]
            current=self.remote.get(role)
            payload=payload_with_secret(work/(role+'.multipart'),info,self.main,role,self.key,self.migration_tags.get(role))
            reuse=False
            if current is not None:
                try:
                    remote=check_bindings(current,cfg,bool(self.key))
                    reuse=remote.get('TEACHER_AUX_REVISION',{}).get('text')==revision(info,self.key)
                except ValueError:pass
            if reuse:
                self.log('AUX-REUSE','产物及配置未变化，继续完成设置 / Reuse identical artifact',worker=worker,role=role)
            else:
                self.log('AUX-UPLOAD','发布辅助 Worker / Upload companion',worker=worker,role=role)
                self.client.request('PUT',worker,body=payload,content_type=info['content_type'])
            private(self.client,worker)
            schedule(self.client,worker,[])
            settings=self.client.request('GET',worker,'/settings');owned(settings,self.main,role)
            confirmed=check_bindings(settings,cfg,bool(self.key))
            if confirmed.get('TEACHER_AUX_REVISION',{}).get('text')!=revision(info,self.key):raise ValueError('Companion revision not confirmed; main deployment stopped')
            self.log('AUX-REVISION','辅助产物版本已核对 / Companion artifact revision confirmed',worker=worker,role=role)
            self.log('AUX-READY','辅助已发布并关闭公开访问，Cron 暂停 / Companion ready; scheduling paused',worker=worker)
    def activate(self):
        # Resolve the new site's circular binding only after the main deploy.
        worker=self.targets['native']
        settings=self.client.request('GET',worker,'/settings');owned(settings,self.main,'native')
        runner=self.targets['executor'] if self.mode=='separate' else self.main
        if not any(b.get('name')=='SYNC_RUNNER' and b.get('service')==runner for b in settings.get('bindings',[])):
            path,info=self.native_artifact
            payload=payload_with_secret(path,info,self.main,'native',self.key,self.client.migration_tag(worker),runner=runner)
            self.client.request('PUT',worker,body=payload,content_type=info['content_type'])
            actual=self.client.request('GET',worker,'/settings')
            if not any(b.get('name')=='SYNC_RUNNER' and b.get('service')==runner for b in actual.get('bindings',[])):raise ValueError('Sync callback binding not confirmed')
        private(self.client,worker)
        if self.mode=='separate':schedule(self.client,self.targets['executor'],['* * * * *'])
        self.log('AUX-ACTIVE','同步执行模式已配置 / Sync execution mode configured',mode=self.mode)
