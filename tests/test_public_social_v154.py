"""Platform values reach all shared public faculty views, including zero."""
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add

@pytest.mark.parametrize('lang',['zh','en'])
def test_platform_values_across_public_views(fixture,lang):
 c,r=fixture
 uid=add(r,'profiles','Metrics Teacher',is_active=1,is_featured=1,
         github='https://github.com/example',github_value=1234,
         google_scholar_value=0,dblp='https://dblp.org/example',
         personal_homepage_value=42,cnki_value=567)
 c.cookies.clear()
 for path in (f'/{lang}',f'/{lang}/profiles',f'/{lang}/profiles/{uid}'):
  response=c.get(path);assert response.status_code==200
  html=response.text
  for field,value in [('github',1234),('google_scholar',0),('personal_homepage',42),('cnki',567)]:
   assert f'data-platform-value="{field}">{value}</span>' in html
  assert 'href="https://github.com/example"' in html
  assert 'href="https://dblp.org/example"' in html
  assert 'data-platform-value="dblp"' not in html
  assert 'data-platform-value="orcid"' not in html
  assert 'href="0"' not in html and 'href="None"' not in html
