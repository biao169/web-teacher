"""Shared faculty panels preserve public visibility and reading/copy order."""
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add,configure,DOM

@pytest.mark.parametrize('lang',['zh','en'])
def test_shared_identity_contacts_sections_and_orcid_link(fixture,lang):
    c,r=fixture
    uid=add(r,'profiles','欧阳明',name_en='Ming Ouyang',is_active=1,is_featured=1,role='TEAM_ROLE',organization='ORG_NAME',lab='LAB_NAME',office='OFFICE_VALUE',email='faculty@example.org',phone='12345678',contact_visibility='public',bio='BIO_CN',bio_en='BIO_EN',education='EDUCATION_BODY',experience='EXPERIENCE_BODY',recruiting='RECRUITMENT_BODY',orcid='0000-0002-1825-0097',google_scholar='https://scholar.google.com/citations?user=EXAMPLE',github='https://github.com/example',github_value=987654321)
    run(r.sql.batch([('UPDATE profiles SET title=? WHERE uid=?',('FULL_TITLE',uid))]))
    for path in (f'/{lang}',f'/{lang}/profiles',f'/{lang}/profiles/{uid}'):
        page=c.get(path).text
        for val in ('FULL_TITLE','TEAM_ROLE','ORG_NAME','LAB_NAME','OFFICE_VALUE','faculty@example.org','12345678','0000-0002-1825-0097','https://github.com/example'):
            assert val in page
        assert 'data-platform-value="github">987654321</span>' in page
        assert 'href="https://orcid.org/0000-0002-1825-0097"' in page
        assert 'data-media-fallback' in page and ('>欧阳</span>' if lang=='zh' else '>MO</span>') in page
        assert 'BIO_EN' in page if lang=='en' else 'BIO_CN' in page
    home=c.get(f'/{lang}').text
    assert 'faculty-contact-panel' in home and 'home-profile-link' not in home
    assert 'EDUCATION_BODY' not in home and 'EXPERIENCE_BODY' not in home and 'RECRUITMENT_BODY' in home
    detail=c.get(f'/{lang}/profiles/{uid}').text
    assert len(DOM(detail).find('h1'))==1
    for name,body in [('bio','BIO_EN' if lang=='en' else 'BIO_CN'),('education','EDUCATION_BODY'),('experience','EXPERIENCE_BODY'),('recruiting','RECRUITMENT_BODY')]:
        assert f'aria-labelledby="section-{name}"' in detail and detail.count(body)==1
    assert detail.index('section-bio')<detail.index('section-education')<detail.index('section-experience')<detail.index('section-recruiting')

@pytest.mark.parametrize('visibility',['hidden','authenticated','staff','owner'])
def test_contacts_stay_hidden_even_when_logged_in(fixture,visibility):
    c,r=fixture
    uid=add(r,'profiles','Private',is_active=1,is_featured=1,office='NEVER_OFFICE',email='never@example.org',phone='NEVER_PHONE',contact_visibility=visibility)
    for home in ('/zh','/en'):
        text=c.get(home).text
        assert 'NEVER_OFFICE' in text and 'never@example.org' in text and 'NEVER_PHONE' not in text
    for path in ('/zh/profiles','/zh/profiles/'+uid):
        text=c.get(path).text
        assert all(x not in text for x in ('NEVER_OFFICE','never@example.org','NEVER_PHONE','faculty-contact-panel'))
    c.cookies.clear()
    text=c.get('/en').text
    assert 'NEVER_OFFICE' in text and 'never@example.org' in text and 'NEVER_PHONE' not in text
    assert 'never@example.org' not in c.get('/en/profiles/'+uid).text

def test_hero_buttons_only_from_navigation_and_empty_sections_omitted(fixture):
    c,r=fixture;uid=add(r,'profiles','Teacher',is_active=1,is_featured=1)
    for title,enabled,visibility in [('HERO_OK',1,'public'),('HERO_DISABLED',0,'public'),('HERO_PRIVATE',1,'hidden')]:
        run(r.content.save('navigation_items',r.p,{'title':title,'path':'/zh/projects','location':'hero','enabled':enabled,'visibility':visibility}))
    c.cookies.clear();page=c.get('/zh').text
    assert 'HERO_OK' in page and 'HERO_DISABLED' not in page and 'HERO_PRIVATE' not in page
    assert 'home-profile-link' not in page and len(DOM(page).find_path('/zh/profiles/'+uid))==1
    detail=c.get('/zh/profiles/'+uid).text
    assert 'id="section-' not in detail
    run(r.sql.batch([('UPDATE profiles SET is_featured=0 WHERE uid=?',(uid,))]))
    configure(r,hero_title='FALLBACK_TITLE',hero_subtitle='FALLBACK_SUBTITLE')
    page=c.get('/zh').text
    assert 'FALLBACK_TITLE' in page and 'FALLBACK_SUBTITLE' in page and 'HERO_OK' in page
    assert 'faculty-panel faculty-intro' not in page
