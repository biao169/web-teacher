import asyncio
import pytest
from backend.app.domain.richtext import clean
from backend.app.native.news_body import news_html
UID='a'*32
@pytest.mark.parametrize('width',['1px','4096px','1%','100%'])
def test_safe_geometry_roundtrip(width):
    value=f'<p><img src="/media/{UID}" class="image-align-right" data-image-width="{width}" data-image-height="200px" data-image-min-width="100px" data-image-min-height="60px" style="position:fixed" onerror="evil()"></p>'
    html,refs=clean(value)
    assert f'width:{width}' in html and 'height:200px' in html and 'min-width:min(100%, 100px)' in html
    assert 'onerror' not in html and 'position' not in html and refs=={UID:'image'}
    assert clean(html)[0]==html
@pytest.mark.parametrize('value',['0px','4097px','101%','-1px','expression(x)','10px;position:fixed','1e3px','10.5px'])
def test_invalid_geometry_removed(value):
    html,_=clean(f'<img src="/media/{UID}" data-image-width="{value}" data-image-height="50%">')
    assert 'style=' not in html and 'data-image-width' not in html and 'data-image-height' not in html

def test_public_news_decorator_keeps_dimensions():
    class SQL:
        async def query(self,*args):return [{'uid':UID,'mime_type':'image/png'}]
    value=f'<p><img src="/media/{UID}" width="240" height="160" class="image-align-left"></p>'
    html=asyncio.run(news_html(SQL(),value,'html'))
    assert 'width:240px' in html and 'height:160px' in html and 'image-align-left' in html

from test_media_management_step2 import fixture,register
from test_translation_regression import source

def test_saved_news_preview_public_and_media_reference(fixture):
    c,r=fixture;media=register(r,status='active');url='/media/'+media['uid']
    row=source(r,'news','content',f'<p><img src="{url}" data-image-width="60%" data-image-min-width="100px" class="image-align-right"></p>',content_format='html')
    assert 'width:60%' in row['content']
    preview=c.post('/api/assistance/news-body',json={'_csrf':r.p['csrf'],'_uid':row['uid'],'_stamp':row['updated_at'],'content':row['content'],'content_format':'html'},headers={'Origin':r.config.origin})
    assert preview.status_code==200,preview.text
    assert 'width:60%' in preview.json()['html']
    public=c.get('/zh/news/'+row['uid']);assert public.status_code==200,public.text
    assert 'width:60%' in public.text and 'image-align-right' in public.text
    assert asyncio.run(r.media.references.used(media))
