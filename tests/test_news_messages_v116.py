import re
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add
from backend.app.native.public_actions import contact
from backend.app.native.catalog import Error

def setup(r):return add(r,'news','News message source',allow_comments=1)
def token(html):return re.search('name="challenge" value="([^"]+)"',html)[1]
def send(c,r,key,lang='en',**extra):
    html=c.get('/'+lang+'/news/'+key).text
    return c.post('/'+lang+'/contact',json={'challenge':token(html),'news_uid':key,'content':'PRIVATE_SENTINEL',**extra},headers={'Origin':r.config.origin,'Accept':'application/json'})

@pytest.mark.parametrize('lang',['en','zh'])
def test_embedded_news_form_and_private_source_admin(fixture,lang):
    c,r=fixture;key=setup(r)
    response=send(c,r,key,lang,message_type='contact',visibility='public')
    assert response.status_code==200,response.text
    row=run(r.sql.query('SELECT * FROM messages ORDER BY id DESC LIMIT 1'))[0]
    assert row['message_type']=='news:'+key and row['visibility']=='hidden' and row['content']=='PRIVATE_SENTINEL'
    listing=c.get('/admin/messages');assert listing.status_code==200
    detail=c.get('/admin/messages/'+row['uid']+'/view')
    assert detail.status_code==200 and '/zh/news/'+key in detail.text
    assert 'News message source' in detail.text
    c.cookies.clear();page=c.get('/'+lang+'/news/'+key)
    assert 'PRIVATE_SENTINEL' not in page.text
    assert 'data-contact-form' in page.text and 'data-auth-open' in page.text


def test_anonymous_policy_and_close_after_form_open(fixture):
    c,r=fixture;key=setup(r);c.cookies.clear()
    assert send(c,r,key).status_code==403
    run(r.sql.batch([('UPDATE global_settings SET allow_anonymous_messages=1',())]))
    assert send(c,r,key).status_code==200
    challenge=token(c.get('/en/news/'+key).text)
    run(r.sql.batch([('UPDATE news SET allow_comments=0 WHERE uid=?',(key,))]))
    assert 'data-contact-form' not in c.get('/en/news/'+key).text
    response=c.post('/en/contact',json={'challenge':challenge,'news_uid':key,'content':'Should fail'},headers={'Origin':r.config.origin,'Accept':'application/json'})
    assert response.status_code==403 and 'closed' in response.json()['message']
    assert len(run(r.sql.query('SELECT uid FROM messages WHERE message_type=?',('news:'+key,))))==1


@pytest.mark.parametrize('mutation',["visibility='hidden'","published_at='2999-01-01T00:00:00.000Z'"])
def test_unavailable_news_rejects_submissions_and_retains_native_draft(fixture,mutation):
    c,r=fixture;key=setup(r);challenge=token(c.get('/en/news/'+key).text)
    run(r.sql.batch([('UPDATE news SET '+mutation+' WHERE uid=?',(key,))]))
    response=c.post('/en/contact',data={'challenge':challenge,'news_uid':key,'content':'Keep this draft'},headers={'Origin':r.config.origin},follow_redirects=False)
    assert response.status_code==404 and 'Keep this draft' in response.text
    assert 'data-contact-form' in response.text
    assert not run(r.sql.query('SELECT uid FROM messages WHERE message_type=?',('news:'+key,)))


def test_native_errors_and_success_keep_news_context(fixture):
    c,r=fixture;key=setup(r);challenge=token(c.get('/en/news/'+key).text)
    body={'challenge':challenge,'news_uid':key,'content':'Keep draft','email':'bad'}
    response=c.post('/en/contact',data=body,headers={'Origin':r.config.origin},follow_redirects=False)
    assert response.status_code==422 and 'Keep draft' in response.text and 'name="news_uid"' in response.text
    body.update(challenge=token(response.text),email='')
    response=c.post('/en/contact',data=body,headers={'Origin':r.config.origin},follow_redirects=False)
    assert response.status_code==303 and response.headers['location']=='/en/contact?news='+key
    assert 'Your message has been sent.' in c.get(response.headers['location']).text


def test_insert_rechecks_news_switch_in_same_transaction(fixture):
    c,r=fixture;key=setup(r)
    with pytest.raises(Error):
        run(contact(r,{'news_uid':key,'content':'Blocked atomic write'},'test',before=[('UPDATE news SET allow_comments=0 WHERE uid=?',(key,))]))
    assert not run(r.sql.query('SELECT uid FROM messages WHERE message_type=?',('news:'+key,)))


def test_deleted_source_keeps_message_and_safe_admin_detail(fixture):
    c,r=fixture;key=setup(r);assert send(c,r,key).status_code==200
    row=run(r.sql.query('SELECT uid FROM messages WHERE message_type=?',('news:'+key,)))[0]
    run(r.sql.batch([('DELETE FROM news WHERE uid=?',(key,))]))
    response=c.get('/admin/messages/'+row['uid']+'/view')
    assert response.status_code==200 and '来源新闻已删除或不可公开访问' in response.text
