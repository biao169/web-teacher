"""Public transfer presentation; reuse the teacher site's navigation and identity."""
import json
from urllib.parse import urlencode

async def portal_context(main, request, root):
    from backend.app.native.public_footer import navigation
    from backend.app.native.public_data import public_media_map
    from backend.app.native.translation_sources import overlay
    lang=request.query_params.get('lang') or request.cookies.get('public_language','en')
    lang=lang if lang in ('en','zh') else 'en'
    rows=await main.sql.query('SELECT uid,site_name,site_name_en,logo_key,favicon_key FROM site_settings WHERE is_active=1 ORDER BY id LIMIT 1')
    site=dict(rows[0]) if rows else {}
    if lang=='en':await overlay(main.sql,'site_settings',site)
    site['title']=(site.get('site_name_en') if lang=='en' else '') or site.get('site_name') or ('Academic website' if lang=='en' else '教师个人网站')
    site.setdefault('site_name_en','')
    media=await public_media_map(main,{'site_settings':[site]})
    site['logo_uid']=media.get(site.get('logo_key'))
    links=await navigation(main,lang)
    # Only share-link and language parameters belong in the return URL.
    query={k:request.query_params[k] for k in ('folder','lang') if k in request.query_params}
    urls={code:'/transfer/?'+urlencode({**query,'lang':code}) for code in ('zh','en')}
    principal=main.p
    header=main.renderer.render('public/header.html',site=site,lang=lang,public_nav=links['header'],
        authenticated=bool(principal),principal=principal,csrf=principal['csrf'] if principal else '',
        admin_menu=[{'locked':False}] if principal and any(p.get('can_view') for p in principal['permissions'].values()) else [],
        transfer_return_url=urls[lang],transfer_language_urls=urls)
    return {'public_header':header,'transfer_lang':lang,'transfer_messages':messages(root)}

_catalog=None
def messages(root):
    global _catalog
    if _catalog is None:
        source=(root/'transfer/frontend/native/transfer-i18n-catalog.js').read_text(encoding='utf-8')
        _catalog=json.loads(source.removeprefix('export default ').rstrip(';\n'))
    return _catalog


async def management_context(r, query):
    """Reuse the same permission-scoped listing and settings for either admin shell."""
    from backend.app.native.auth import sha
    from .management import Management, STATES
    values = await Management(r.service, r.p).listing(query)
    state, settings = await r.service.settings()
    return dict(values, user_key=sha('user:' + r.p['uid']), states=STATES,
                csrf=r.p['csrf'], state=state, settings=settings,
                can_send=bool(r.p.get('send')),
                max_file_bytes=9007199254740991 if r.service.indexed else 200*1024*1024)
