"""Thin HTTP layer for native-schema admin and public templates; no database compatibility views."""
import json,secrets,hmac,copy
try:
    import sqlite3
    IntegrityError=sqlite3.IntegrityError
except ImportError:
    class IntegrityError(Exception):pass
from urllib.parse import quote,parse_qs,urlencode,unquote
from fastapi import FastAPI,Request
from fastapi.responses import HTMLResponse,JSONResponse,RedirectResponse,Response
from fastapi.staticfiles import StaticFiles
from .catalog import TABLES,MODULES,CONTENT,TITLE,SECRET,Error,now,fields,label,defaults,deletable
from .list_columns import column_layout
from backend.app.domain.admin_presentation import admin_datetime
from .auth import Auth,sha
from .content import Content
from .media import Media
from .navigation import editor_state as navigation_editor_state,preview as navigation_preview,parse_path,build_path,in_scope
from .editor import editor_fields,editor_sections,reference_choices,citation_profile

async def payload(request,limit=500000):
    """Bound request size and reject duplicate form/JSON keys before dispatch."""
    buf=bytearray()
    async for chunk in request.stream():
        if len(buf)+len(chunk)>limit:raise Error('请求内容过大',413)
        buf.extend(chunk)
    try:
        if request.headers.get('content-type','').split(';')[0]=='application/json':
            def pairs(items):
                """为访客模板组织有值的原生字段标签及内容。"""
                d={}
                for k,v in items:
                    if k in d:raise ValueError()
                    d[k]=v
                return d
            d=json.loads(buf,object_pairs_hook=pairs)
            if not isinstance(d,dict):raise ValueError()
            return d
        parsed=parse_qs(buf.decode(),keep_blank_values=True,max_num_fields=300)
        if any(len(v)!=1 for v in parsed.values()):raise ValueError()
        return {k:v[0] for k,v in parsed.items()}
    except (ValueError,UnicodeDecodeError):raise Error('请求格式不正确') from None

