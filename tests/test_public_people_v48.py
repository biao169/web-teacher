"""Approved public data contract, configured student groups and bounded facets."""
from test_accounts_regression import fixture,run
from test_public_home_step2 import add,DOM
from backend.app.native.public_data import public_listing
from backend.app.native.catalog import Error
import pytest

def rule(r,key,words,order=0,**values):
    return run(r.content.save('student_category_displays',r.p,{'key':key,'label':key,'keywords':words,'display_order':order,'enabled':1,**values}))

def listing(r,query=None):return run(public_listing(r,'students',query or {}))

def test_default_category_order_first_match_and_unmatched_last(fixture):
    c,r=fixture
    late=rule(r,'Later','博士;robot',30)
    early=rule(r,'Earlier','博士',-5,label_en='Doctoral students')
    a=add(r,'students','A',degree='博士',sort_order=8)
    b=add(r,'students','B',direction='ROBOT',sort_order=-30)
    other=add(r,'students','Other',degree='硕士',sort_order=-100)
    result=listing(r)
    assert [x['uid'] for x in result['rows']]==[a,b,other]
    assert [x['_public_group'] for x in result['rows']]==[early,late,'_other']
    assert result['query']['sort']=='student_category'
    assert 'Doctoral students' in c.get('/en/students').text
    assert 'Other students' in c.get('/en/students').text
    # Legacy field sorting normalizes to configured groups, including on old URLs.
    by_name=listing(r,{'sort':'name','direction':'desc'})
    assert [row['uid'] for row in by_name['rows']]==[a,b,other]
    assert by_name['query']['sort']=='student_category' and by_name['rows'][0]['_public_group']==early

def test_configuration_reorder_disable_and_no_student_mutation(fixture):
    c,r=fixture;first=rule(r,'First','博士',0);second=rule(r,'Second','博士',1)
    uid=add(r,'students','Student',degree='博士',category='unchanged')
    before=run(r.sql.query('SELECT * FROM students WHERE uid=?',(uid,)))[0]
    stamp=run(r.content.get('student_category_displays',second,r.p))['updated_at']
    run(r.content.save('student_category_displays',r.p,{'display_order':-5},second,stamp))
    assert listing(r)['rows'][0]['_public_group']==second
    stamp=run(r.content.get('student_category_displays',second,r.p))['updated_at']
    run(r.content.save('student_category_displays',r.p,{'enabled':0},second,stamp))
    assert listing(r)['rows'][0]['_public_group']==first
    assert run(r.sql.query('SELECT * FROM students WHERE uid=?',(uid,)))[0]==before

def test_group_pagination_order_unique_and_bounded(fixture):
    c,r=fixture;g=rule(r,'Group','博士',0);rule(r,'Next','硕士',1)
    for i in range(23):add(r,'students',f'Person{i:02}',degree='博士' if i<12 else '硕士',sort_order=i)
    rows=[]
    for page in (1,2,3):
        result=listing(r,{'page':page});assert len(result['rows'])<=10;rows+=result['rows']
    assert len({x['uid'] for x in rows})==23
    assert all(x['_public_group']==g for x in rows[:12])
    html=c.get('/zh/students?page=2',headers={'X-Public-Fragment':'1'}).json()['html']
    assert 'aria-label="序号">13</span>' in html
    headers=DOM(html).find('h2',**{'data-person-group-heading':None})
    assert len([h for h in headers if 'hidden' not in h])==2
    reverse=listing(r,{'direction':'desc'})['rows']
    assert reverse[0]['name']=='Person11' and reverse[0]['_public_group']==g

def test_keyword_matching_reuses_fields_and_treats_special_chars_literally(fixture):
    c,r=fixture;g=rule(r,'Literal',r'PHD;100%;a_b;c\d',0)
    hits=[add(r,'students','hit'+str(i),**{field:value}) for i,(field,value) in enumerate([('degree','phd'),('category','100%'),('grade','a_b'),('direction',r'c\d'),('status','PHD')])]
    miss=add(r,'students','PHD name is not matched',category='1000 axb cXd')
    result=listing(r)['rows']
    assert {row['uid'] for row in result if row['_public_group']==g}==set(hits)
    assert result[-1]['uid']==miss and result[-1]['_public_group']=='_other'

def test_empty_disabled_legacy_invalid_rules_do_not_hide_public_students(fixture):
    c,r=fixture;rule(r,'Empty','');rule(r,'Disabled','博士',enabled=0)
    invalid=rule(r,'Invalid','valid');run(r.sql.batch([('UPDATE student_category_displays SET keywords=? WHERE uid=?',('X'*5000,invalid))]))
    uid=add(r,'students','A',degree='博士');add(r,'students','Secret',visibility='hidden',degree='博士')
    result=listing(r);assert result['total']==1 and result['rows'][0]['uid']==uid
    assert result['rows'][0]['_public_group']=='_other'

