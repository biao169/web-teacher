"""Shared template context; no route registration or task execution."""
from fastapi.responses import HTMLResponse
from .catalog import MODULES,TITLE,Error,label
from .auth import sha

def renderer():
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
        from .maintenance_access import allowed as maintenance_allowed
        if maintenance_allowed(r.p):menu.append({'key':'runtime-maintenance','label':'运行维护','url':'/admin/runtime-maintenance','icon':'maintenance','locked':False})
        if r.p and r.p.get('is_system') and not r.p.get('must_change_password') and r.p.get('permissions',{}).get('data_tools',{}).get('can_view'):
            menu.append({'key':'site-sync','label':'两站同步','url':'/admin/site-sync','icon':'sync','locked':False})
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
    return render
