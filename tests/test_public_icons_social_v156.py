"""Exercise six platform metrics, shared icons and Worker bundled templates."""
import ast
from pathlib import Path
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add,configure,DOM
from backend.app.web.rendering import Renderer
from sync_stage_fixture import stage

FIELDS=('orcid','personal_homepage','google_scholar','dblp','github','cnki')
ROOT=Path(__file__).resolve().parents[1]

@pytest.mark.parametrize('lang',['en','zh'])
@pytest.mark.parametrize('mode',['positive','zero','blank'])
def test_all_six_values_on_home_list_detail(fixture,lang,mode):
    c,r=fixture
    values={field+'_value':None if mode=='blank' else 0 if mode=='zero' else 10+i for i,field in enumerate(FIELDS)}
    # Mixed linked/value-only platforms, with ORCID ID normalization.
    values.update(orcid='0000-0002-1825-0097',github='https://github.com/example',google_scholar='https://scholar.google.com/example')
    uid=add(r,'profiles','Six platform values',is_active=1,is_featured=1,**values)
    c.cookies.clear()
    for path in (f'/{lang}',f'/{lang}/profiles',f'/{lang}/profiles/{uid}'):
        page=c.get(path);assert page.status_code==200
        for i,field in enumerate(FIELDS):
            marker='data-platform-value="'+field+'"'
            if mode=='blank':assert marker not in page.text
            else:assert marker+'>'+str(0 if mode=='zero' else 10+i)+'</span>' in page.text
        assert 'href="https://orcid.org/0000-0002-1825-0097"' in page.text
        assert 'href="https://github.com/example"' in page.text
        assert 'href="None"' not in page.text and 'href="0"' not in page.text

@pytest.mark.parametrize('bundled',[False,True])
def test_shared_icons_resolve_on_public_admin_login_and_sync(fixture,stage,bundled):
    c,r=fixture
    if bundled:
        tree=ast.parse((stage/'src/generated_resources.py').read_text())
        templates=ast.literal_eval(next(n.value for n in tree.body if isinstance(n,ast.Assign) and n.targets[0].id=='TEMPLATES'))
        r.renderer=Renderer.bundled(templates)
    for path in ('/en','/zh','/auth/login','/admin/profiles','/admin/site-sync'):
        page=c.get(path);assert page.status_code==200
        links=DOM(page.text).find('link')
        icons=[l for l in links if l.get('rel')=='icon']
        assert [(l['type'],l['sizes']) for l in icons]==[('image/png','256x256'),('image/svg+xml','any')]
        apple=[l for l in links if l.get('rel')=='apple-touch-icon']
        assert len(apple)==1 and apple[0]['sizes']=='256x256'
        for link in icons+apple:
            response=c.get(link['href']);assert response.status_code==200
            name=link['href'].split('/')[-1].split('?')[0]
            expected=(ROOT/'frontend/shared/static'/name).read_bytes()
            assert response.content==expected
            assert (stage/'assets/assets/shared'/name).read_bytes()==expected
            assert response.headers['content-type'].split(';')[0]==('image/svg+xml' if name.endswith('.svg') else 'image/png')

def test_custom_favicon_wins_and_apple_keeps_valid_png(fixture):
    from test_media_regression import register,PNG
    c,r=fixture
    uid,key=register(fixture,PNG,'png','image/png')
    configure(r,favicon_key=key)
    c.cookies.clear()
    page=c.get('/en');assert page.status_code==200
    links=DOM(page.text).find('link')
    assert [l['href'] for l in links if l.get('rel')=='icon']==['/media/'+uid]
    apple=[l for l in links if l.get('rel')=='apple-touch-icon']
    assert len(apple)==1 and apple[0]['href']=='/assets/shared/apple-touch-icon.png?v=0.15.156'
    assert c.get(apple[0]['href']).content.startswith(b'\x89PNG\r\n\x1a\n')
