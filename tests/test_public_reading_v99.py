"""Reading controls share the public header; no backend preference or schema changes."""
from test_accounts_regression import fixture


def test_public_header_controls_and_early_preference_script(fixture):
    c,r=fixture
    for path in ('/en','/zh','/en/profiles','/en/publications','/en/contact','/transfer/?lang=en','/transfer/?lang=zh','/auth/login?lang=en'):
        response=c.get(path);assert response.status_code==200,path
        html=response.text
        assert 'data-public-reading' in html,path
        assert html.count('data-reading-choice="standard"')==1,path
        assert html.count('data-reading-choice="large"')==1,path
        assert html.count('/assets/shared/js/reading.js?v=0.15.101')==1,path
        assert '<script src="/assets/shared/js/reading.js?v=0.15.101"></script>' in html
        assert 'public-theme.css?v=0.15.102' in html
    admin=c.get('/admin').text
    assert 'data-public-reading' not in admin
    assert 'data-reading-choice' not in admin
    assert 'public-theme.css' not in admin