def create_app(factory,static_root=None):
    """Wire one set of services to either local SQLite/files or Worker D1/R2 resources."""
    app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
    if static_root:
        for area in ('shared','public','admin'):app.mount('/assets/'+area,StaticFiles(directory=static_root/'frontend'/area/'static'),name='assets-'+area)
    async def resources(request):
        """按请求复制资源上下文并获取当前身份，防止请求之间串用权限。"""
        r=copy.copy(factory(request));r.auth=Auth(r.sql,r.passwords)
        r.p=await r.auth.principal(request.cookies.get(r.config.name('session')))
        parts=request.url.path.split('/')
        if not r.p and request.method=='GET' and (len(parts)>1 and parts[1] in ('en','zh') or request.url.path.startswith('/api/public/')) and hasattr(r.sql,'public_cache'):
            from .public_cache import PublicSQL
            r.sql=PublicSQL(r.sql)
        r.content=Content(r.sql,r.auth);r.media=Media(r.sql,r.auth,r.content,r.media_store,r.kind)
        return r
    def csrf(request,r,data):
        """Require configured origin plus session-bound CSRF, including fetch and multipart alternatives."""
        if request.headers.get('origin')!=r.config.origin:raise Error('请求来源不正确',403)
        if not r.p:raise Error('请先登录',401)
        value=data.get('_csrf') or request.headers.get('x-csrf-token','')
        if not hmac.compare_digest(str(value),r.p['csrf']):raise Error('页面验证已过期，请刷新',403)
    async def context(r,table='',title='',lang='zh'):
        """组合公共页面变量、菜单、身份与模块权限。"""
        rows=await r.sql.query('SELECT uid,site_name,site_name_en,hero_title,hero_subtitle,footer_text,homepage_profile_uid,homepage_publication_limit,homepage_news_limit,homepage_project_limit,homepage_student_limit,homepage_patent_limit,publication_citation_style,logo_key,favicon_key,seo_title,seo_description FROM site_settings WHERE is_active=1 ORDER BY id LIMIT 1')
        site=rows[0] if rows else {'site_name':'','site_name_en':'','hero_title':'','hero_subtitle':'','footer_text':''}
        if lang=='en':
            from .translation_sources import overlay
            await overlay(r.sql,'site_settings',site)
        site['title']=(site.get('site_name_en') if lang=='en' else '') or site.get('site_name') or ('Academic website' if lang=='en' else '教师个人网站')
        menu=[]
        for key,name in MODULES.items():
            if key=='auth_roles' or not r.p:continue
            # One primary account entry also serves a role-only reader without exposing user records.
            target='auth_roles' if key=='auth_users' and not r.p['permissions'].get(key,{}).get('can_view') else key
            menu.append({'key':key,'label':name,'url':'/admin/'+target,'locked':not bool(r.p['permissions'].get(target,{}).get('can_view'))})
        if r.p:
            from .navigation_options import sidebar_presentation
            for nav in await r.sql.query("SELECT * FROM navigation_items WHERE location='admin-sidebar' AND enabled=1 ORDER BY sort_order,id"):
                try:
                    target,_=r.content.parse_navigation(nav['path'] or '')
                    if nav['url_name'] and nav['visibility'] in r.p['scopes'] and r.p['permissions'].get(target,{}).get('can_view'):menu.append({'key':nav['uid'],'label':nav['title'],'url':'/admin/n/'+nav['url_name'],**sidebar_presentation(nav)})
                except Error:pass
        from .maintenance_admin import allowed as maintenance_allowed
        if r.kind=='local' and maintenance_allowed(r.p):menu.append({'key':'runtime-maintenance','label':'运行维护','url':'/admin/runtime-maintenance','icon':'settings','locked':False})
        from .accounts import ACCOUNT_TABLES,ACTIONS,SCOPES
        from .permissions import groups
        from .navigation_options import grouped_menu
        active_table='auth_users' if table=='auth_roles' else table
        return {'site':site,'lang':lang,'section':'admin','asset_mode':r.asset_mode,'authenticated':bool(r.p),'admin_menu':menu,'admin_menu_groups':grouped_menu(menu),'current_module':active_table,'current_entry':next((m for m in menu if m['key']==active_table),None),'page_title':title or MODULES.get(table,'网站管理'),'csrf':r.p['csrf'] if r.p else '', 'principal':r.p,'label':label,'title_field':TITLE,'modules':MODULES,'table':table,'account_ui':table in ACCOUNT_TABLES,'account_actions':ACTIONS,'account_scopes':SCOPES,'permission_groups':groups()}
    async def render(r,name,table='',title='',**values):
        """使用指定模板与上下文输出HTML。"""
        ctx=await context(r,table,title,values.pop('lang','zh'));ctx.update(values)
        if name.startswith('public/'):
            from .public_footer import navigation,footer_html
            from .public_data import public_media_map
            brand=await public_media_map(r,{'site_settings':[ctx['site']]})
            ctx['site']['logo_uid']=brand.get(ctx['site'].get('logo_key'))
            ctx['branding']={'icon_uid':'/media/'+brand[ctx['site']['favicon_key']] if ctx['site'].get('favicon_key') in brand else ''}
            ctx['section']='public'
            links=await navigation(r,ctx['lang']);ctx['public_nav']=links['header'];ctx['public_hero_nav']=links['hero']
            markup=r.renderer.render('public/native-footer-links.html',links=links['footer'],lang=ctx['lang'])
            ctx['footer_html']=footer_html(ctx['site'].get('footer_text') or '',markup)
        if name=='admin/native-edit.html' and table=='site_settings':
            from .public_footer import EXAMPLE
            ctx['footer_example']=EXAMPLE
        # A non-secret fingerprint binds one-time browser notices to this account and session.
        ctx['notification_session']=sha(r.p['csrf']) if r.p else ''
        if values.get('nav'):
            entry=next((m for m in ctx['admin_menu'] if m['url']=='/admin/n/'+values['nav']),None)
            if entry:ctx.update(current_module=entry['key'],current_entry=entry)
        return HTMLResponse(r.renderer.render(name,**ctx))
    @app.middleware('http')
    async def headers(request,call_next):
        """核对Host并为响应设置安全策略和缓存控制。"""
        try:factory(request).config.valid_host(request)
        except Error as exc:return HTMLResponse('请使用配置的网站地址访问',status_code=exc.status)
        response=await call_next(request)
        response.headers['X-Content-Type-Options']='nosniff';response.headers.setdefault('Referrer-Policy','same-origin')
        # Browser media may follow authorized external links; cross-origin pixel reads remain subject to CORS.
        image_policy="'self' data: https: http: blob:" if request.url.path.startswith('/admin') else "'self' data: https: http:"
        connect_policy="'self' https: http:" if request.url.path.startswith('/admin') else "'self'"
        frame_policy="'self' https: http:" if request.url.path.startswith('/admin') else "'self'"
        response.headers.setdefault('Content-Security-Policy',f"default-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'self' https://cdn.jsdelivr.net; img-src {image_policy}; media-src 'self' https: http:; connect-src {connect_policy}; worker-src 'self'; font-src 'self' data: blob:; object-src 'none'; frame-src {frame_policy}; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
        if not request.url.path.startswith('/assets/'):response.headers['Cache-Control']='no-store'
        elif response.status_code in (200,206,304):
            # Windows registry MIME mappings must not turn ES modules into text/plain.
            suffix=request.url.path.rsplit('.',1)[-1].lower()
            if suffix in ('js','mjs','css'):
                response.headers['Content-Type']='text/css; charset=utf-8' if suffix=='css' else 'text/javascript; charset=utf-8'
                response.headers['Cache-Control']='no-cache'
        return response
    @app.exception_handler(Error)
    async def domain_error(request,exc):
        """将业务异常转换为对应状态码及页面或JSON错误。"""
        code=exc.code or ('session_required' if exc.status==401 else 'request_forbidden' if exc.status==403 else 'request_failed')
        if request.headers.get('accept','').startswith('application/json'):return JSONResponse({'error':exc.message,'code':code},status_code=exc.status)
        if exc.status in (401,403) and request.url.path.startswith(('/admin','/api/','/transfer/login')):
            r=await resources(request)
            response=await render(r,'admin/native-access-error.html',title='权限不足' if code=='access_denied' else '登录已过期' if exc.status==401 else '操作受限',message=exc.message,access_code=code)
            response.status_code=exc.status;return response
        import html
        return HTMLResponse('<!doctype html><html lang="zh"><meta charset="utf-8"><title>操作提示</title><body><h1>操作未完成</h1><p>'+html.escape(exc.message)+'</p><p><a href="/admin">返回后台</a> · <a href="/auth/login">登录</a></p></body></html>',status_code=exc.status)
    @app.exception_handler(IntegrityError)
    async def database_error(request,exc):"""将数据库约束失败转换为保存冲突提示。""";return await domain_error(request,Error('数据已变化，或存在重复值、被引用条目和无效字段。请刷新后检查。',409))
    from .media_admin import install as install_media_admin
    install_media_admin(app,resources,csrf,render)
    @app.get('/health/ready')
    @app.get('/health')
    async def health(request:Request):
        """返回服务就绪信息，供启动器和反向代理检查。"""
        r=factory(request);await r.sql.query('SELECT uid FROM site_settings LIMIT 1');return {'status':'ok','schema':'academic-cms-native'}
    async def contact_response(r,lang,values=None,message='',success=False,status=200):
        challenge=secrets.token_urlsafe(32)
        allowed=bool(r.p) or bool(await r.sql.query('SELECT 1 FROM global_settings WHERE allow_anonymous_messages=1 LIMIT 1'))
        response=await render(r,'public/action.html',lang=lang,kind='contact',challenge=challenge,contact_values=values or {},contact_message=message,contact_success=success,contact_allowed=allowed)
        response.status_code=status;response.headers['Cache-Control']='no-store'
        r.config.set_cookie(response,'public-form',challenge,600)
        return response

    @app.get('/{lang}/contact')
    async def public_form(request:Request,lang:str='en'):
        """Render public registration/contact with a short-lived form token."""
        if lang not in ('zh','en'):raise Error('页面不存在',404)
        r=await resources(request)
        success=request.cookies.get(r.config.name('contact-result'))=='sent'
        response=await contact_response(r,lang,success=success,message=('Your message has been sent.' if lang=='en' else '留言已提交。') if success else '')
        response.delete_cookie(r.config.name('contact-result'),path='/')
        return response
    @app.post('/{lang}/contact')
    async def public_submit(request:Request,lang:str='en'):
        """Check origin/token, then invoke the native public action with bounded fields."""
        if lang not in ('zh','en'):raise Error('页面不存在',404)
        from .public_actions import contact
        r=await resources(request)
        from .public_contact import error_text,form_values
        data={};wants_json=request.headers.get('accept','').startswith('application/json')
        try:
            data=await payload(request,65536)
            token=request.cookies.get(r.config.name('public-form'),'')
            if not token or request.headers.get('origin')!=r.config.origin or not hmac.compare_digest(str(data.get('challenge','')),token):raise Error('表单已过期，请刷新',403)
            if any(not isinstance(data.get(key,''),str) for key in ('name','email','subject','content')):raise Error('请求格式不正确')
            await contact(r,data,request.client.host if request.client else 'worker')
        except Error as exc:
            message=error_text(exc.message,lang)
            if wants_json:
                challenge=secrets.token_urlsafe(32);response=JSONResponse({'ok':False,'message':message,'challenge':challenge},status_code=exc.status,headers={'Cache-Control':'no-store'});r.config.set_cookie(response,'public-form',challenge,600);return response
            return await contact_response(r,lang,form_values(data),message,status=exc.status)
        if wants_json:return JSONResponse({'ok':True,'message':'Your message has been sent.' if lang=='en' else '留言已提交。'},headers={'Cache-Control':'no-store'})
        response=RedirectResponse('/'+lang+'/contact',303);r.config.set_cookie(response,'contact-result','sent',60);return response
    from .public_auth import install as install_public_auth
    install_public_auth(app,resources,render)
    @app.post('/auth/logout')
    async def logout(request:Request):
        """撤销会话并清理浏览器登录Cookie。"""
        r=await resources(request);data=await payload(request);csrf(request,r,data);await r.auth.logout(r.p);response=RedirectResponse('/auth/login',303);r.config.clear(response);return response
    @app.get('/auth/password')
    async def password_get(request:Request):
        """显示当前登录用户的修改密码页面。"""
        r=await resources(request)
        if not r.p:return RedirectResponse('/auth/login',303)
        return await render(r,'admin/native-password.html',title='账户安全')
    @app.post('/auth/password')
    async def password_post(request:Request):
        """校验旧密码并更新密码摘要，撤销先前会话。"""
        r=await resources(request);data=await payload(request);csrf(request,r,data);await r.auth.password(r.p,data.get('current',''),data.get('password',''));response=RedirectResponse('/auth/login',303);r.config.clear(response);return response
    @app.get('/admin')
    async def dashboard(request:Request):
        """显示用户可访问模块的后台概览。"""
        r=await resources(request)
        if not r.p:return RedirectResponse('/auth/login',303)
        if r.p['must_change_password']:return RedirectResponse('/auth/password',303)
        counts={}
        for table in TABLES:
            if r.p['permissions'].get(table,{}).get('can_view'):counts[table]=(await r.content.listing(table,r.p))['total']
        from .navigation_options import grouped_menu
        cards=grouped_menu([{'key':key,'label':MODULES.get(key,key),'url':'/admin/'+key,'count':value} for key,value in counts.items()])
        return await render(r,'admin/native-dashboard.html',title='功能概览',counts=counts,dashboard_groups=cards)
    async def resolve(request,r,table=None,nav=None):
        """解析普通模块或自定义导航，并取得固定筛选范围。"""
        query_nav=request.query_params.get('nav')
        if len(request.query_params.getlist('nav'))>1 or (nav and query_nav and nav!=query_nav):raise Error('导航上下文不一致',403)
        nav=nav or query_nav;base={};label_text='';r.navigation_context=None
        if nav and not isinstance(nav,str):raise Error('导航标识无效')
        if nav:
            item,target,base=await r.content.navigation(nav,r.p)
            if table and table!=target:raise Error('导航目标不匹配',403)
            table=target;label_text=item['title'];r.navigation_context=item
        return table,base,nav or '',label_text
    def navigation_stamp(r,value):
        """拒绝持有旧导航条件的编辑或快捷操作；缺少版本也不能继续写入。"""
        if r.navigation_context and value!=r.navigation_context['updated_at']:raise Error('导航条件已变化，请重新打开该入口后再保存。当前输入已保留。',409)
    async def check_navigation_current(r):
        """导出交付前复核导航仍启用且未变化，避免输出旧固定范围。"""
        item=r.navigation_context
        if item:
            fresh,_,_=await r.content.navigation(item['url_name'],r.p)
            if fresh['uid']!=item['uid'] or fresh['updated_at']!=item['updated_at']:raise Error('导航条件已变化，请重新导出',409)
    async def list_page(request,table=None,nav=None):
        """以同一模板输出完整页或列表片段，重新核验授权、固定范围并校正实际页码。"""
        r=await resources(request)
        fragment=request.headers.get('x-native-list')=='1'
        if not r.p:
            if fragment:raise Error('登录已过期，请重新登录后查看列表',401)
            return RedirectResponse('/auth/login',303)
        table,base,nav,custom=await resolve(request,r,table,nav)
        if nav and request.url.path!='/admin/n/'+nav:
            query={k:v for k,v in request.query_params.items() if k!='nav'}
            return RedirectResponse('/admin/n/'+nav+('?' +urlencode(query) if query else ''),303)
        query=dict(request.query_params)
        if table=='media_assets':query.setdefault('f.status',base.get('status','active'))
        cols,recommended_columns=column_layout(table)
        if table=='operation_logs':
            from .operation_logs import Logs
            result=await Logs(r).listing(query)
        elif table=='translation_cache':
            from .translation_groups import TranslationGroups,COLUMNS,RECOMMENDED
            cols,recommended_columns=COLUMNS,RECOMMENDED
            result=await TranslationGroups(r,query,base).listing()
        else:result=await r.content.listing(table,r.p,query,base,projection=list(dict.fromkeys(('uid','created_at','updated_at',*cols))) if table=='messages' else None)
        column_specs=dict(TABLES[table]['columns']);column_labels={c:label(table,c) for c in cols}
        translation_categories=[]
        if table=='translation_cache':
            translation_categories=TranslationGroups(r,query,base).categories()
            column_specs.update({key:{'kind':'derived'} for key in ('__sources','__format')})
            column_labels.update(__sources='来源记录',__format='原文格式',status='翻译状态',is_manual='含人工版本',is_current='含当前译文',updated_at='最近更新')
        from .accounts import ACCOUNT_TABLES,SCOPES,STATES,can_manage,list_context
        account_model=await list_context(r,table,result['rows']);permissions=dict(r.p['permissions'][table])
        message_states={};message_views={}
        if table=='messages':
            from .messages import STATES,presentation
            message_states=STATES;message_views={row['uid']:presentation(row) for row in result['rows']}
            column_specs['status']={**column_specs['status'],'enum':list(STATES),'option_labels':STATES}
            permissions['can_create']=0
            permissions['can_delete']=0
        if table in ACCOUNT_TABLES:
            for action in ('create','edit','delete'):permissions['can_'+action]=int(can_manage(r.p,table,action))
            if table=='auth_users':
                roles=account_model['roles']
                column_specs['role_uid']={**column_specs['role_uid'],'enum':list(roles),'option_labels':{key:value['name'] for key,value in roles.items()}}
                column_specs['status']={**column_specs['status'],'option_labels':{key:value[0] for key,value in STATES.items()}}
                column_specs['visibility']={**column_specs['visibility'],'option_labels':SCOPES}
            else:
                column_specs.update({key:{'kind':'derived'} for key in ('__members','__permissions')})
                column_specs['visibility_scopes']={**column_specs['visibility_scopes'],'enum':[json.dumps(k) for k in SCOPES],'option_labels':{json.dumps(k):v for k,v in SCOPES.items()},'filter_prefix':'c.'}
            column_labels={c:label(table,c) for c in cols};column_labels.update(role_uid='所属角色',visibility='记录可见性',visibility_scopes='可见范围',is_system='角色类型',is_active='启用',__members='可见用户',__permissions='授权概览')
        media_usage={};media_counts={}
        if table=='media_assets':
            column_specs.update({c:{'kind':'derived'} for c in ('__preview','__usage')})
            column_labels.update(__preview='预览',__usage='使用位置',size='大小/KB')
            column_specs['size']={**column_specs['size'],'filter_scale':1024,'filter_note':'大小按KB向上取整显示；按实际KB精确筛选仍支持小数，1 KB = 1024字节。'}
            media_usage=await r.media.references.summaries(r.p,result['rows'],include_links=True)
            media_counts={x['status']:x['n'] for x in await r.sql.query('SELECT status,count(*) n FROM media_assets GROUP BY status')}
        if table=='global_settings':column_labels['uid']='配置标识'
        def page_url(page):"""保留当前筛选参数并生成目标页码链接。""";return request.url.path+'?'+urlencode({**query,'page':page})
        response=await render(r,'admin/native-list-panel.html' if fragment else 'admin/native-list.html',table,custom,listing=result,columns=cols,recommended_columns=recommended_columns,column_specs=column_specs,column_labels=column_labels,account_model=account_model,message_states=message_states,message_views=message_views,media_usage=media_usage,media_counts=media_counts,translation_categories=translation_categories,query=query,nav=nav,nav_stamp=(r.navigation_context or {}).get('updated_at',''),base=base,can_create_scoped=not set(base)-set(fields(table)),page_url=page_url,export_url='/admin/'+table+'/export?'+urlencode(query|({'nav':nav} if nav else {})),permissions=permissions,deletable=deletable(table),tools=table in ('media_assets','operation_logs','translation_cache'),editable_fields=fields(table))
        if fragment:
            await check_navigation_current(r)
            # Keep search/size/sort/ASCII navigation and only correct an out-of-range page.
            actual=dict(request.query_params)
            if 'page' in actual:actual['page']=result['page']
            url=request.url.path+('?' +urlencode(actual) if actual else '')
            return JSONResponse({'html':response.body.decode(),'url':url,'owner':r.p['uid'],'session':sha(r.p['csrf'])})
        return response
    @app.get('/admin/n/{nav}')
    async def custom_list(request:Request,nav:str):"""按照自定义导航的固定条件显示授权范围内的列表。""";return await list_page(request,nav=nav)
    from .message_log_admin import install as install_message_log_admin
    install_message_log_admin(app,resources,render)
    from .example_admin import install as install_examples
    install_examples(app,resources,csrf,render)
    from .data_admin import install as install_data_admin
    install_data_admin(app,resources,csrf,render)
    from .session_admin import install as install_session_admin
    install_session_admin(app,resources,csrf,resolve,navigation_stamp,check_navigation_current)
    from .translation_group_admin import install as install_translation_groups
    install_translation_groups(app,resources,render,csrf,resolve,navigation_stamp)
    from .maintenance_admin import install as install_maintenance
    install_maintenance(app,resources,csrf,render)
    @app.get('/admin/transfer')
    async def transfer_admin(request:Request):
        """显示独立快传管理入口和身份桥接说明。"""
        r=await resources(request);r.auth.require(r.p,'transfer')
        workspace=getattr(app.state,'transfer_admin_workspace',None)
        values=await workspace(request) if workspace else {}
        return await render(r,'admin/native-transfer.html','transfer',title='文件快传管理',transfer_url=r.transfer_url,**values)
    @app.get('/admin/{table}/export')
    async def export(request:Request,table:str):
        """导出当前权限及筛选范围内的列表数据。"""
        # Bound each page and the encoded result; long news bodies must not exhaust a small VPS.
        r=await resources(request);r.auth.require(r.p,table,'export');_,base,_,_=await resolve(request,r,table)
        if table=='translation_cache':
            from .translation_groups import TranslationGroups
            body=await TranslationGroups(r,dict(request.query_params),base).export()
            await check_navigation_current(r)
            return Response(body,media_type='application/json',headers={'Content-Disposition':'attachment; filename="translation-groups.json"'})
        if table=='operation_logs':
            from .operation_logs import Logs
            body,fmt=await Logs(r).export(dict(request.query_params))
            return Response(body,media_type='text/csv; charset=utf-8' if fmt=='csv' else 'application/json',headers={'Content-Disposition':f'attachment; filename="operation-logs.{fmt}"'})
        query=dict(request.query_params)|{'size':10,'page':1};result=await r.content.listing(table,r.p,query,base)
        if result['total']>20000:raise Error('单次导出最多20000条，请先筛选')
        encoded=[];size=0
        for page in range(1,result['pages']+1):
            rows=result['rows'] if page==1 else (await r.content.listing(table,r.p,query|{'page':page},base))['rows']
            for row in rows:
                item=json.dumps(row,ensure_ascii=False).encode();size+=len(item)+1
                if size>4*1024*1024:raise Error('导出结果超过4MiB，请缩小筛选范围或使用数据库备份')
                encoded.append(item)
        await check_navigation_current(r)
        body=b'{"table":'+json.dumps(table).encode()+b',"rows":['+b','.join(encoded)+b']}'
        return Response(body,media_type='application/json',headers={'Content-Disposition':f'attachment; filename="{table}.json"'})
    @app.get('/admin/{table}/new')
    @app.get('/admin/{table}/{uid}/edit')
    async def editor(request:Request,table:str,uid:str=None):
        """显示原生字段对应的单页分区编辑表单。"""
        r=await resources(request);table,base,nav,_=await resolve(request,r,table);r.auth.require(r.p,table,'edit' if uid else 'create')
        from .accounts import ACCOUNT_TABLES,scope_choices
        if table in ACCOUNT_TABLES and not r.p['is_system']:raise Error('账号与授权仅系统管理员可以更改',403)
        if table=='operation_logs' or (table in ('media_assets','translation_cache','messages') and not uid):raise Error('请在该功能列表中使用专用操作')
        row=await r.content.get(table,uid,r.p) if uid else defaults(table)|{k:int(v) if TABLES[table]['columns'][k]['kind'] in ('integer','boolean') else v for k,v in base.items()}
        if table=='auth_users' and not uid:row.update(status=base.get('status','active'),must_change_password=1)
        if uid and not in_scope(table,row,base):raise Error('条目不在固定筛选范围内',403)
        if not uid and set(base)-set(fields(table)):raise Error('固定范围包含系统字段，请从普通模块入口新增',403)
        choices=await reference_choices(r,table,row)
        secret_fields=sorted(SECRET & set(TABLES[table]['columns'])) if table=='global_settings' else []
        matches=None;match_error='';can_match=bool(r.p['permissions'].get('students',{}).get('can_view'))
        if table=='student_category_displays' and can_match:
            try:matches=await r.content.matches(r.p,row)
            except Error as exc:
                if exc.status!=422:raise
                match_error=exc.message  # Invalid stored rules remain editable on the same page.
        perms=await r.sql.query('SELECT * FROM auth_permissions WHERE role_uid=?',(uid,)) if table=='auth_roles' and uid else []
        specs=editor_fields(table,row)
        from .permissions import lock_references
        lock_references(r.p,specs,row)
        from .media_links import decorate_media_fields
        await decorate_media_fields(r,table,specs,row)
        profile=None
        if table=='publications':
            profile=await citation_profile(r)
            media_permission=r.p['permissions'].get('media_assets',{})
            can_choose=bool(media_permission.get('can_view'));can_upload=False;reason='没有媒体库查看权限，无法选择或上传附件。'
            if can_choose:
                from .media_picker import MediaPicker
                options=await MediaPicker(r).options({'types':('application/pdf',),'fixed_key':base.get('pdf_key'),'required':False})
                can_upload=options['can_upload']
                reason='当前导航已固定附件，不能上传替换。' if base.get('pdf_key') else ('没有媒体上传权限，可选择已有 PDF。' if not media_permission.get('can_create') else '全局设置未允许上传 PDF，可选择已有文件。')
            specs['pdf_key'].update(paper_pdf=True,media_can_choose=can_choose,media_can_upload=can_upload,media_permission_note='' if can_upload else reason)
        metadata_options=[];translation_options=[];translation_default='';secret_help={}
        if table in ('global_settings','publications'):
            from .metadata_config import page_options
            metadata_options=await page_options(r,row if table=='global_settings' else None)
            if table=='global_settings':
                from .metadata_config import parse_settings as metadata_settings
                specs['publication_metadata_providers'].update(providers=metadata_options,recommended=['crossref','datacite','europe-pmc','pubmed'],effective_default=next((p['label'] for p in metadata_options if p['id']==(row.get('publication_metadata_provider') or next((v['id'] for v in metadata_options if v['position']==1),'crossref'))),'未配置'))
        if table in ('global_settings','translation_cache'):
            from .translation_config import page_options as translation_page,PROVIDERS as TRANSLATORS,KEY_FIELDS
            translation_options,translation_default=await translation_page(r,row if table=='global_settings' else None)
            if table=='global_settings':
                specs['translation_providers'].update(providers=translation_options,recommended=['mymemory'],effective_default=TRANSLATORS.get(translation_default,'配置待修复'))
                secret_help={field:TRANSLATORS[key]+'翻译服务密钥；部署环境值优先。最多4096个非空白ASCII字符；留空保留已有值。' for key,field in KEY_FIELDS.items()}
        if table=='auth_roles':
            specs['visibility_scopes']['selected']=scope_choices(row.get('visibility_scopes'))
            if row.get('is_system'):specs['is_active'].update(locked=True,help='系统管理角色始终启用。')
        sessions_html=''
        if table=='auth_users' and uid:
            from .sessions import Sessions
            from .session_admin import panel
            sessions_html=panel(r,await Sessions(r).listing(uid,base=base),nav,(r.navigation_context or {}).get('updated_at',''))
        translation_source={}
        if table=='translation_cache':
            from .source_links import translation_context
            translation_source=await translation_context(r,row)
        # The same fragment renderer serves first paint and later in-place session refreshes.
        return await render(r,'admin/native-edit.html',table,'编辑'+MODULES.get(table,table),row=row,translation_source=translation_source,sessions_html=sessions_html,metadata_options=metadata_options,translation_options=translation_options,translation_default=translation_default,secret_help=secret_help,citation_profile=profile,citation_profiles=profile['names'] if profile else [],navigation_editor=navigation_editor_state(row,r.p) if table=='navigation_items' else None,sections=editor_sections(table,row,secret_fields),specs=specs,secret_fields=secret_fields,choices=choices,nav=nav,base=base,nav_stamp=(r.navigation_context or {}).get('updated_at',''),matches=matches,can_match=can_match,match_error=match_error,activated=request.query_params.get('result')=='activated' and bool(row.get('enabled')),role_permissions={x['module']:x for x in perms},json_dump=lambda v:json.dumps(v,ensure_ascii=False) if isinstance(v,(dict,list)) else (v if v is not None else ''))
    @app.post('/admin/{table}/save')
    async def save(request:Request,table:str):
        """验证表单、权限和更新时间后保存整个记录。"""
        r=await resources(request);data=await payload(request);csrf(request,r,data);table,base,nav,_=await resolve(request,r,table,data.pop('_nav',''));uid=data.pop('_uid','') or None;stamp=data.pop('_stamp',None);action=data.pop('_action','save');data.pop('_csrf',None);password=data.pop('_password',None);secret_values={k.removeprefix('_secret_'):data.pop(k) for k in list(data) if k.startswith('_secret_')}
        navigation_stamp(r,data.pop('_nav_stamp',''))
        from .accounts import parse_helpers
        permissions=parse_helpers(table,data,password)
        if table=='global_settings':
            from .metadata_config import form_settings
            form_settings(data)
            from .translation_config import form_settings as translation_form
            translation_form(data)
        for f,s in fields(table).items():
            if s['kind']=='boolean':data.setdefault(f,0)
        if table=='student_category_displays' and action=='activate':data['enabled']=1
        from .media_links import MediaLinks
        media_links=await MediaLinks(r).form(table,data,uid,nav,(r.navigation_context or {}).get('updated_at',''))
        uid=await r.content.save(table,r.p,data,uid,stamp,base,password,permissions,secret_values,navigation=r.navigation_context,media_links=media_links)
        # A self-reset has already revoked this session; do not redirect into a protected edit page.
        if table=='auth_users' and uid==r.p['uid']:
            if password:
                response=RedirectResponse('/auth/login',303);r.config.clear(response);return response
            if data.get('must_change_password') in (1,'1'):return RedirectResponse('/auth/password',303)
        target='/admin/n/'+nav if nav else '/admin/'+table
        if table=='media_assets' and not nav:
            saved=await r.media.inspect(r.p,uid);target+='?'+urlencode({'f.status':saved['status']})
        if action not in ('return',):target=f'/admin/{table}/{uid}/edit'+('?' +urlencode({'nav':nav}) if nav else '')
        if table=='student_category_displays' and action=='activate':target=f'/admin/{table}/{uid}/edit?result=activated#tool-matches'
        return RedirectResponse(target,303)
    @app.post('/api/assistance/news-body')
    async def news_body_preview(request:Request):
        """只读草稿预览或显式格式转换，复核新闻权限、更新时间和固定导航范围。"""
        from backend.app.domain.richtext import convert_body,body_references
        from .news_body import news_html
        r=await resources(request);data=await payload(request,900000);csrf(request,r,data)
        if set(data)-{'_csrf','_uid','_stamp','_nav','_nav_stamp','content','content_format','target_format'}:raise Error('正文预览参数无效')
        uid=data.get('_uid') or None
        if uid is not None and (not isinstance(uid,str) or len(uid)>128):raise Error('新闻标识无效')
        _,base,_,_=await resolve(request,r,'news',data.get('_nav'))
        navigation_stamp(r,data.get('_nav_stamp'))
        r.auth.require(r.p,'news','edit' if uid else 'create')
        async def check_source():
            """返回前再次核对当前版本；预览不能跨过固定范围或旧编辑版本。"""
            if uid:
                row=await r.content.get('news',uid,r.p)
                if row['updated_at']!=data.get('_stamp'):raise Error('新闻已变化，请重新打开后预览',409)
                if not in_scope('news',row,base):raise Error('条目不在固定筛选范围内',403)
            await check_navigation_current(r)
        await check_source()
        value=data.get('content','');format=data.get('content_format','plain')
        if body_references(value,format):r.auth.require(r.p,'media_assets')
        if data.get('target_format') is not None:
            result={'content':convert_body(value,format,data['target_format'])}
        else:result={'html':await news_html(r.sql,value,format)}
        await check_source()
        return result
    @app.post('/api/assistance/navigation')
    async def navigation_assistance(request:Request):
        """解析导航草稿或预览授权记录；元信息解析和数据读取分别检查所需权限。"""
        r=await resources(request);data=await payload(request,65536);csrf(request,r,data)
        if set(data)-{'_csrf','uid','action','path','table','conditions','page','size','location','lang'}:raise Error('导航辅助参数无效')
        uid=data.get('uid')
        if uid is not None and (not isinstance(uid,str) or len(uid)>128):raise Error('导航记录标识无效')
        r.auth.require(r.p,'navigation_items','edit' if uid else 'create')
        if uid:await r.content.get('navigation_items',uid,r.p)
        if data.get('action')=='parse':
            from .navigation import draft_state
            return draft_state(data.get('path'),data.get('location','admin-sidebar'),r.p)
        if data.get('action')!='preview':raise Error('导航辅助操作无效')
        result=await navigation_preview(r.content,r.p,data)
        return {'html':r.renderer.render('admin/native-navigation-results.html',**result),'path':result['path'],'total':result['listing']['total']}
    @app.post('/api/assistance/student-matches')
    async def student_matches(request:Request):
        """为当前分类草稿返回同一模板生成的匹配页；检查分类编辑及学生查看权限。"""
        r=await resources(request);data=await payload(request,16384);csrf(request,r,data)
        if set(data)-{'_csrf','uid','keywords','page','size'}:raise Error('匹配预览参数不正确')
        uid=data.get('uid')
        if uid is not None and (not isinstance(uid,str) or len(uid)>128):raise Error('分类标识无效')
        uid=uid or None
        r.auth.require(r.p,'student_category_displays','edit' if uid else 'create')
        if uid:await r.content.get('student_category_displays',uid,r.p)
        matches=await r.content.matches(r.p,{'keywords':data.get('keywords')},{'page':data.get('page',1),'size':data.get('size',10)})
        html=r.renderer.render('admin/native-student-matches.html',matches=matches)
        return {'html':html,'total':matches['total'],'page':matches['page'],'size':matches['size']}
    @app.post('/api/admin/{table}/{uid}')
    async def row_action(request:Request,table:str,uid:str):
        """复用事务写入后回读开关与原生时间戳，使连续快捷操作使用最新实际值。"""
        r=await resources(request);data=await payload(request,16384);csrf(request,r,data);_,base,_,_=await resolve(request,r,table,data.get('nav'))
        navigation_stamp(r,data.get('nav_stamp'))
        action=data.get('action')
        if action=='delete':await r.content.delete(table,r.p,uid,data.get('stamp'),base,navigation=r.navigation_context)
        elif table=='media_assets' and action in ('purge-prepare','purge'):
            from .media_audit import MediaAudit
            audit=MediaAudit(r)
            try:
                if action=='purge-prepare':return await audit.prepare_trash(uid,data.get('stamp'),data.get('immediate',False),base,r.navigation_context)
                return await audit.commit_trash(uid,data.get('token'),base,r.navigation_context)
            except OSError:raise Error('文件清理暂未完成，请核对后重试；回收站登记已保留',503) from None
        elif table=='media_assets' and action=='status':await r.media.status(r.p,uid,data.get('stamp'),data.get('value'),base,r.navigation_context)
        elif table=='messages' and action=='message-status':
            from .messages import STATES
            if not isinstance(data.get('value'),str) or data['value'] not in STATES:raise Error('无效留言状态')
            await r.content.save(table,r.p,{'status':data['value']},uid,data.get('stamp'),base,navigation=r.navigation_context)
        elif action=='toggle':
            field=data.get('field');spec=fields(table).get(field,{})
            if spec.get('kind')!='boolean':raise Error('不支持此快捷字段')
            await r.content.save(table,r.p,{field:data.get('value')},uid,data.get('stamp'),base,navigation=r.navigation_context)
        else:raise Error('未知操作')
        result={'ok':True,'redirect':'/auth/password' if table=='auth_users' and uid==r.p['uid'] and action=='toggle' and data.get('field')=='must_change_password' and data.get('value') in (1,'1') else ''}
        if action=='toggle':
            # Only catalog-validated boolean names enter SQL; never send a complete sensitive row.
            rows=await r.sql.query(f'SELECT uid,updated_at,"{field}" FROM "{table}" WHERE uid=?',(uid,))
            if rows:
                row=rows[0];result['row']={'uid':uid,'updated_at':row['updated_at'],'updated_at_display':admin_datetime(row['updated_at']),'field':field,'value':row[field],'label':label(table,field)}
            # These modules can also change the shared sidebar or branding, beyond the list panel.
            result['reload']=table in ('navigation_items','site_settings')
        return result
    @app.get('/admin/translation/suggestions')
    async def history_page(request:Request):
        """显示按模块和字段查询的历史词库，与表单共用权限目录。"""
        from .suggestions import suggestion_catalog
        r=await resources(request)
        if not r.p:return RedirectResponse('/auth/login',303)
        catalog=suggestion_catalog(r.p);selected=request.query_params.get('module','')
        if selected and selected not in catalog:raise Error('没有此历史词库的查看权限',403)
        selected=selected or next(iter(catalog),'')
        if selected:r.auth.require(r.p,selected)
        return await render(r,'admin/native-suggestions.html',selected,'历史词库',history_catalog=catalog,selected_module=selected)
    @app.post('/api/assistance/suggestions')
    async def history_suggestions(request:Request):
        """核验会话/CSRF和导航上下文，返回有界历史字段候选，不保存内容。"""
        from .suggestions import suggestions,SUGGESTION_FIELDS
        r=await resources(request);data=await payload(request,65536);csrf(request,r,data)
        if set(data)-{'_csrf','table','field','query','exclude','nav','nav_stamp'}:raise Error('历史建议参数无效')
        table=data.get('table')
        if not isinstance(table,str) or table not in SUGGESTION_FIELDS:raise Error('此模块不支持历史建议')
        r.auth.require(r.p,table)
        _,base,_,_=await resolve(request,r,table,data.get('nav',''));navigation_stamp(r,data.get('nav_stamp',''))
        result=await suggestions(r.content,r.p,data,base);await check_navigation_current(r)
        return result
    @app.get('/admin/publications/metadata')
    async def metadata_page(request:Request):
        """独立只读检索页复用编辑器的查询组件；不隐式创建论文。"""
        from .metadata_config import page_options
        r=await resources(request);r.auth.require(r.p,'publications')
        return await render(r,'admin/native-metadata-page.html','publications','论文元数据检索',metadata_options=await page_options(r))
    @app.post('/api/assistance/publication-profile')
    async def publication_profile(request:Request):
        """为当前论文草稿重新提取公开精选教师；复用论文辅助的授权及导航检查。"""
        from .metadata_search import MetadataSearch
        r=await resources(request);data=await payload(request,4096);csrf(request,r,data)
        if set(data)-{'_csrf','uid','nav','nav_stamp'}:raise Error('教师提取参数无效')
        service=MetadataSearch(r);context=(data.get('uid',''),data.get('nav',''),data.get('nav_stamp',''))
        await service.authorize(*context)
        result=await citation_profile(r)
        await service.authorize(*context)
        return result
    @app.post('/api/assistance/metadata')
    async def metadata(request:Request):
        """查询DOI/题名候选和尝试状态；保留旧DOI服务入口的字段返回形态。"""
        from .metadata_search import MetadataSearch
        r=await resources(request);data=await payload(request,16384);csrf(request,r,data)
        if set(data)-{'_csrf','query','kind','provider','uid','nav','nav_stamp','read_only','doi','correspondence'}:raise Error('元数据查询参数无效')
        if 'query' not in data and 'doi' in data:
            from .assistance import Assistance
            return await Assistance(r).metadata(data['doi'],data.get('uid',''))
        readonly=data.get('read_only',False)
        if not isinstance(readonly,bool):raise Error('查询模式无效')
        return await MetadataSearch(r).search(data.get('query',''),data.get('kind','auto'),data.get('provider','default'),data.get('uid',''),data.get('nav',''),data.get('nav_stamp',''),readonly,data.get('correspondence',False))
    @app.post('/api/assistance/translation')
    async def translation(request:Request):
        """为选定原生字段建立带来源摘要的翻译任务。"""
        from .assistance import Assistance
        r=await resources(request);data=await payload(request,16384);csrf(request,r,data)
        uid=await Assistance(r).queue(data.get('table'),data.get('uid'),data.get('field'))
        return {'uid':uid}
    @app.post('/api/assistance/translate')
    async def translate(request:Request):
        """执行指定翻译任务并按版本更新原生翻译记录。"""
        from .assistance import Assistance
        r=await resources(request);data=await payload(request,16384);csrf(request,r,data)
        if set(data)-{'_csrf','uid','stamp','provider'}:raise Error('翻译参数无效')
        return await Assistance(r).translate(data.get('uid'),data.get('stamp'),data.get('provider','default'))
    @app.post('/api/assistance/services/test')
    async def service_test(request:Request):
        """Test one selected draft provider with a fixed sample, without saving settings or content."""
        from .service_tools import ServiceTools
        r=await resources(request);data=await payload(request,32768);csrf(request,r,data)
        if set(data)-{'_csrf','family','provider','uid','stamp','values'}:raise Error('服务测试参数无效')
        return await ServiceTools(r).test(data.get('family'),data.get('provider'),data.get('uid',''),data.get('stamp',''),data.get('values',{}))
    @app.get('/admin/translation_cache/batch')
    async def translation_batch_page(request:Request):
        """Render one shared batch workspace; no scanning or external calls occur on page load."""
        from .translation_batch import TranslationBatch
        from .translation_config import page_options
        r=await resources(request);batch=await TranslationBatch(r).status();options,default=await page_options(r)
        return await render(r,'admin/native-translation-batch.html','translation_cache','批量扫描与翻译',batch=batch,translation_options=options,translation_default=default)
    @app.get('/api/assistance/translation-batch/status')
    async def translation_batch_status(request:Request):
        """Read authorized progress without resuming a browser-driven job."""
        from .translation_batch import TranslationBatch
        r=await resources(request);return await TranslationBatch(r).status()
    @app.post('/api/assistance/translation-batch/{operation}')
    async def translation_batch_action(request:Request,operation:str):
        """Apply CSRF and strict payload contracts before a bounded job action or single step."""
        from .translation_batch import TranslationBatch
        r=await resources(request);data=await payload(request,8192);csrf(request,r,data);service=TranslationBatch(r)
        if operation=='step':
            if set(data)-{'_csrf','id','rev'}:raise Error('批次推进参数无效')
            return await service.step(data.get('id'),data.get('rev'))
        if operation=='action':
            if set(data)-{'_csrf','action','id','rev','modules','provider'}:raise Error('批次操作参数无效')
            return await service.action(data.get('action'),data.get('id',''),data.get('rev'),data.get('modules'),data.get('provider','default'))
        raise Error('批次操作不存在',404)
    @app.post('/api/assistance/translation-invalidate')
    async def translation_invalidate(request:Request):
        """Explicitly disable a cache under its native timestamp and edit permission."""
        from .translation_batch import TranslationBatch
        r=await resources(request);data=await payload(request,4096);csrf(request,r,data)
        if set(data)-{'_csrf','uid','stamp'}:raise Error('译文停用参数无效')
        return await TranslationBatch(r).invalidate(data.get('uid'),data.get('stamp'))
    @app.post('/api/admin/media/upload/file')
    async def upload(request:Request):
        """检查上传权限和配额后保存媒体正文及元数据。"""
        r=await resources(request);csrf(request,r,{})
        uid=await r.media.upload(r.p,unquote(request.headers.get('x-filename','')),request);return {'uid':uid}
    @app.get('/admin/{table}')
    async def listing(request:Request,table:str):"""返回查询后的原生模块记录和分页信息。""";return await list_page(request,table)
    @app.get('/admin/media/trash')
    async def media_trash(request:Request):
        """回收站入口复用媒体列表的检索、列设置与分页。"""
        r=await resources(request);r.auth.require(r.p,'media_assets')
        return RedirectResponse('/admin/media_assets?'+urlencode(dict(request.query_params)|{'f.status':'trash'}),303)
    @app.get('/admin/media/{uid}/inspect')
    async def media_inspect(request:Request,uid:str):
        """显示媒体预览、元数据和按模块权限分页的真实使用位置。"""
        r=await resources(request);row=await r.media.inspect(r.p,uid)
        usage=(await r.media.references.summaries(r.p,[row]))[uid]
        locations=await r.media.references.locations(r.p,row,usage,request.query_params.get('source',''),request.query_params.get('page',1))
        def page_url(page,source=None):
            """引用页码链接保留当前来源分组。"""
            return request.url.path+'?'+urlencode({'source':source or locations['source'],'page':page})+'#media-usage'
        return await render(r,'admin/native-media-detail.html','media_assets','媒体预览与使用位置',row=row,usage=usage,locations=locations,page_url=page_url,permissions=r.p['permissions']['media_assets'])
    @app.get('/api/admin/media/{uid}/locations')
    async def media_locations(request:Request,uid:str):
        """列表内分页读取真实使用位置，每次重新校验媒体与来源权限。"""
        r=await resources(request);row=await r.media.inspect(r.p,uid)
        usage=(await r.media.references.summaries(r.p,[row]))[uid]
        locations=await r.media.references.locations(r.p,row,usage,request.query_params.get('source',''),request.query_params.get('page',1))
        def page_url(page,source=None):
            return request.url.path+'?'+urlencode({'source':source or locations['source'],'page':page})
        return {'html':r.renderer.render('admin/native-media-locations.html',usage=usage,locations=locations,page_url=page_url)}
    @app.api_route('/api/admin/media/{uid}/content',methods=['GET','HEAD'])
    async def media_preview(request:Request,uid:str):
        """媒体库和回收站复用有界预览接口。"""
        from .media_response import media_response
        return await media_response(request,await resources(request),uid,private=True)
    @app.api_route('/media/{uid}',methods=['GET','HEAD'])
    async def media(request:Request,uid:str):
        """公开正文、封面和PDF阅读复用同一鉴权及分段读取接口。"""
        from .media_response import media_response
        return await media_response(request,await resources(request),uid)
    @app.get('/transfer/login')
    async def transfer_login(request:Request):
        """本地返回同站快传；旧Worker适配保留原桥接。"""
        import time
        from .bridge import sign
        r=await resources(request)
        if not r.p:return RedirectResponse('/auth/login?next=%2Ftransfer%2Flogin',303)
        r.auth.require(r.p,'transfer')
        if r.kind=='local':return RedirectResponse('/transfer/',303)
        from backend.app.security.http import AuthConfig
        origin=AuthConfig.from_origin(r.transfer_url).origin
        ticket=sign(r.transfer_secret,{'aud':'transfer-bridge','exp':time.time()+60,'nonce':secrets.token_hex(16),'uid':r.p['uid'],'role_id':r.p['role_uid'],'send':bool(r.p['permissions']['transfer']['can_create'])})
        response=await render(r,'admin/native-bridge.html',ticket=ticket,target=origin+'/bridge')
        response.headers['Content-Security-Policy']="default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action "+origin
        response.headers['Referrer-Policy']='origin'
        return response
    @app.get('/transfer')
    async def transfer_entry(request:Request):
        """本地进入同站快传，旧Worker仍使用显式来源配置。"""
        r=await resources(request)
        if r.kind=='local':return RedirectResponse('/transfer/',303)
        if r.transfer_url:return RedirectResponse(r.transfer_url,303)
        raise Error('尚未配置文件快传地址',503)
    @app.get('/')
    async def home():"""将根页面重定向到默认语言首页。""";return RedirectResponse('/en',307)
    @app.get('/api/public/{lang}/{table}/{uid}/description')
    async def public_description_text(request:Request,lang:str,table:str,uid:str):
        from .public_descriptions import public_description
        r=await resources(request)
        from .public_navigation import api_scope
        scope=await api_scope(r,request.query_params,table)
        return JSONResponse(await public_description(r.content,lang,table,uid,fixed_conditions=scope['conditions'] if scope else None),headers={'Cache-Control':'no-store'})

    @app.get('/api/public/publications/citations')
    async def public_saved_citations(request:Request):
        from .public_citations import saved_citations
        r=await resources(request)
        from .public_navigation import api_scope
        scope=await api_scope(r,request.query_params,'publications')
        return JSONResponse(await saved_citations(r.content,request.query_params.get('format',''),request.query_params.getlist('uid'),fixed_conditions=scope['conditions'] if scope else None),headers={'Cache-Control':'no-store'})

    @app.get('/api/public/people/{table}/facets/{field}')
    async def public_people_facet(request:Request,table:str,field:str):
        from .public_data import people_facet
        r=await resources(request)
        from .public_navigation import api_scope
        scope=await api_scope(r,request.query_params,table)
        return JSONResponse(await people_facet(r.content,table,field,request.query_params.get('page',1),fixed_conditions=scope['conditions'] if scope else None,lang=request.query_params.get('lang','zh')),headers={'Cache-Control':'no-store'})

    if static_root:
        from transfer.backend.integration import install
        install(app,resources,static_root)

    @app.get('/{lang}/n/{nav}')
    @app.get('/{lang}/n/{nav}/{uid}')
    async def public_navigation_entry(request:Request,lang:str,nav:str,uid:str=None):
        return await public(request,lang,uid=uid,nav=nav)

    @app.get('/{lang}')
    @app.get('/{lang}/{table}')
    @app.get('/{lang}/{table}/{uid}')
    async def public(request:Request,lang:str,table:str=None,uid:str=None,nav:str=None):
        """从原生字段组合访客列表、详情、首页和翻译内容。"""
        if lang not in ('zh','en') or (table and table not in CONTENT):raise Error('页面不存在',404)
        from .public_data import public_listing,public_media_map,trim_snippets
        fragment=request.headers.get('x-public-fragment')=='1'
        home_mode=request.query_params.get('home')=='1'
        r=await resources(request);data={};detail=None;pages=None;home_pages={}
        from .public_navigation import resolve,visitor_query,query_url,list_return,query_identity
        scope=None
        if nav:
            if len(request.query_params.getlist('nv'))>1:raise Error('导航版本重复')
            scope=await resolve(r,nav,stamp=request.query_params.get('nv'));table=scope['table']
        if fragment and (not table or uid):raise Error('仅列表支持分片读取',400)
        fixed=scope['conditions'] if scope else None
        list_path='/'+lang+('/n/'+nav if nav else '/'+table if table else '')
        query=visitor_query(request.query_params,table,scoped=bool(scope)) if table and not uid else {}
        home_mode=query.get('home')=='1'
        if table and not uid and not fragment:
            canonical=query_url(list_path,query)
            actual=request.url.path+('?' +request.url.query if request.url.query else '')
            if actual!=canonical:return RedirectResponse(canonical,303)
        site_options={}
        site_rows=await r.sql.query('SELECT homepage_publication_limit,homepage_news_limit,homepage_project_limit,homepage_student_limit,homepage_patent_limit,publication_citation_style FROM site_settings WHERE is_active=1 ORDER BY id LIMIT 1')
        site_options=site_rows[0] if site_rows else {}
        if uid:
            detail=await r.content.get(table,uid,public=True,fixed_conditions=fixed)
            if table not in ('profiles','courses','news'):
                return RedirectResponse(query_url(list_path,{'f.uid':uid})+'#record-'+quote(uid,safe=''),status_code=303)
            data[table]=[]
        elif table:
            pages=await public_listing(r,table,query,site_options,home=home_mode,fixed_conditions=fixed)
            data[table]=pages['rows']
        else:
            from .public_home import homepage_rows
            data,home_pages=await homepage_rows(r,site_options)
        media_map=await public_media_map(r,{table:[detail]} if detail else data)
        # Translation is a presentation overlay; original title/name fields remain unchanged.
        if lang=='en':
            from .translation_sources import overlay
            for t,rows in data.items():
                for row in rows+([detail] if detail and t==table else []):
                    await overlay(r.sql,t,row)
        for t,rows in data.items():
            for row in rows+([detail] if detail and t==table else []):
                if row is not detail:trim_snippets(row,t)
                for field in ('student_id','source_citation','abstract'):row.pop(field,None)
                if t=='projects':row.pop('summary',None)
                if row.get('contact_visibility')!='public':
                    for field in (('phone',) if not table and t=='profiles' else ('email','phone','office')):row[field]=None
        if detail and table=='news':
            from .news_body import news_html
            pdf_settings=await r.sql.query('SELECT news_pdf_watermark,news_pdf_allow_download FROM global_settings LIMIT 1')
            pdf_settings=pdf_settings[0] if pdf_settings else {}
            detail['body_html']=await news_html(r.sql,detail.get('content') or '',detail.get('content_format') or 'plain',public_options={'lang':lang,'watermark':pdf_settings.get('news_pdf_watermark') or '', 'allow_download':pdf_settings.get('news_pdf_allow_download')==1})
        def next_url(t,page):
            return query_url(list_path if scope else '/'+lang+'/'+t,page['query']|{'page':page['page']+1}|({'nv':scope['stamp']} if scope else {})) if page['page']<page['pages'] else ''
        for t,page in home_pages.items():page['next_url']=next_url(t,page)
        if pages:
            pages['next_url']=next_url(table,pages);pages['query_id']=query_identity(pages['query'])
        back_url=list_return(request.query_params.get('from'),list_path,table,scope) if uid else list_path
        def detail_url(t,key):
            base=list_path if scope else '/'+lang+'/'+t
            state=query if pages and t==table else {}
            params={'from':query_url(base,state)}|({'nv':scope['stamp']} if scope else {})
            return base+'/'+quote(key,safe='')+'?'+urlencode(params)
        def language_url(code):
            target='/'+code+request.url.path[3:]
            if not uid:return query_url(target,query)
            switched='/'+code+list_path[3:]
            params={'from':list_return(request.query_params.get('from'),switched,table,scope)}|({'nv':scope['stamp']} if scope else {})
            return target+'?'+urlencode(params)

        values={'lang':lang,'section':'public','data':data,'detail':detail,'content_modules':CONTENT,'public_table':table,
                'media_map':media_map,'pages':pages,'home_pages':home_pages,'home_mode':home_mode,'public_options':site_options,
                'page_url':lambda p:query_url(list_path,(pages['query'] if pages else {})|{'page':p}|({'nv':scope['stamp']} if scope else {})),
                'public_list_path':list_path,'public_scope':scope,
                'public_language_urls':{code:language_url(code) for code in ('zh','en')},
                'public_back_url':back_url,
                'public_return_url':request.url.path+'?'+urlencode({'from':back_url}|({'nv':scope['stamp']} if scope else {})) if uid else query_url(list_path,query),
                'public_detail_url':detail_url}
        if fragment:
            markup=r.renderer.render('public/list-rows.html',**values,table=table,rows=data[table],title_field=TITLE,modules=MODULES)
            return JSONResponse({'html':markup,'table':table,'lang':lang,'home':home_mode,'page':pages['page'],
                                 'size':pages['size'],'total':pages['total'],'next_url':pages['next_url'],
                                 'query_id':pages['query_id'],'nav':scope['slug'] if scope else '', 'nav_stamp':scope['stamp'] if scope else ''},headers={'Cache-Control':'no-store'})
        from .public_data import people_facets
        values['people_facets']=await people_facets(r.content,table,fixed_conditions=fixed,lang=lang,query=query) if table and not uid else []
        response=await render(r,'public/native.html',**values)
        response.headers['Cache-Control']='no-store'
        return response

    return app
