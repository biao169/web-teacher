"""Cross-feature flow: time edit -> cover -> private message -> order -> publication gate."""
import re
from justhtml import JustHTML
from test_media_management_step2 import fixture,register,run
from test_translation_regression import source


def test_news_features_share_one_record_without_overwriting_each_other(fixture):
    c,r=fixture;asset=register(r,status='active')
    row=source(r,'news','content','Acceptance article',cover_key=asset['object_key'],allow_comments=1)
    key=row['uid'];headers={'Origin':r.config.origin,'Accept':'application/json'}
    def current():return run(r.sql.query('SELECT * FROM news WHERE uid=?',(key,)))[0]
    def edit(time):
        return c.post('/admin/news/save',data={'_csrf':r.p['csrf'],'_uid':key,'_stamp':current()['updated_at'],
                    'published_at':time,'_timezone_published_at':'Asia/Shanghai','allow_comments':'1'},headers=headers,follow_redirects=False)
    assert edit('2026-01-01T15:30:00.123').status_code==303
    saved=current();assert saved['published_at']=='2026-01-01T07:30:00.123Z'
    assert saved['cover_key']==asset['object_key'] and saved['allow_comments']==1
    for lang in ('zh','en'):
        response=c.get('/'+lang+'/news/'+key);assert response.status_code==200
        doc=JustHTML(response.text,sanitize=False)
        assert len(doc.query('.content-detail-cover img'))==1
        assert doc.query_one('time[data-local-time]').attrs['datetime']==saved['published_at']
        assert len(doc.query('[data-contact-form]'))==1
    body=c.get('/en/news/'+key).text;token=re.search('name="challenge" value="([^"]+)"',body)[1]
    response=c.post('/en/contact',data={'challenge':token,'news_uid':key,'content':'Private acceptance message'},headers=headers)
    assert response.status_code==200
    message=run(r.sql.query('SELECT * FROM messages WHERE message_type=?',('news:'+key,)))[0]
    assert message['visibility']=='hidden'
    response=c.post('/api/admin/news/'+key,json={'_csrf':r.p['csrf'],'stamp':current()['updated_at'],'action':'order','field':'sort_order','value':'-900'},headers=headers)
    assert response.status_code==200 and response.json()['row']['value']==-900
    after=current();assert after['published_at']==saved['published_at'] and after['cover_key']==saved['cover_key'] and after['allow_comments']==1
    fragment=c.get('/en/news',headers={'X-Public-Fragment':'1'}).json()['html']
    doc=JustHTML(fragment,sanitize=False);assert doc.query_one('article[data-record-id]').attrs['data-record-id']==key
    assert 'Private acceptance message' not in fragment
    assert c.get('/admin/messages/'+message['uid']+'/view').status_code==200
    # Future scheduling hides both the page and sitemap entry, without deleting messages.
    assert edit('2999-01-01T15:30').status_code==303
    assert c.get('/en/news/'+key).status_code==404
    assert key not in c.get('/sitemap-news-1.xml').text
    response=c.post('/en/contact',data={'challenge':token,'news_uid':key,'content':'Too late'},headers=headers)
    assert response.status_code==404
    assert len(run(r.sql.query('SELECT uid FROM messages WHERE message_type=?',('news:'+key,))))==1
