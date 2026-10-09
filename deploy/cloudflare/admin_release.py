"""Admin publication uses the existing verified multipart uploader, never linked CI deploy."""
import json
from companion_release import private,schedule,check_bindings,payload_with_secret,revision
from companions import inspect_artifact
from site_workers import admin_name

class AdminRelease:
    def __init__(self,release,env=None):
        from site_workers import ADMIN_SECRETS
        self.secrets={k:str(env[k]) for k in ADMIN_SECRETS if env and k in env}
        self.identity=release.key+(':'+json.dumps(self.secrets,sort_keys=True) if self.secrets else '')
        self.release=release;self.client=release.client;self.main=release.main;self.worker=admin_name(self.main)
    def owned(self,value):
        bindings={b.get('name'):b for b in value.get('bindings',[])}
        if bindings.get('TEACHER_AUX_OWNER',{}).get('text')!=self.main or bindings.get('TEACHER_AUX_ROLE',{}).get('text')!='admin':raise ValueError('Admin Worker ownership mismatch: '+self.worker)
    def preflight(self):
        value=self.client.request('GET',self.worker,'/settings',missing=True)
        if value is not None:self.owned(value)
        return value
    def prepare(self,stage,work):
        current=self.preflight();cfg=json.loads((stage/'wrangler.admin.jsonc').read_text());path=work/'admin.multipart'
        info=inspect_artifact(path,cfg,self.main,'admin')
        reuse=False
        if current is not None:
            try:reuse=check_bindings(current,cfg,bool(self.release.key)).get('TEACHER_AUX_REVISION',{}).get('text')==revision(info,self.identity)
            except ValueError:pass
        if not reuse:
            payload=payload_with_secret(path,info,self.main,'admin',self.release.key,extra_secrets=self.secrets)
            self.client.request('PUT',self.worker,body=payload,content_type=info['content_type'])
        private(self.client,self.worker);schedule(self.client,self.worker,[])
        value=self.client.request('GET',self.worker,'/settings');self.owned(value)
        if check_bindings(value,cfg,bool(self.release.key)).get('TEACHER_AUX_REVISION',{}).get('text')!=revision(info,self.identity):raise ValueError('Admin revision not confirmed')
        self.release.log('ADMIN-READY','后台 Worker 已核对；无公开入口和 Cron / Admin ready, private HTTP only',worker=self.worker,release=cfg['vars'].get('TEACHER_RELEASE'))
