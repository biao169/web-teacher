"""Public-only, bounded sitemap slices using the same visibility rules as HTML."""
from math import ceil
from urllib.parse import quote
from xml.etree.ElementTree import Element, SubElement, tostring
from fastapi.responses import Response
from .catalog import Error
from .content import Content
from .public_data import PUBLIC_FIELDS, BATCH_SIZE

DETAILS = frozenset(('profiles', 'courses', 'news'))
SLICE = 1000
NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'

def xml(kind, urls):
    root = Element(kind, xmlns=NS)
    for url in urls:
        item = SubElement(root, 'sitemap' if kind == 'sitemapindex' else 'url')
        SubElement(item, 'loc').text = url
    return Response(tostring(root, encoding='utf-8', xml_declaration=True), media_type='application/xml')

def robots(origin):
    # Crawl hints only: access control remains in authenticated routes and static mounts.
    denied = ('/admin', '/api/', '/auth/', '/transfer', '/health', '/backend/',
              '/deploy/', '/data/', '/database/', '/.git/', '/.env', '/install.sh')
    return Response('User-agent: *\n' + ''.join('Disallow: '+p+'\n' for p in denied)
                    + 'Allow: /assets/public/\nAllow: /assets/shared/\n\nSitemap: '
                    + origin + '/sitemap.xml\n', media_type='text/plain')

async def stats(r, table):
    where, args = Content(r.sql, None).scope(table, public=True)
    count = (await r.sql.query(f'SELECT count(*) n FROM "{table}" WHERE '+where, args))[0]['n']
    pages = max(1, ceil(count / BATCH_SIZE))
    return where, args, count, pages

async def index(r):
    urls = [r.config.origin+'/sitemap-home.xml']
    for table in PUBLIC_FIELDS:
        _, _, count, pages = await stats(r, table)
        total = pages + (count if table in DETAILS else 0)
        urls.extend(r.config.origin+f'/sitemap-{table}-{part}.xml' for part in range(1, ceil(total/SLICE)+1))
    if len(urls)>50000:raise Error('站点地图索引超过协议容量',503)
    return xml('sitemapindex', urls)

async def chunk(r, table, part):
    if table not in PUBLIC_FIELDS or not 1 <= part <= 1000000:raise Error('站点地图不存在',404)
    where, args, count, pages = await stats(r, table)
    start = (part-1)*SLICE; end = min(start+SLICE, pages+(count if table in DETAILS else 0))
    if start>=end:raise Error('站点地图不存在',404)
    paths = ['/'+table+('' if n==0 else '?page='+str(n+1)) for n in range(start,min(end,pages))]
    if end>pages and table in DETAILS:
        offset=max(start,pages)-pages; limit=end-max(start,pages)
        rows=await r.sql.query(f'SELECT uid FROM "{table}" WHERE {where} ORDER BY id LIMIT ? OFFSET ?',(*args,limit,offset))
        paths.extend('/'+table+'/'+quote(str(row['uid']),safe='') for row in rows)
    return xml('urlset', (r.config.origin+'/'+lang+path for path in paths for lang in ('en','zh')))
