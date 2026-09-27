"""Homepage-only enrichment and student priorities preserve public boundaries."""
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add
from test_public_cards_v55 import article

@pytest.mark.parametrize('lang',['zh','en'])
def test_home_recruitment_only_and_contacts_follow_visibility(fixture,lang):
    c,r=fixture
    uid=add(r,'profiles','张老师',name_en='Teacher Zhang',is_active=1,is_featured=1,recruiting='RECRUIT_ONLY_HOME',education='PRIVATE_HISTORY_EDU',experience='PRIVATE_HISTORY_WORK',office='ROOM_123',email='teacher@example.org',phone='123456789',contact_visibility='public',github='https://github.com/example')
    c.cookies.clear()
    text=c.get('/'+lang).text
    assert 'RECRUIT_ONLY_HOME' in text and 'ROOM_123' in text and 'teacher@example.org' in text and '123456789' in text
    assert 'PRIVATE_HISTORY_EDU' not in text and 'PRIVATE_HISTORY_WORK' not in text
    assert text.count('id="home-recruiting"')==1
    assert ('Academic profiles' if lang=='en' else '学术与社交') in text
    assert 'RECRUIT_ONLY_HOME' not in c.get('/'+lang+'/profiles').text
    run(r.sql.batch([('UPDATE profiles SET contact_visibility=? WHERE uid=?',('hidden',uid))]))
    text=c.get('/'+lang).text
    assert 'ROOM_123' in text and 'teacher@example.org' in text and '123456789' not in text
    assert 'https://github.com/example' in text and 'faculty-contact-panel' in text
    run(r.sql.batch([('UPDATE profiles SET github=NULL WHERE uid=?',(uid,))]))
    text=c.get('/'+lang).text
    assert 'faculty-contact-panel' in text
    run(r.sql.batch([('UPDATE profiles SET email=NULL,office=NULL WHERE uid=?',(uid,))]))
    text=c.get('/'+lang).text
    assert 'faculty-overview-single' in text and 'faculty-contact-panel' not in text

@pytest.mark.parametrize('lang',['zh','en'])
def test_student_priorities_appear_once_in_full_and_fragment_without_bio(fixture,lang):
    c,r=fixture
    uid=add(r,'students','学生',name_en='Student Example',direction='RESEARCH_TOPIC',awards='AWARD_TEXT',bio=None)
    c.cookies.clear()
    for response in (c.get('/'+lang+'/students'),c.get('/'+lang+'/students',headers={'x-public-fragment':'1'})):
        text=response.json()['html'] if response.headers.get('content-type','').startswith('application/json') else response.text
        card=article(text,uid)
        assert 'class="student-highlights"' in card
        assert card.count('RESEARCH_TOPIC')==1 and card.count('AWARD_TEXT')==1
        assert card.index('student-highlights')<card.index('data-person-biography')
        assert 'data-person-expand' not in card
    run(r.sql.batch([('UPDATE students SET direction=NULL,awards=NULL WHERE uid=?',(uid,))]))
    assert 'student-highlights' not in article(c.get('/'+lang+'/students').text,uid)
