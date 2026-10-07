import re
import pytest
from test_accounts_regression import fixture,run

def token(c,lang='en'):
    html=c.get('/'+lang+'/contact').text
    return re.search('name="challenge" value="([^"]+)"',html)[1]
def post(c,r,data,lang='en',json=False):
    headers={'Origin':r.config.origin}
    if json:headers['Accept']='application/json'
    return c.post('/'+lang+'/contact',data=data,headers=headers,follow_redirects=False)

def test_contact_theme_free_subject_and_private_save(fixture):
    c,r=fixture;challenge=token(c)
    html=c.get('/en/contact').text
    assert 'contact-topics' in html and 'Research collaboration' in html and 'maxlength="5000"' in html
    challenge=token(c)
    result=post(c,r,dict(challenge=challenge,name='Test',email='a@example.org',subject='自由主题 <b>safe</b>',content='正文'),json=True)
    assert result.status_code==200 and result.json()['ok']
    row=run(r.sql.query('SELECT * FROM messages ORDER BY id DESC LIMIT 1'))[0]
    assert row['subject']=='自由主题 <b>safe</b>' and row['visibility']=='hidden' and row['status']=='new'

def test_native_failure_retains_escaped_values_and_success_redirects(fixture):
    c,r=fixture;data=dict(challenge=token(c),name='<script>literal</script>',subject='custom',email='bad',content='Keep this draft')
    result=post(c,r,data)
    assert result.status_code==422 and 'Keep this draft' in result.text and '&lt;script&gt;literal' in result.text
    assert 'Enter a valid email' in result.text and '<script>literal</script>' not in result.text
    data['challenge']=re.search('name="challenge" value="([^"]+)"',result.text)[1];data['email']=''
    result=post(c,r,data);assert result.status_code==303 and result.headers['location']=='/en/contact'
    assert 'Your message has been sent.' in c.get('/en/contact').text
    assert 'Your message has been sent.' not in c.get('/en/contact').text

def test_expiry_and_anonymous_policy(fixture):
    c,r=fixture
    result=post(c,r,dict(challenge='expired',content='Keep me'),json=True)
    assert result.status_code==403 and 'retained' in result.json()['message'] and result.json()['challenge']
    c.cookies.clear();run(r.sql.batch([('UPDATE global_settings SET allow_anonymous_messages=0',())]))
    challenge=token(c);assert 'Anonymous messages are currently disabled' in c.get('/en/contact').text
    result=post(c,r,dict(challenge=token(c),content='Secret'),json=True)
    assert result.status_code==403 and 'sign in' in result.json()['message']

@pytest.mark.parametrize('value',[123,[],{}])
def test_nontext_fields_rejected_without_server_error(fixture,value):
    c,r=fixture;challenge=token(c)
    result=c.post('/en/contact',json=dict(challenge=challenge,content=value),headers={'Origin':r.config.origin,'Accept':'application/json'})
    assert result.status_code==422

def test_full_unicode_limit_and_throttle_are_retained(fixture):
    c,r=fixture
    for i in range(9):
        result=post(c,r,dict(challenge=token(c),content='汉'*5000,email='limit@example.org'),json=True)
        assert result.status_code==(200 if i<8 else 429)
    assert 'Too many' in result.json()['message']

def test_missing_cookie_and_cross_origin_never_save(fixture):
    c,r=fixture;c.cookies.clear()
    before=run(r.sql.query('SELECT count(*) AS n FROM messages'))[0]['n']
    response=post(c,r,dict(challenge='!',content='Must not save'),json=True)
    assert response.status_code==403
    challenge=token(c)
    response=c.post('/en/contact',data=dict(challenge=challenge,content='Must not save'),headers={'Origin':'https://elsewhere.example','Accept':'application/json'})
    assert response.status_code==403
    assert run(r.sql.query('SELECT count(*) AS n FROM messages'))[0]['n']==before
