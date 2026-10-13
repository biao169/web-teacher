"""Shared HTML exposes a default affordance, never an authenticated rendering."""
import pytest
from justhtml import JustHTML
from test_accounts_regression import fixture

@pytest.mark.parametrize('lang',['zh','en'])
@pytest.mark.parametrize('kind',['local','r2'])
def test_shared_header_sign_in_visible_with_user_icon_before_js(fixture,lang,kind):
    c,r=fixture;r.kind=kind
    response=c.get('/'+lang+'/profiles');assert response.status_code==200
    assert response.headers['cache-control']=='public, max-age=1800'
    doc=JustHTML(response.text,sanitize=False)
    links=doc.query('[data-public-session] [data-auth-open]');assert len(links)==1
    assert 'hidden' not in links[0].attrs
    assert len(doc.query('[data-public-session] [data-auth-open] svg'))==1
    assert not doc.query('.academic-identity-pending')
    assert 'Checking identity' not in response.text and '身份确认中' not in response.text
    assert 'public-session.js?v=0.16.120' in response.text
    assert not doc.query('[data-public-session] input[name="_csrf"]')
    summary=c.get('/api/public/session-summary');assert summary.json()['authenticated'] is True
    assert 'no-store' in summary.headers['cache-control']
