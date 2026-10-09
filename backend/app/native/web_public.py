"""Public routes, installed on an existing application."""
import secrets,hmac
from urllib.parse import quote,urlencode
from fastapi import Request
from fastapi.responses import JSONResponse,RedirectResponse
from .catalog import CONTENT,TITLE,MODULES,Error
from .web_common import payload

def public_headers(request,r,revision,fragment=False,form=False):
    headers={'Vary':'Cookie, Authorization, X-Public-Fragment','X-Public-Revision':revision}
    ttl=r.public_performance.public_cache_ttl_seconds
    if r.p or request.headers.get('authorization') or form or not ttl:
        headers['Cache-Control']='no-store'
    elif fragment and request.query_params.get('_rev')==revision:
        headers['Cache-Control']=f'public, max-age={ttl}'
    else:
        # Unversioned HTML must see current revision and login state on navigation.
        headers['Cache-Control']='private, no-cache'
    return headers

def install(app,factory,resources,csrf,render):
    async def contact_response(r,lang,values=None,message='',success=False,status=200):
        from .public_contact import form_context
        ctx=await form_context(r,lang,values,strict=not bool(message and not success))
        ctx.update(contact_message=message,contact_success=success)
        response=await render(r,'public/action.html',lang=lang,kind='contact',**ctx)
        response.status_code=status;response.headers['Cache-Control']='no-store'
        r.config.set_cookie(response,'public-form',ctx['challenge'],600)
        return response

    @app.get('/api/public/cache-revision')
    async def cache_revision(request:Request):
        from .public_revision import revision
        from .auth import Auth,sha
        r=factory(request);principal=await Auth(r.sql,r.passwords).principal(request.cookies.get(r.config.name('session')))
        return JSONResponse({'revision':await revision(r.sql),'identity':sha(principal['csrf']) if principal else ''},headers={'Cache-Control':'no-store'})
    @app.get('/{lang}/contact')
    async def public_form(request:Request,lang:str='en'):
        """Render public registration/contact with a short-lived form token."""
        if lang not in ('zh','en'):raise Error('页面不存在',404)
        r=await resources(request)
        success=request.cookies.get(r.config.name('contact-result'))=='sent'
        response=await contact_response(r,lang,values={'news_uid':request.query_params.get('news','')},success=success,message=('Your message has been sent.' if lang=='en' else '留言已提交。') if success else '')
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
            if not token or not r.config.origin_matches(request) or not hmac.compare_digest(str(data.get('challenge','')),token):raise Error('表单已过期，请刷新',403)
            if any(not isinstance(data.get(key,''),str) for key in ('name','email','subject','content','news_uid')):raise Error('请求格式不正确')
            await contact(r,data,request.client.host if request.client else 'worker')
        except Error as exc:
            message=error_text(exc.message,lang)
            if wants_json:
                challenge=secrets.token_urlsafe(32);response=JSONResponse({'ok':False,'message':message,'challenge':challenge},status_code=exc.status,headers={'Cache-Control':'no-store'});r.config.set_cookie(response,'public-form',challenge,600);return response
            return await contact_response(r,lang,form_values(data),message,status=exc.status)
        if wants_json:return JSONResponse({'ok':True,'message':'Your message has been sent.' if lang=='en' else '留言已提交。'},headers={'Cache-Control':'no-store'})
        response=RedirectResponse('/'+lang+'/contact'+('?' +urlencode({'news':data['news_uid']}) if data.get('news_uid') else ''),303);r.config.set_cookie(response,'contact-result','sent',60);return response
    @app.api_route('/media/{uid}',methods=['GET','HEAD'])
    async def media(request:Request,uid:str):
        """公开正文、封面和PDF阅读复用同一鉴权及分段读取接口。"""
        from .media_response import media_response
        return await media_response(request,await resources(request),uid)
    @app.get('/transfer')
    async def transfer_entry(request:Request):
        """本地进入同站快传，旧Worker仍使用显式来源配置。"""
        r=await resources(request)
        if r.kind=='local':return RedirectResponse('/transfer/',303)
        if r.transfer_url:return RedirectResponse(r.transfer_url,303)
        raise Error('尚未配置文件快传地址',503)
    # Use the configured origin and raw database; cookies never broaden sitemap visibility.
    @app.get('/robots.txt')
    async def crawler_rules(request:Request):
        from .public_seo import robots
        return robots(factory(request).config.origin)
    @app.get('/sitemap.xml')
    async def sitemap_index(request:Request):
        from .public_seo import index
        return await index(factory(request))
    @app.get('/sitemap-home.xml')
    async def sitemap_home(request:Request):
        from .public_seo import xml
        origin=factory(request).config.origin
        return xml('urlset',[origin+'/en',origin+'/zh'])
    @app.get('/sitemap-{table}-{part}.xml')
    async def sitemap_chunk(request:Request,table:str,part:int):
        from .public_seo import chunk
        return await chunk(factory(request),table,part)
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
        from .public_revision import revision
        public_revision=getattr(r,'public_revision',None) or await revision(r.sql)
        request.state.public_revision=public_revision
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
        site_rows=await r.sql.query('SELECT uid,site_name,site_name_en,hero_title,hero_subtitle,footer_text,homepage_profile_uid,homepage_publication_limit,homepage_news_limit,homepage_project_limit,homepage_student_limit,homepage_patent_limit,publication_citation_style,logo_key,favicon_key,seo_title,seo_description FROM site_settings WHERE is_active=1 ORDER BY id LIMIT 1')
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
        def versioned(url):return url+('&' if '?' in url else '?')+urlencode({'_rev':public_revision}) if url else ''
        for page in home_pages.values():page['next_url']=versioned(page['next_url'])
        if pages:
            pages['next_url']=versioned(next_url(table,pages));pages['query_id']=query_identity(pages['query'])
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

        from .auth import sha
        values={'public_identity':sha(r.p['csrf']) if r.p else '', 'public_revision':public_revision,'public_stream_concurrency':r.public_performance.public_stream_concurrency,'lang':lang,'section':'public','data':data,'detail':detail,'content_modules':CONTENT,'public_table':table,
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
                                 'query_id':pages['query_id'],'nav':scope['slug'] if scope else '', 'nav_stamp':scope['stamp'] if scope else ''},headers=public_headers(request,r,public_revision,fragment=True))
        from .public_data import people_facets
        values['people_facets']=await people_facets(r.content,table,fixed_conditions=fixed,lang=lang,query=query) if table and not uid else []
        # Canonicalize default list controls; retain meaningful paging/filter state.
        seo_query=dict(query)
        for key,default in (('page','1'),('size','10'),('direction','asc')):
            if str(seo_query.get(key,''))==default:seo_query.pop(key,None)
        seo_query.pop('sort',None)
        if uid:seo_query={}
        values['seo_canonical']=r.config.origin+query_url(request.url.path,seo_query)
        values['seo_alternates']={code:r.config.origin+query_url('/'+code+request.url.path[3:],seo_query) for code in ('en','zh')}
        if detail and table=='news' and detail.get('allow_comments')==1:
            from .public_contact import form_context
            values.update(await form_context(r,lang,news=detail))
        response=await render(r,'public/native.html',**values)
        if 'challenge' in values:r.config.set_cookie(response,'public-form',values['challenge'],600)
        response.headers.update(public_headers(request,r,public_revision,form='challenge' in values))
        return response

def create_public_app(factory,static_root=None):
    from .web_common import create_base
    app,resources,csrf,render=create_base(factory,static_root,areas=("shared","public"),sync_assets=False)
    app.state.web_role="public"
    install(app,factory,resources,csrf,render)
    return app
