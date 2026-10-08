"""Mount under the website admin router. Host supplies session+CSRF callbacks.
No standalone server, bearer secret, login page or automatic route registration.
"""
import json,secrets
from site_sync.core.input_errors import InputError
from site_sync.core.preflight_errors import PreflightError
from backend.app.ports.operations import current
from urllib.parse import parse_qs
from site_sync.core.authority import AuthorizationError,ConflictError
from .retention import Retention

class AdminASGI:
    def __init__(self,admin,authenticate,verify_csrf,*,prefix='/admin/site-sync/api'):
        self.admin,self.authenticate,self.verify_csrf,self.prefix=admin,authenticate,verify_csrf,prefix.rstrip('/')
    async def __call__(self,scope,receive,send):
        if scope.get('type')!='http':raise ValueError('HTTP only')
        status=200;trace=current().get('request_id') or secrets.token_hex(16)
        try:
            path=scope['path']
            if not path.startswith(self.prefix+'/'):raise KeyError('route')
            actor=await self.authenticate(scope)
            await self.admin.grant(actor)
            method=scope['method'];body={}
            if method not in ('GET','POST'):status=405;result={'error':'不支持的请求方法'}
            else:
                if method=='POST':
                    if not await self.verify_csrf(scope,actor):raise AuthorizationError('请求验证失败，请重新打开后台')
                    headers={k.lower():v for k,v in scope.get('headers',[])}
                    if headers.get(b'content-type',b'').split(b';')[0].strip()!=b'application/json':raise ValueError('需要 JSON 请求')
                    data=bytearray()
                    while True:
                        event=await receive()
                        if event['type']=='http.disconnect':return
                        chunk=event.get('body',b'')
                        if len(data)+len(chunk)>65536:raise ValueError('请求过大')
                        data.extend(chunk)
                        if not event.get('more_body',False):break
                    body=json.loads(data)
                    if not isinstance(body,dict):raise ValueError('需要 JSON 对象')
                query=scope.get('query_string',b'')
                if len(query)>4096:raise ValueError('查询参数过大')
                q=parse_qs(query.decode('ascii'));parts=path[len(self.prefix)+1:].split('/')
                result=await self.dispatch(actor,method,parts,q,body)
        except PreflightError as exc:status=exc.status;result=exc.payload()
        except AuthorizationError:status=403;result={'error':'无权限、授权已过期或请求校验失败'}
        except ConflictError as exc:status=409;result={'error':str(exc)[:200]}
        except InputError as exc:status=400;result=exc.payload()
        except (ValueError,TypeError,UnicodeError) as exc:status=400;result={'error':'请求参数不合法，请检查字段类型或刷新后重试','code':'SYNC_INPUT_INVALID','field':'body','stage':'admin-parse','error_type':type(exc).__name__,'retryable':False}
        except KeyError:status=404;result={'error':'接口不存在'}
        except Exception as exc:
            from site_sync.core.journal import failure
            from site_sync.core.diagnostics import classify,RELEASE,CODES
            code=classify(exc,'SYNC_ADMIN_FAILED');diagnostic=failure(exc)
            print(json.dumps({'component':'local-admin','release':RELEASE,'request_id':trace,'code':code,'diagnostic':diagnostic}),flush=True)
            status=503;result={'error':CODES[code],'code':code,'request_id':trace,'diagnostic':diagnostic}
        if status>=400:
            result['request_id']=trace
            print(json.dumps({'component':'sync-admin','request_id':trace,'http_status':status,'code':result.get('code'),'field':result.get('field'),'stage':result.get('stage'),'error':result.get('error')},ensure_ascii=False),flush=True)
        data=json.dumps(result,ensure_ascii=False,separators=(',',':')).encode()
        await send({'type':'http.response.start','status':status,'headers':[(b'content-type',b'application/json; charset=utf-8'),(b'cache-control',b'no-store'),(b'x-request-id',trace.encode()),(b'x-content-type-options',b'nosniff')]})
        await send({'type':'http.response.body','body':data})
    async def dispatch(self,actor,method,p,q,b):
        a=self.admin
        if p==['retry-policy']:return await a.retry_policy(actor,b if method=='POST' else None)
        if method=='GET':
            if p==['options']:return await a.options(actor)
            if p==['tasks']:return await a.tasks(actor,view=q.get('view',['active'])[0],cursor=json.loads(q['cursor'][0]) if 'cursor' in q else None,limit=int(q.get('limit',['50'])[0]))
            if len(p)==3 and p[0]=='tasks' and p[2]=='logs':return await a.logs(actor,p[1],before=int(q['before'][0]) if 'before' in q else None)
            if p==['schedules']:return await a.schedules(actor,cursor=q.get('cursor',[''])[0])
            if len(p)==2 and p[0]=='tasks':return await a.detail(actor,p[1])
            if len(p)==3 and p[0]=='tasks' and p[2]=='items':return await a.items(actor,p[1],cursor=q.get('cursor',[''])[0])
        else:
            if p==['defaults']:return await a.save_defaults(actor,b)
            if p==['tasks']:return await a.create(actor,b)
            if len(p)==3 and p[0]=='tasks' and p[2]=='logs':return await a.logs(actor,p[1],before=int(q['before'][0]) if 'before' in q else None)
            if p==['schedules']:return await a.save_schedule(actor,b)
            if len(p)==3 and p[0]=='schedules' and p[2]=='delete':return await a.delete_schedule(actor,p[1],b)
            if len(p)==3 and p[0]=='tasks':return await a.command(actor,p[1],p[2],b)
            if p==['retention']:
                await a.grant(actor,True)
                if b:raise ValueError('无效清理参数')
                return await Retention(a.db,a.retention_days).step(a.clock(),actor.grant_id)
        raise KeyError('route')
