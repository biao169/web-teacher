import pytest
from justhtml import JustHTML
from test_media_management_step2 import fixture,register,run
from test_translation_regression import source
from backend.app.native.media_policy import check_type,types_for
from backend.app.native.catalog import Error

@pytest.mark.parametrize('lang',['en','zh'])
@pytest.mark.parametrize('mime',['image/jpeg','video/mp4','video/webm'])
def test_cover_component_in_detail_list_home_and_fragment(fixture,lang,mime):
    c,r=fixture;asset=register(r,status='active')
    run(r.sql.batch([('UPDATE media_assets SET mime_type=? WHERE uid=?',(mime,asset['uid']))]))
    row=source(r,'news','content','BODY_SENTINEL',cover_key=asset['object_key'],is_featured=1)
    c.cookies.clear()
    for url,fragment in [(f'/{lang}/news/{row["uid"]}',False),(f'/{lang}/news',False),(f'/{lang}',False),(f'/{lang}/news',True)]:
        response=c.get(url,headers={'X-Public-Fragment':'1'} if fragment else {})
        assert response.status_code==200,response.text
        html=response.json()['html'] if fragment else response.text
        doc=JustHTML(html,sanitize=False)
        tag='video' if mime.startswith('video/') else 'img'
        nodes=doc.query(f'[data-public-media] {tag}[src="/media/{asset["uid"]}"]')
        assert len(nodes)==1
        if tag=='video':
            assert 'controls' in nodes[0].attrs and 'autoplay' not in nodes[0].attrs
            assert nodes[0].attrs['preload'] in ('none','metadata')
        if row['uid'] in url:
            assert len(doc.query('.content-detail-cover'))==1
            assert html.index('content-detail-cover')<html.index('BODY_SENTINEL')
            if tag=='img':assert nodes[0].attrs['loading']=='eager'
    check_type('news','cover_key',mime)


def test_absent_or_recycled_cover_has_no_detail_gap_and_hidden_news_stays_hidden(fixture):
    c,r=fixture;row=source(r,'news','content','Body without cover')
    assert 'content-detail-cover' not in c.get('/en/news/'+row['uid']).text
    asset=register(r,status='active')
    row=source(r,'news','content','Has cover',cover_key=asset['object_key'])
    run(r.sql.batch([("UPDATE media_assets SET status='trash' WHERE uid=?",(asset['uid'],))]))
    assert 'content-detail-cover' not in c.get('/en/news/'+row['uid']).text
    run(r.sql.batch([("UPDATE news SET visibility='hidden' WHERE uid=?",(row['uid'],))]))
    c.cookies.clear();assert c.get('/en/news/'+row['uid']).status_code==404


def test_cover_type_rules_preserve_avatar_and_body_rules():
    assert 'video/mp4' in types_for('news','cover_key')
    for table,field,mime in [('profiles','avatar_key','video/mp4'),('news','body_image','video/mp4'),('news','cover_key','application/pdf')]:
        with pytest.raises(Error):check_type(table,field,mime)
