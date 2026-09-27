"""Public template integration; existing server/privacy contracts remain unchanged."""
from test_accounts_regression import fixture
from test_public_home_step2 import add,DOM

def test_people_cards_and_fragment_offsets(fixture):
    c,r=fixture
    for i in range(13):add(r,'profiles',f'Teacher {i:02}',is_active=1,sort_order=i,bio='BIO',organization='Example')
    first=c.get('/zh/profiles');assert first.status_code==200
    assert len(DOM(first.text).find('article',**{'data-person-card':None}))==10
    assert 'aria-label="序号">1</span>' in first.text
    response=c.get('/zh/profiles?page=2',headers={'X-Public-Fragment':'1'})
    assert response.status_code==200
    assert 'aria-label="序号">11</span>' in response.json()['html']
    assert 'data-person-expand' in response.json()['html']

def test_student_descending_ordinals_and_supported_filters(fixture):
    c,r=fixture
    for i in range(12):add(r,'students',f'Student {i:02}',category='博士生',degree='博士',student_id=f'PRIVATE_ID_{i}')
    first=c.get('/en/students?f.category=博士生&sort=name&direction=asc');assert first.status_code==200
    assert 'aria-label="Number">12</span>' in first.text and 'PRIVATE_ID' not in first.text
    response=c.get('/en/students?page=2&f.category=博士生&sort=name&direction=asc',headers={'X-Public-Fragment':'1'})
    assert 'aria-label="Number">2</span>' in response.json()['html']
    assert '<select name="f.category"' in first.text and '<option value="博士生" selected>' in first.text
    assert c.get('/zh/students?f.category=missing').status_code==200

def test_profile_complete_details_private_contact_and_escaped_text(fixture):
    c,r=fixture
    uid=add(r,'profiles','A <script>alert(1)</script>',is_active=1,bio='Long BIO',lab='Public lab',role='Professor',education='EDUCATION',experience='EXPERIENCE',recruiting='RECRUITING',email='secret@example.org',phone='PRIVATE_PHONE',office='PRIVATE_OFFICE',contact_visibility='hidden',personal_homepage='https://example.org/profile')
    response=c.get('/en/profiles/'+uid);assert response.status_code==200
    for value in ['Public lab','Professor','EDUCATION','EXPERIENCE','RECRUITING','https://example.org/profile','Long BIO']:assert value in response.text
    for value in ['secret@example.org','PRIVATE_PHONE','PRIVATE_OFFICE','<script>alert(1)</script>']:assert value not in response.text
    assert len(DOM(response.text).find('h1'))==1
    assert f'data-record-id="{uid}"' in response.text

def test_student_details_public_fields_not_student_id(fixture):
    c,r=fixture
    uid=add(r,'students','Student',student_id='NEVER_DISCLOSE',bio='Student bio',awards='PUBLIC_AWARD',destination='PUBLIC_DESTINATION',enrollment_date='2024-09-01',graduation_date='2027-06-01',email='public@example.org',contact_visibility='public',homepage='https://example.org/student')
    response=c.get('/zh/students/'+uid);assert response.status_code==200
    for value in ['PUBLIC_AWARD','PUBLIC_DESTINATION','Student bio','2024-09-01','2027-06-01','public@example.org']:assert value in response.text
    assert 'NEVER_DISCLOSE' not in response.text
    private=add(r,'students','Hidden',visibility='hidden')
    assert c.get('/zh/students/'+private).status_code==404

def test_toolbar_values_and_no_script_fallback(fixture):
    c,r=fixture;add(r,'profiles','Ada',is_active=1)
    response=c.get('/zh/profiles?q=Ada&sort=name&direction=desc&size=20')
    assert response.status_code==200
    assert 'name="q" type="search" maxlength="200" value="Ada"' in response.text
    assert not DOM(response.text).find('select',name='sort')
    assert DOM(response.text).find('input',name='direction',value='desc',checked=None)
    assert not DOM(response.text).find('select',name='size')
    assert 'data-person-select hidden' in response.text and 'data-person-link href="/zh/profiles/' in response.text
    assert 'data-person-selection hidden' in response.text
