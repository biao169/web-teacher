import pytest
from test_accounts_regression import fixture
from backend.app.public_performance import PublicPerformance

@pytest.mark.parametrize('value',[0,1,2])
def test_prefetch_configuration_reaches_real_html_and_cache(fixture,value):
 c,r=fixture;c.cookies.clear();r.public_performance=PublicPerformance(public_nav_prefetch_concurrency=value)
 first=c.get('/en');assert first.status_code==200
 assert f'data-public-nav-prefetch-concurrency="{value}"' in first.text
 assert '/assets/public/js/public-prefetch.js?v=0.16.060' in first.text
 second=c.get('/en');assert second.headers['x-public-page-cache']=='HIT' and second.content==first.content
 asset=c.get('/assets/public/js/public-prefetch.js');assert asset.status_code==200 and 'text/javascript' in asset.headers['content-type']

def test_prefetch_is_not_a_new_representation(fixture):
 c,r=fixture;c.cookies.clear()
 first=c.get('/en/projects',headers={'Accept':'text/html'})
 navigation=c.get('/en/projects')
 assert first.content==navigation.content and first.headers['etag']==navigation.headers['etag']
 assert 'X-Public-Prefetch' not in first.headers['vary']
