"""Safe footer HTML and configured links; source text is never a template program."""
import re,unicodedata
from urllib.parse import urlsplit,urlunsplit,quote,unquote
from justhtml import JustHTML,SanitizationPolicy,UrlPolicy,UrlRule
from backend.app.domain.richtext import plain_to_html

CLASSES={'footer-grid','footer-brand','footer-meta','footer-note','footer-links','footer-nav','btn','btn-primary','btn-outline-secondary','nav-link'}
POLICY=SanitizationPolicy(
 allowed_tags={'div','section','nav','p','br','span','small','h2','h3','strong','b','em','i','ul','ol','li','a','hr'},
 allowed_attributes={'*':{'class'},'nav':{'data-footer-navigation','aria-label'},'a':{'href','title','target','rel','data-navigation-id'}},
 url_policy=UrlPolicy(allow_rules={('a','href'):UrlRule(allowed_schemes={'http','https','mailto'},allow_relative=True,allow_fragment=True,resolve_protocol_relative=None)}))
EXAMPLE='''<div class="footer-grid">
  <section class="footer-brand">
    <strong>教师与科研团队</strong>
    <p>教学 · 科研 · 学术交流</p>
  </section>
  <section class="footer-meta">
    <p>联系邮箱：<a href="mailto:teacher@example.com">teacher@example.com</a></p>
    <nav data-footer-navigation aria-label="页脚导航"></nav>
  </section>
</div>
<p class="footer-note">© 2026 教师与科研团队</p>'''

def safe_href(value,mail=True):
    if not isinstance(value,str) or not value or len(value)>4096:return ''
    decoded=unquote(value)
    if any(unicodedata.category(c).startswith('C') for c in decoded) or '\\' in decoded or decoded.startswith('//'):return ''
    try:
        u=urlsplit(value)
        if u.scheme in ('http','https') and u.hostname and not u.username and not u.password:return value
        if mail and u.scheme=='mailto' and u.path and not u.netloc:return value
        if not u.scheme and not u.netloc and value.startswith(('/','#')):return value
    except ValueError:pass
    return ''

def navigation_link(row,lang):
    from .navigation import has_public_conditions
    if has_public_conditions(row.get('path')):
        from .navigation import parse_public_path,PUBLIC_LOCATIONS
        from .catalog import Error
        from .public_navigation import SLUG
        try:parse_public_path(row['path'])
        except Error:return None
        if not SLUG.fullmatch(row.get('url_name') or '') or row.get('location') not in PUBLIC_LOCATIONS or row.get('kind') not in ('route','button','',None) or row.get('fragment'):return None
        row=dict(row,path='/'+lang+'/n/'+row['url_name'])
    url=safe_href(row.get('path') or '',mail=False)
    if not url:return None
    parsed=urlsplit(url)
    if not parsed.scheme and re.match(r'^/(zh|en)(/|$)',parsed.path):
        url=urlunsplit(parsed._replace(path=re.sub(r'^/(zh|en)(?=/|$)','/'+lang,parsed.path)))
    if row.get('fragment'):
        url=url.split('#',1)[0]+'#'+quote(str(row['fragment']).lstrip('#'),safe='-._~')
    style=row.get('style');classes='btn btn-primary' if style=='primary' else 'btn btn-outline-secondary' if style=='secondary' or row.get('kind')=='button' else 'nav-link'
    return {'uid':row['uid'],'url':url,'title':row['title'],'classes':classes,'icon':row.get('icon') if row.get('icon') in ('file','user','book','search') else ''}

async def navigation(r,lang):
    from .public_navigation import visible_scopes
    allowed=visible_scopes(r.p)
    rows=await r.sql.query("SELECT * FROM navigation_items WHERE enabled=1 AND visibility IN ("+','.join('?' for _ in allowed)+") AND (location IN ('header','hero','footer') OR location IS NULL OR location='') ORDER BY sort_order,id",tuple(allowed))
    result={'header':[],'hero':[],'footer':[]}
    for row in rows:
        if lang=='en':
            from .translation_sources import overlay
            await overlay(r.sql,'navigation_items',row)
        item=navigation_link(row,lang)
        if item:result[row['location'] if row['location'] in ('hero','footer') else 'header'].append(item)
    return result

def footer_html(value,links_html=''):
    """Sanitize every render (including translations/imports), then fill one controlled slot."""
    value=value if isinstance(value,str) else ''
    # Legacy plain text keeps its newlines. No Jinja evaluation and no user script/style.
    markup=value if re.search(r'<[A-Za-z!/]',''+value) else plain_to_html(value)
    doc=JustHTML(markup,fragment=True,policy=POLICY)
    for node in doc.query('*'):
        if 'class' in node.attrs:
            names=[c for c in node.attrs['class'].split() if c in CLASSES]
            if names:node.attrs['class']=' '.join(dict.fromkeys(names))
            else:node.attrs.pop('class',None)
        if node.name=='a':
            url=safe_href(node.attrs.get('href',''))
            if url:node.attrs['href']=url
            else:node.attrs.pop('href',None)
            if node.attrs.get('target')=='_blank':node.attrs['rel']='noopener noreferrer'
            else:node.attrs.pop('target',None);node.attrs.pop('rel',None)
            node.attrs.pop('data-navigation-id',None)
    slots=doc.query('nav[data-footer-navigation]')
    generated=JustHTML(links_html,fragment=True,policy=POLICY)
    nodes=list(generated.root.children)
    if slots:
        first=slots[0]
        for child in list(first.children):first.remove_child(child)
        for node in nodes:first.parent.insert_before(node,first)
        first.parent.remove_child(first)
        for extra in slots[1:]:
            if extra.parent:extra.parent.remove_child(extra)
    else:
        for node in nodes:doc.root.append_child(node)
    return doc.to_html(pretty=False).strip()
