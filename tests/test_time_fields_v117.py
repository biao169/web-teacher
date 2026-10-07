import pytest
from zoneinfo import ZoneInfo,reset_tzpath,TZPATH
from test_accounts_regression import fixture,run
from test_public_home_step2 import add
from backend.app.native.time_fields import to_utc,local_value,form_times
from backend.app.native.catalog import Error

@pytest.mark.parametrize('name,value,expected',[
 ('Asia/Shanghai','2026-09-29T15:30','2026-09-29T07:30:00.000Z'),
 ('America/New_York','2026-07-01T12:00','2026-07-01T16:00:00.000Z'),
 ('America/New_York','2026-01-01T12:00','2026-01-01T17:00:00.000Z'),
 ('Asia/Kolkata','2026-01-01T12:00:00.123','2026-01-01T06:30:00.123Z')])
def test_roundtrip(name,value,expected):
    assert to_utc(value,name)==expected
    assert to_utc(local_value(expected,name),name)==expected


def test_dst_gaps_folds_empty_and_invalid():
    with pytest.raises(Error,match='不存在'):to_utc('2026-03-08T02:30','America/New_York')
    with pytest.raises(Error,match='两次'):to_utc('2026-11-01T01:30','America/New_York')
    assert to_utc('2026-11-01T01:30','America/New_York','0')=='2026-11-01T05:30:00.000Z'
    assert to_utc('2026-11-01T01:30','America/New_York','1')=='2026-11-01T06:30:00.000Z'
    assert to_utc('','Asia/Shanghai') is None
    for value,name in [('2026-01-01T00:00Z','UTC'),('bad','UTC'),('2026-01-01T00:00','bad-zone')]:
        with pytest.raises(Error):to_utc(value,name)


def test_windows_tzdata_fallback():
    try:
        reset_tzpath([]);ZoneInfo.clear_cache()
        assert to_utc('2026-09-29T15:30','Asia/Shanghai')=='2026-09-29T07:30:00.000Z'
    finally:reset_tzpath(TZPATH);ZoneInfo.clear_cache()


def test_unmarked_api_and_internal_stamps_are_not_converted():
    data={'published_at':'2026-01-01T00:00:00.000Z','_stamp':'original'}
    form_times('news',data);assert data=={'published_at':'2026-01-01T00:00:00.000Z','_stamp':'original'}
    data={'start_date':'2026-01-01'};form_times('projects',data);assert data['start_date']=='2026-01-01'


def test_editor_http_save_and_public_utc_attribute(fixture):
    c,r=fixture;key=add(r,'news','Timezone test')
    page=c.get('/admin/news/'+key+'/edit')
    assert page.status_code==200 and 'datetime-local' in page.text and 'name="_timezone_published_at"' in page.text
    original=run(r.sql.query('SELECT * FROM news WHERE uid=?',(key,)))[0]
    data={'_csrf':r.p['csrf'],'_uid':key,'_stamp':original['updated_at'],'published_at':'2026-01-01T15:30:00.123','_timezone_published_at':'Asia/Shanghai','_fold_published_at':''}
    response=c.post('/admin/news/save',data=data,headers={'Origin':r.config.origin,'Accept':'application/json'},follow_redirects=False)
    assert response.status_code==303,response.text
    row=run(r.sql.query('SELECT * FROM news WHERE uid=?',(key,)))[0]
    assert row['published_at']=='2026-01-01T07:30:00.123Z'
    page=c.get('/admin/news/'+key+'/edit');assert 'value="2026-01-01T15:30:00.123"' in page.text
    for url in ('/en/news','/en/news/'+key):
        page=c.get(url);assert page.status_code==200
        assert 'datetime="2026-01-01T07:30:00.123Z" data-local-time' in page.text
        assert 'UTC+08:00' in page.text
    data.update(_stamp=row['updated_at'],published_at='2026-03-08T02:30',_timezone_published_at='America/New_York')
    assert c.post('/admin/news/save',data=data,headers={'Origin':r.config.origin,'Accept':'application/json'}).status_code==422
    assert run(r.sql.query('SELECT published_at FROM news WHERE uid=?',(key,)))[0]['published_at']==row['published_at']
