import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add
from test_public_cards_v55 import article

@pytest.mark.parametrize('table,field',[('students','bio'),('courses','summary')])
def test_lazy_public_description_and_private_scope(fixture,table,field):
    c,r=fixture
    text='公开简介 <script>literal</script> '+('完整内容'*900)
    uid=add(r,table,'Description example',**{field:text})
    html=article(c.get('/zh/'+table).text,uid)
    assert 'data-description-url=' in html and 'data-person-expand' in html
    assert '<script>literal</script>' not in html
    response=c.get(f'/api/public/zh/{table}/{uid}/description')
    assert response.status_code==200 and response.json()==dict(lang='zh',table=table,uid=uid,text=text)
    assert response.headers['cache-control']=='no-store'
    run(r.sql.batch([(f'UPDATE {table} SET visibility=? WHERE uid=?',('hidden',uid))]))
    assert c.get(f'/api/public/zh/{table}/{uid}/description').status_code==404

@pytest.mark.parametrize('table,field',[('students','bio'),('courses','summary')])
def test_short_description_local_expansion(fixture,table,field):
    c,r=fixture;uid=add(r,table,'Short description',**{field:'short description'})
    html=article(c.get('/zh/'+table).text,uid)
    assert 'data-biography-loaded="1"' in html and 'data-description-url=' not in html
    assert 'data-person-expand' in html

def test_description_rejects_other_tables_and_language(fixture):
    c,r=fixture
    assert c.get('/api/public/zh/accounts/a/description').status_code==404
    assert c.get('/api/public/fr/students/a/description').status_code==404

@pytest.mark.parametrize('table,field',[('students','bio'),('courses','summary')])
def test_description_uses_exact_live_translation_without_writes(fixture,table,field):
    from test_translation_regression import source,cache
    c,r=fixture;row=source(r,table,field,'完整原文'*700)
    text='Translated <b>literal</b> '*300
    cache(r,table,row,field,text=text,manual=1)
    before=run(r.sql.query('SELECT * FROM translation_cache ORDER BY id'))
    response=c.get(f'/api/public/en/{table}/{row["uid"]}/description')
    assert response.status_code==200 and response.json()['text']==text
    assert run(r.sql.query('SELECT * FROM translation_cache ORDER BY id'))==before

def test_course_pdf_entry_keeps_private_material_hidden(fixture):
    from test_public_replan_v53 import image_asset
    c,r=fixture;syllabus=image_asset(r,'syllabus62');material=image_asset(r,'material62')
    run(r.sql.batch([('UPDATE media_assets SET mime_type=? WHERE object_key IN (?,?)',('application/pdf',syllabus,material))]))
    uid=add(r,'courses','PDF course',syllabus_key=syllabus,material_key=material,material_visibility='hidden')
    for url in ['/zh/courses','/zh/courses/'+uid]:
        html=c.get(url).text
        assert '/media/syllabus62' in html and '· PDF' in html and 'card-icon' in html
        assert '/media/material62' not in html and material not in html
