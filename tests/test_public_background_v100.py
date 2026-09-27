"""Shared decorative layer is public-only and has no server-side dependencies."""
from test_accounts_regression import fixture


def test_public_background_assets_and_no_admin_changes(fixture):
    c,r=fixture
    for url in ('/en','/zh','/en/profiles','/en/publications','/en/contact','/auth/login?lang=en','/transfer/?lang=en'):
        reply=c.get(url);assert reply.status_code==200,url
        assert reply.text.count('aria-hidden="true"></div>')>=1
        assert 'class="public-ambient' in reply.text
        assert reply.text.count('public-background.css?v=0.15.102')==1
        assert reply.text.count('public-background.js?v=0.15.102')==1
        assert 'data-reading-choice="large"' in reply.text
    assert 'public-ambient--home' in c.get('/en').text
    for url in ('/admin','/admin/transfer'):
        html=c.get(url).text
        assert 'public-background.' not in html and 'class="public-ambient' not in html
    for path in ('css/public-background.css','js/public-background.js'):
        assert c.get('/assets/shared/'+path).status_code==200
