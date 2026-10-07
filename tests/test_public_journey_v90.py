"""Server-rendered navigation journeys, including no-JavaScript return and language links."""
from urllib.parse import urlsplit,parse_qs
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add,DOM
from test_public_navigation_v88 import entry
from test_public_stream_v46 import H,ids
from backend.app.native.public_navigation import encode_state

def link(html,attr,value=None):return next(a['href'] for _,a in DOM(html).tags if attr in a and (value is None or a[attr]==value))

@pytest.mark.parametrize('table',['profiles','courses','news'])
def test_filtered_detail_language_return_and_login_keep_same_entry(fixture,table):
 c,r=fixture;field='title' if table=='news' else 'name';entry(r,table,field,'限定',slug='journey')
 uid=add(r,table,'限定医疗',**({'is_active':1} if table=='profiles' else {}));add(r,table,'限定材料',**({'is_active':1} if table=='profiles' else {}))
 c.cookies.clear();state=encode_state({'q':'医疗'})
 listing=c.get('/en/n/journey?s='+state+'&direction=desc');assert ids(listing.text)==[uid]
 detail=c.get(link(listing.text,'data-person-link'));assert detail.status_code==200
 back=link(detail.text,'data-person-back');assert 's='+state in back and 'direction=desc' in back
 switch=link(detail.text,'data-public-language','zh');assert switch.isascii()
 chinese=c.get(switch);assert chinese.status_code==200
 backzh=link(chinese.text,'data-person-back');assert backzh.startswith('/zh/n/journey?') and 's='+state in backzh
 assert ids(c.get(backzh).text)==[uid]
 login=link(chinese.text,'data-auth-open');target=parse_qs(urlsplit(login).query)['next'][0]
 assert urlsplit(target).path=='/zh/n/journey/'+uid
 assert parse_qs(urlsplit(target).query)['from'][0]==backzh
 assert 'data-return-resolved' in chinese.text and 'data-language-resolved' in chinese.text

@pytest.mark.parametrize('bad',['https://evil.test/en/n/journey','//evil.test/en/n/journey','/en/projects','/en/n/other','/en/n/journey?s=!','/en/n/journey?nf=attack'])
def test_invalid_detail_return_falls_back_to_own_list(fixture,bad):
 c,r=fixture;entry(r,'courses','name','限定',slug='journey');uid=add(r,'courses','限定课')
 response=c.get('/en/n/journey/'+uid,params={'from':bad})
 assert response.status_code==200 and link(response.text,'data-person-back')=='/en/n/journey'

def test_fragments_keep_query_identity_and_changed_query_changes_identity(fixture):
 c,r=fixture;entry(r,'projects','name','限定',slug='journey')
 for i in range(22):add(r,'projects','限定医疗'+str(i),source='国家基金')
 first=c.get('/en/n/journey',params={'q':'医疗','f.source':'国家基金'},headers=H).json()
 second=c.get(first['next_url'],headers=H).json();third=c.get(second['next_url'],headers=H).json()
 assert first['query_id']==second['query_id']==third['query_id'] and len(set(ids(first['html'])+ids(second['html'])+ids(third['html'])))==22
 changed=c.get('/en/n/journey',params={'q':'材料'},headers=H).json()
 assert changed['query_id']!=first['query_id'] and changed['total']==0
 reset=c.get('/en/n/journey');assert 'data-query-id=' in reset.text
 assert link(reset.text,'data-person-reset')=='/en/n/journey'