def test_student_first_paint_bio_status_and_contact_privacy(fixture):
    c,r=fixture;rule(r,'People','硕士')
    add(r,'students','Student',degree='硕士',status='在读',bio='FIRST_PAINT_BIO',email='hidden@private.example',contact_visibility='hidden',student_id='PRIVATE_STUDENT_ID')
    html=c.get('/zh/students').text
    assert 'FIRST_PAINT_BIO' in html and '在读' in html
    assert 'hidden@private.example' not in html and 'PRIVATE_STUDENT_ID' not in html
    add(r,'students','Public contact',email='public@example.org',contact_visibility='public')
    assert 'public@example.org' in c.get('/zh/students').text

def test_facets_entire_public_scope_paged_without_private_options(fixture):
    c,r=fixture
    for i in range(55):add(r,'students',f'Student{i:02}',grade=f'Grade{i:02}')
    add(r,'students','PRIVATE',grade='PRIVATE_GRADE',visibility='hidden')
    first=c.get('/api/public/people/students/facets/grade').json()
    second=c.get('/api/public/people/students/facets/grade?page=2').json()
    assert len(first['values'])==50 and first['has_more'] is True
    assert second['values']==[f'Grade{i:02}' for i in range(50,55)] and not second['has_more']
    assert 'PRIVATE_GRADE' not in str(first)+str(second)
    html=c.get('/zh/students?f.grade=Grade54').text
    assert '<option value="Grade54" selected>' in html
    assert 'data-facet-more hidden' in html
    assert 'Grade30' in html # Not derived from the currently filtered single student.

def test_teacher_facets_and_student_grade_filters(fixture):
    c,r=fixture
    run(r.content.save('profiles',r.p,{'name':'ProfA','title':'Professor','organization':'Unit A','is_active':1,'lab':'LAB','role':'ROLE','visibility':'public'}))
    run(r.content.save('profiles',r.p,{'name':'ProfB','title':'Lecturer','organization':'Unit B','is_active':1,'visibility':'public'}))
    run(r.content.save('profiles',r.p,{'name':'Inactive','title':'HIDDEN_TITLE','organization':'Hidden','is_active':0,'visibility':'public'}))
    page=c.get('/zh/profiles?f.title=Professor&f.organization=Unit A')
    assert page.status_code==200 and 'ProfA' in page.text and 'ProfB' not in page.text
    assert 'LAB' in page.text and 'ROLE' in page.text
    assert c.get('/api/public/people/profiles/facets/title').json()['values']==['Lecturer','Professor']
    add(r,'students','Cohort2024',grade='2024');add(r,'students','Cohort2025',grade='2025')
    assert 'Cohort2025' not in c.get('/zh/students?f.grade=2024').text
    assert c.get('/zh/students?f.email=secret').status_code==422
    assert c.get('/api/public/people/auth_users/facets/name').status_code==404
    assert c.get('/api/public/people/students/facets/student_id').status_code==404
    assert c.get('/api/public/people/students/facets/grade?page=not-a-number').status_code==422
    assert c.get('/api/public/people/students/facets/grade?page=999999999999999999999999999').status_code==422

def test_legacy_date_sort_normalizes_public_order_and_admin_sort_is_unmodified(fixture):
    c,r=fixture
    empty=add(r,'students','Empty',sort_order=-5)
    old=add(r,'students','Old',enrollment_date='2020-09-01',sort_order=5)
    new=add(r,'students','New',enrollment_date='2025-09-01',sort_order=10)
    for direction,expected in [('asc',[empty,old,new]),('desc',[new,old,empty])]:
        assert [x['uid'] for x in listing(r,{'sort':'enrollment_date','direction':direction})['rows']]==expected
    admin=run(r.content.listing('students',r.p,query={'sort':'sort_order','direction':'asc'}))
    assert [x['uid'] for x in admin['rows'] if x['uid'] in (empty,old,new)]==[empty,old,new]
    with pytest.raises(Error):run(r.content.listing('students',r.p,query={'sort':'student_category'}))


def test_many_keywords_keep_sql_binding_budget_small(fixture):
    c,r=fixture
    for n in range(7):rule(r,'Rule'+str(n),';'.join(f'word{n}_{i}' for i in range(20)),n)
    add(r,'students','Target',degree='word6_19')
    captured=[];original=r.sql.query
    async def capture(sql,args=()):
        captured.append((sql,args));return await original(sql,args)
    r.sql.query=capture
    result=listing(r)
    assert result['rows'][0]['_public_group_label']=='Rule6'
    grouped=[(sql,args) for sql,args in captured if 'json_each' in sql]
    assert len(grouped)==1 and len(grouped[0][1])<10
    assert 'LIMIT ? OFFSET ?' in grouped[0][0]
