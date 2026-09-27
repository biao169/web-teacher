"""Public-only card/route consolidation: reading order, citations, fallback and visibility."""
import re
from html import unescape
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add,configure,DOM
from test_public_replan_v53 import image_asset

def article(html,uid):
    return re.search(r'<article[^>]*data-record-id="'+uid+r'".*?</article>',html,re.S)[0]

def citation(html):
    return unescape(re.search(r'<p[^>]*data-citation-text[^>]*>(.*?)</p>',html,re.S)[1])

@pytest.mark.parametrize('style',['gbt','elsevier','apa','ieee'])
def test_selected_citation_exactly_shared_by_home_list_and_fragments(fixture,style):
    c,r=fixture;configure(r,publication_citation_style=style,homepage_publication_limit=12)
    value='  MANUAL '+style+' <script>literal</script>\n  Preserve spacing  '
    for i in range(11):
        uid=add(r,'publications','Do not duplicate title',is_featured=1,sort_order=i,**{'citation_'+style:value,'highlight_'+style:'MANUAL'},display_tags='TAG',authors='AUTHOR',doi='10.0/test')
        # Simulate an already-stored manual citation, including outer whitespace.
        run(r.sql.batch([(f'UPDATE publications SET citation_{style}=? WHERE uid=?',(value,uid))]))
    first=c.get('/zh/publications').text
    more=c.get('/zh/publications?page=2',headers={'X-Public-Fragment':'1'}).json()['html']
    home=c.get('/zh/publications?home=1&page=2',headers={'X-Public-Fragment':'1'}).json()['html']
    for html in [first,more,home,c.get('/zh').text]:
        assert citation(html)==value and '<script>literal</script>' not in html
        assert ('data-copy-format' in html)==(html==first)
    card=article(more,uid)
    assert not DOM(card).find('h2') and not DOM(card).find('a',href='/zh/publications/'+uid)
    assert 'data-citation-highlight="MANUAL"' in card
    assert run(r.content.get('publications',uid,r.p))['citation_'+style]==value

@pytest.mark.parametrize('table',['students','publications','projects','patents','research_interests'])
def test_old_details_redirect_to_exact_public_card_even_after_first_page(fixture,table):
    c,r=fixture
    for i in range(12):uid=add(r,table,'Entry'+str(i),sort_order=i)
    for lang in ['zh','en']:
        response=c.get(f'/{lang}/{table}/{uid}?from=https://bad.example',follow_redirects=False)
        assert response.status_code==303
        from urllib.parse import urlsplit,parse_qs
        import base64,json
        target=urlsplit(response.headers['location']);token=parse_qs(target.query)['s'][0]
        assert target.path==f'/{lang}/{table}' and target.fragment=='record-'+uid
        assert json.loads(base64.urlsafe_b64decode(token+'='*((-len(token))%4)))=={'f.uid':uid}
        page=c.get(response.headers['location']);assert page.status_code==200
        assert 'data-person-detail' not in page.text and 'public-focus-note' in page.text
        assert len(DOM(page.text).find('article',**{'data-person-card':None}))==1
        assert f'id="record-{uid}"' in page.text
    hidden=add(r,table,'Private',visibility='hidden')
    assert c.get(f'/zh/{table}/{hidden}',follow_redirects=False).status_code==404
    assert c.get(f'/zh/{table}/missing',follow_redirects=False).status_code==404

def test_missing_format_explicit_fallback_never_uses_alternate_citation(fixture):
    c,r=fixture;configure(r,publication_citation_style='apa')
    add(r,'publications','TITLE',authors='AUTHOR',venue='VENUE',year=2025,volume='2',issue='3',pages='4–8',citation_gbt='WRONG_FORMAT')
    html=c.get('/zh/publications').text;text=citation(html)
    for word in ['APA 引文未填写','AUTHOR','TITLE','VENUE','2025','2','3','4–8']:assert word in text
    assert 'WRONG_FORMAT' not in html and 'data-citation-fallback' in html

def test_media_precedes_text_inline_actions_and_student_fields(fixture):
    c,r=fixture;key=image_asset(r,'cards55')
    teacher=add(r,'profiles','TEACHER55',is_active=1,avatar_key=key,bio='BIO',office='ROOM',contact_visibility='public')
    news=add(r,'news','NEWS55',cover_key=key)
    for table,uid,media in [('profiles',teacher,'person-photo'),('news',news,'content-cover')]:
        text=article(c.get('/zh/'+table).text,uid)
        assert text.index('class="'+media)<text.index('class="person-content"')
        assert 'card-icon' in text and 'card-with-media' in text
    student=add(r,'students','STUDENT55',destination='DEST',awards='AWARD',enrollment_date='2024-09-01',graduation_date='2027-07-01',student_id='PRIVATE_ID',email='SECRET_EMAIL',contact_visibility='hidden')
    text=article(c.get('/zh/students').text,student)
    for word in ['DEST','AWARD','2024-09-01','2027-07-01']:assert word in text
    for word in ['PRIVATE_ID','SECRET_EMAIL','data-person-expand','data-person-link']:assert word not in text

def test_project_order_zero_amount_and_full_research_patent_description(fixture):
    c,r=fixture
    project=add(r,'projects','TITLE55',source='SOURCE55',fund_name='PLAN55',principal='PI55',project_role='ROLE55',amount='0',members='MEMBER55',summary='OMIT55')
    text=article(c.get('/zh/projects').text,project)
    assert text.index('SOURCE55')<text.index('PLAN55')<text.index('>TITLE55<')<text.index('ROLE55')<text.index('PI55')<text.index('MEMBER55')
    assert '金额：</span>0' in text and 'OMIT55' not in text and 'data-person-link' not in text
    for table,field in [('research_interests','description'),('patents','summary')]:
        uid=add(r,table,'TITLE',**{field:'A'*2400+'END55'})
        assert 'END55' in article(c.get('/en/'+table).text,uid)
