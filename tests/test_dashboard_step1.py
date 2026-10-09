"""Real HTTP/SQLite counts: no listing reads and no cross-role disclosure."""
from unittest.mock import AsyncMock
import pytest
from test_accounts_regression import fixture,run,role,user
from backend.app.native.content import Content
from backend.app.native.catalog import TABLES,Error


def test_first_html_never_lists_or_counts(fixture,monkeypatch):
    c,r=fixture
    listing=AsyncMock(side_effect=AssertionError('listing on first HTML'))
    count=AsyncMock(side_effect=AssertionError('count on first HTML'))
    monkeypatch.setattr(Content,'listing',listing);monkeypatch.setattr(Content,'count',count)
    response=c.get('/admin');assert response.status_code==200
    assert 'data-dashboard-count="profiles"' in response.text and '>—</strong>' in response.text
    listing.assert_not_awaited();count.assert_not_awaited()


def test_summary_matches_existing_listing_and_reads_scalars(fixture,monkeypatch):
    c,r=fixture
    expected={t:run(r.content.listing(t,r.p))['total'] for t in TABLES if r.p['permissions'].get(t,{}).get('can_view')}
    queries=[];original=r.sql.query
    async def query(sql,*args,**kwargs):
        queries.append(sql);return await original(sql,*args,**kwargs)
    monkeypatch.setattr(r.sql,'query',query)
    monkeypatch.setattr(Content,'listing',AsyncMock(side_effect=AssertionError('listing in summary')))
    response=c.get('/api/admin/dashboard-counts',headers={'Accept':'application/json'})
    assert response.status_code==200 and response.json()=={'counts':expected}
    assert response.headers['cache-control']=='no-store'
    counts=[q for q in queries if q.lower().startswith('select count(*)')]
    assert len(counts)==len(expected)
    assert all(' order by ' not in q.lower() and ' limit ' not in q.lower() for q in counts)
    assert len(queries)<=len(expected)+3


def test_restricted_role_only_sees_visible_permitted_records(fixture):
    c,r=fixture
    run(r.sql.batch([('INSERT INTO profiles(uid,name,visibility) VALUES (?,?,?)',('hidden-fixture','Private','hidden'))]))
    target=role(r);actor=user(r,target['uid'])
    token=run(r.auth.login(actor['username'],'Synthetic-only-password-035','test'))
    p=run(r.auth.principal(token));c.cookies.set('ts_session',token)
    response=c.get('/api/admin/dashboard-counts',headers={'Accept':'application/json'})
    assert response.status_code==200
    assert response.json()=={'counts':{'profiles':run(r.content.listing('profiles',p))['total']}}
    with pytest.raises(Error):run(r.content.count('auth_users',p))
    with pytest.raises(Error):run(r.content.count('profiles;DROP TABLE profiles',p))


def test_anonymous_and_password_change_blocked(fixture):
    c,r=fixture;c.cookies.clear()
    response=c.get('/api/admin/dashboard-counts',headers={'Accept':'application/json'})
    assert response.status_code==401
    run(r.sql.batch([('UPDATE auth_users SET must_change_password=1 WHERE uid=?',(r.p['uid'],))]))
    token=run(r.auth.login('list-test-admin','Synthetic-test-only-032','test'));c.cookies.set('ts_session',token)
    response=c.get('/api/admin/dashboard-counts',headers={'Accept':'application/json'})
    assert response.status_code==403 and response.json()['code']=='password_required'
