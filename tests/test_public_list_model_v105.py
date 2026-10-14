"""Only public presentation additions necessary for browser card parity."""
from test_translation_regression import fixture,source,run
from backend.app.native.public_read_model import build,ModelUnavailable
from backend.app.native.navigation import build_public_path
import pytest,json

def test_selected_public_citation_only_and_budget(fixture):
 _,r=fixture
 row=source(r,'publications','title','Paper',citation_gbt='DISPLAY_GBT',highlight_gbt='DISPLAY',citation_apa='OTHER_FORMAT',source_citation='SOURCE_PRIVATE')
 model=run(build(r,'publications','zh'));item=next(x for x in model['items'] if x['uid']==row['uid'])
 assert item['citation']=={'style':'gbt','text':'DISPLAY_GBT','highlight':'DISPLAY'}
 assert 'OTHER_FORMAT' not in json.dumps(model) and 'SOURCE_PRIVATE' not in json.dumps(model)
 run(r.sql.batch([("UPDATE site_settings SET publication_citation_style='apa' WHERE is_active=1",())]))
 model=run(build(r,'publications','en'));assert model['items'][0]['citation']['style']=='apa'
 run(r.sql.batch([('UPDATE publications SET citation_apa=? WHERE uid=?',('X'*4097,row['uid']))]))
 with pytest.raises(ModelUnavailable):run(build(r,'publications','en'))

def test_truncated_description_markers_do_not_change_filter_source(fixture):
 _,r=fixture;source(r,'students','bio','X'*3000)
 model=run(build(r,'students','zh'));item=model['items'][0]
 assert item['truncated_fields']==['bio'] and len(item['display']['bio'])==2001
 assert len(item['filter_values']['bio'])==3000
 assert '_truncated_fields' not in item['display']

def test_standard_page_hook_does_not_enable_home(fixture):
 client,r=fixture;source(r,'profiles','title','Shown')
 standard=client.get('/zh/profiles');assert standard.status_code==200 and 'data-public-list-local' in standard.text
 assert 'public-list.js?v=0.16.131' in standard.text
 home=client.get('/zh');assert 'data-public-list-local' not in home.text

@pytest.mark.parametrize('lang',['zh','en'])
def test_scripts_follow_page_capabilities(fixture,lang):
 client,r=fixture
 row=source(r,'profiles','title','Visible')
 def scripts(path):
  response=client.get(path);assert response.status_code==200
  return response.text
 standard=scripts(f'/{lang}/profiles')
 assert 'data-local-size="10"' in standard
 for name in ['public-list','public-query','public-stream','public-people','public-filters']:assert f'/{name}.js?' in standard
 assert '/public-authors.js?' not in standard
 detail=scripts(f'/{lang}/profiles/{row["uid"]}')
 for name in ['public-list','public-query','public-stream','public-filters','public-authors']:assert f'/{name}.js?' not in detail
 assert '/public-people.js?' in detail
 home=scripts(f'/{lang}')
 for name in ['public-list','public-query','public-filters']:assert f'/{name}.js?' not in home
 assert '/public-stream.js?' in home
 source(r,'publications','title','Paper')
 assert '/public-authors.js?' in scripts(f'/{lang}/publications')
 nav=source(r,'navigation_items','title','Fixed',path=build_public_path('profiles',[{'field':'title','operator':'contains','value':'Visible'}]),url_name='scripts-fixed',kind='route',location='header',enabled=1,visibility='public')
 fixed=scripts(f'/{lang}/n/scripts-fixed')
 assert '/public-list.js?' not in fixed
 for name in ['public-query','public-stream','public-people','public-filters']:assert f'/{name}.js?' in fixed
 for html in [standard,detail,home,fixed]:
  for name in ['public-session','public-auth','academic','public-controls']:assert f'/{name}.js?' in html
