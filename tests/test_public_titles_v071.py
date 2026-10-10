import asyncio,re
import pytest
from test_media_management_step2 import fixture
from backend.app.native.catalog import MODULES,PUBLIC_MODULES_EN,public_modules
run=asyncio.run
def title(response):
 assert response.status_code==200
 return re.search(r'<title>(.*?)</title>',response.text,re.S).group(1).strip()
@pytest.mark.parametrize('table',list(PUBLIC_MODULES_EN))
def test_lists_both_languages(fixture,table):
 c,r=fixture
 run(r.sql.batch([('UPDATE site_settings SET site_name=?,site_name_en=?',('中文站点','My Academic Website'))]))
 assert title(c.get('/en/'+table))==PUBLIC_MODULES_EN[table]+' · My Academic Website'
 assert title(c.get('/zh/'+table))==MODULES[table]+' · 中文站点'
 assert '<h1 class="visually-hidden">'+PUBLIC_MODULES_EN[table]+'</h1>' in c.get('/en/'+table).text

def test_empty_english_name_and_home_seo_keep_header_rule(fixture):
 c,r=fixture
 run(r.sql.batch([('UPDATE site_settings SET site_name=?,site_name_en=NULL,seo_title=?',('中文站点','中文首页'))]))
 a=c.get('/en/publications');assert title(a)=='Publications · Academic Website'
 assert '中文站点' in a.text # Existing header fallback remains available.
 assert title(c.get('/en'))=='Academic Website'
 assert title(c.get('/zh'))=='中文首页'
 run(r.sql.batch([('UPDATE site_settings SET seo_title=?',('Academic Research',))]))
 assert title(c.get('/en'))=='Academic Research'
 assert public_modules('zh') is MODULES and MODULES['publications']=='论文'

def test_detail_english_name_and_admin_labels(fixture):
 c,r=fixture
 run(r.sql.batch([("INSERT INTO profiles(uid,name,name_en,visibility,is_active) VALUES('title-profile','王老师','Professor Wang','public',1)",())]))
 assert title(c.get('/en/profiles/title-profile')).startswith('Professor Wang · ')
 assert title(c.get('/zh/profiles/title-profile')).startswith('王老师 · ')
 assert '科研项目' in c.get('/admin').text

def test_fragment_receives_localized_modules(fixture):
 from unittest.mock import patch
 c,r=fixture
 with patch.object(r.renderer,'render',wraps=r.renderer.render) as render:
  response=c.get('/en/publications',headers={'X-Public-Fragment':'1'})
  assert response.status_code==200
  calls=[x for x in render.call_args_list if x.args[0]=='public/list-rows.html']
  assert calls and calls[-1].kwargs['modules']['publications']=='Publications'
