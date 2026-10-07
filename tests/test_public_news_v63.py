import pytest
from test_media_management_step2 import fixture,register,run
from test_translation_regression import source
from test_public_cards_v55 import article
from backend.app.native.news_body import news_html
from justhtml import JustHTML

@pytest.mark.parametrize('lang',['zh','en'])
@pytest.mark.parametrize('allow',[0,1])
def test_news_reader_settings_and_detail_cover(fixture,lang,allow):
    c,r=fixture;pdf=register(r,status='active');image=register(r,status='active')
    run(r.sql.batch([('UPDATE media_assets SET mime_type=? WHERE uid=?',('application/pdf',pdf['uid'])),('UPDATE global_settings SET news_pdf_allow_download=?,news_pdf_watermark=?',(allow,'Team <script>literal</script> " &'))]))
    body=f'<p>Body text</p><p><img src="/media/{image["uid"]}"></p><p><a href="/media/{pdf["uid"]}">Paper</a></p>'
    row=source(r,'news','content',body,content_format='html',cover_key=image['object_key'],category='研究动态')
    page=c.get(f'/{lang}/news/{row["uid"]}');assert page.status_code==200
    doc=JustHTML(page.text,sanitize=False)
    assert len(doc.query('.content-detail-cover'))==1
    assert len(doc.query('.content-detail-cover img'))==1
    assert len(doc.query('.news-body img'))==1
    readers=doc.query('[data-pdf-public]');assert len(readers)==1
    reader=readers[0];assert reader.attrs['data-pdf-watermark']=='Team <script>literal</script> " &'
    assert reader.attrs['data-pdf-lang']==lang
    assert len(reader.query('[data-pdf-download]'))==allow
    assert '<script>literal</script>' not in page.text
    assert len(reader.query('[data-pdf-start]'))==1
    assert '打开原始' not in reader.to_text()
    preview=run(news_html(r.sql,body,'html'))
    assert 'data-pdf-public' not in preview and '打开文件' in preview

@pytest.mark.parametrize('category,expected',[('研究,交流','研'),('Research,Events','R'),('', 'N')])
def test_news_cover_fallback_in_home_list_and_no_private_media(fixture,category,expected):
    c,r=fixture;row=source(r,'news','content','text',category=category)
    for lang in ['zh','en']:
        html=article(c.get('/'+lang+'/news').text,row['uid'])
        assert 'content-cover public-media' in html and 'data-media-fallback' in html
        assert expected in JustHTML(html,sanitize=False).query_one('[data-media-fallback]').to_text()
        assert 'target="_blank"' in html

def test_nonpdf_external_links_are_not_rewritten(fixture):
    c,r=fixture
    html=run(news_html(r.sql,'<p><a href="https://example.org/file.pdf">External</a></p>','html',public_options={'allow_download':False}))
    assert 'data-inline-pdf' not in html and 'https://example.org/file.pdf' in html
