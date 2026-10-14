"""SSR and dynamic card definitions share the canonical icon macro, including empty lists."""
import json
from pathlib import Path
from html.parser import HTMLParser
from jinja2 import Environment,FileSystemLoader
from test_accounts_regression import fixture
from test_public_home_step2 import add
ROOT=Path(__file__).resolve().parents[1]

class Icons(HTMLParser):
    def __init__(self,html):super().__init__();self.templates=[];self.links=[];self.feed(html)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='template' and 'data-public-card-icon' in a:self.templates.append(a['data-public-card-icon'])
        if tag=='a' and a.get('class')=='person-icon' and 'data-person-link' in a:self.links.append(a)

def test_dom_fixtures_match_single_svg_source():
    macro=Environment(loader=FileSystemLoader(ROOT/'frontend/public/templates')).get_template('card-icons.html').module
    fixture=json.loads((ROOT/'tests/fixtures/public-card-icons-v109.json').read_text())
    assert fixture=={name:str(macro.icon(name)) for name in fixture}

def test_empty_and_populated_lists_include_inert_icons_and_accessible_ssr(fixture):
    c,r=fixture
    for lang in ('zh','en'):
        page=c.get('/'+lang+'/profiles');assert page.status_code==200
        assert set(Icons(page.text).templates)=={'chevron-down','box-arrow-up-right'}
    uid=add(r,'profiles','Card icon',name_en='Card icon English',is_active=1,bio='Biography')
    for lang,label in [('zh','查看详情'),('en','View details')]:
        page=c.get('/'+lang+'/profiles');icons=Icons(page.text)
        assert page.headers['x-teacher-render-ok']=='1'
        link=next(a for a in icons.links if '/profiles/'+uid in a['href'])
        assert link['title']==link['aria-label']==label
        assert '/assets/public/js/public-list.js?v=0.16.131' in page.text
