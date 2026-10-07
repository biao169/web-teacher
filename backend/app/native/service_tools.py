"""Explicit settings-draft connection tests reuse provider executors without saving data."""
from .catalog import Error,normalize
from .translation_config import PUBLIC_FIELDS,KEY_FIELDS,parse_settings as translation_settings
from .metadata_config import parse_settings as metadata_settings,PROVIDERS as METADATA
from .translation_service import TranslationService
from .metadata_search import MetadataSearch,STATUS as METADATA_STATUS
from .service_jobs import network_lease
import asyncio

class ServiceTools:
    def __init__(self,r):
        """Keep authorization, settings and transports within the current authenticated request."""
        self.r=r
    async def current(self,uid,stamp):
        """Require the current editor record/version before using any stored credential."""
        r=self.r
        if not isinstance(uid,str) or len(uid)>128:raise Error('配置上下文无效')
        r.auth.require(r.p,'global_settings','edit' if uid else 'create')
        if not uid:return {}
        row=await r.content.get('global_settings',uid,r.p)
        if row['updated_at']!=stamp:raise Error('配置已变化，请先重新打开编辑页',409)
        secret=await r.sql.query('SELECT '+','.join(KEY_FIELDS.values())+' FROM global_settings WHERE uid=?',(uid,))
        return row|(secret[0] if secret else {})
    async def test(self,family,provider,uid,stamp,values):
        """Send only a fixed short sample with selected draft config; no content or config writes."""
        if family not in ('translation','metadata'):raise Error('服务类型无效')
        if not isinstance(values,dict):raise Error('服务测试参数无效')
        allowed=set(PUBLIC_FIELDS)|{'publication_metadata_provider','publication_metadata_providers','publication_suggestion_cache_seconds'}
        secrets={k[8:]:v for k,v in values.items() if k.startswith('_secret_')}
        if set(secrets)-set(KEY_FIELDS.values()) or set(values)-allowed-{'_secret_'+k for k in secrets}:raise Error('服务测试字段无效')
        current=await self.current(uid,stamp);patch=normalize('global_settings',{k:v for k,v in values.items() if k in allowed})
        for k,v in secrets.items():
            if not isinstance(v,str) or len(v)>4096:raise Error('测试密钥格式无效')
            if v:patch[k]=v
        merged=current|patch;r=self.r;action='edit' if uid else 'create'
        async with network_lease(r,family,'global_settings',action):
            if family=='translation':
                config=translation_settings(merged,getattr(r,'translation_credentials',{}))
                if provider not in config['enabled']:raise Error('请先勾选要测试的服务；测试不会保存设置')
                result=await TranslationService(r).execute('你好，世界。','zh','en',provider,config=config)
                result.pop('text',None)  # The status is sufficient; no provider text becomes executable UI.
            else:
                config=metadata_settings(merged)
                if provider not in METADATA or provider not in config['enabled']:raise Error('请先勾选要测试的论文服务；测试不保存设置')
                try:state,rows=await asyncio.wait_for(MetadataSearch(r).source(provider,'title','machine learning'),8)
                except TimeoutError:state='timeout';rows=[]
                except Exception:state='failed';rows=[]
                result={'status':'success' if state in ('success','not_found') else 'failed','attempts':[{'provider':provider,'label':METADATA[provider],'status':state,'message':'✓ 连接成功，样例未返回候选' if state=='not_found' else METADATA_STATUS[state]}]}
            await self.current(uid,stamp)
            # Re-read live permission/session versions after external waiting; never save test output.
            gid,guard=r.auth.guard(r.p,'global_settings',action)
            await r.sql.batch([guard,('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
            return result|{'sample':'你好，世界。 → en' if family=='translation' else 'machine learning','saved':False}
