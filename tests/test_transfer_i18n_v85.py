"""Integrated public navigation and bilingual initial render; no transport policy changes."""
import re
from test_accounts_regression import fixture,run

def test_default_english_reuses_main_brand_and_language_links(fixture):
    c,r=fixture
    response=c.get('/transfer/?folder=abc')
    assert response.status_code==200
    html=response.text
    assert '<html lang="en">' in html and 'Files, effortlessly delivered.' in html
    assert 'class="academic-header"' in html and 'data-public-language="zh"' in html
    assert '/transfer/?folder=abc&amp;lang=zh' in html
    assert '/auth/logout' in html and 'href="/admin"' in html
    # Static interface content is completely English, except the language switch.
    main=re.search(r'<main\b[^>]*>(.*?)</main>',html,re.S).group(1)
    assert not re.search('[\u4e00-\u9fff]',re.sub(r'<[^>]+>','',main))
    assert c.get('/assets/shared/vendor/bootstrap.min.css').status_code==200
    assert c.get('/transfer-static/transfer-i18n-catalog.js').status_code==200

def test_query_then_cookie_language_and_guest_login_return(fixture):
    c,r=fixture;c.cookies.clear();c.cookies.set('public_language','zh')
    response=c.get('/transfer/?folder=abc')
    assert '<html lang="zh">' in response.text and '文件，轻松送达。' in response.text
    assert 'next=%2Ftransfer%2F%3Ffolder%3Dabc%26lang%3Dzh' in response.text
    assert '/auth/logout' not in response.text
    assert '<html lang="en">' in c.get('/transfer/?lang=en').text
    assert '<html lang="en">' in c.get('/transfer/?lang=invalid').text

def test_configured_navigation_is_shared_and_not_duplicated(fixture):
    c,r=fixture
    teacher=c.get('/en').text;transfer=c.get('/transfer/?lang=en').text
    for tag,cls in (('a','academic-brand'),('nav','academic-nav')):
        pattern=rf'<{tag} class="{cls}".*?</{tag}>'
        assert re.search(pattern,teacher,re.S).group()==re.search(pattern,transfer,re.S).group()
    assert transfer.count('class="academic-header"')==1
    # Shared header change does not alter normal teacher language links.
    assert 'href="/zh" data-public-language="zh"' in teacher
