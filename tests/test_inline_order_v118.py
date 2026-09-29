import pytest
from test_accounts_regression import fixture,run,user,role
from backend.app.native.catalog import TABLES
from backend.app.native.list_columns import column_layout


def first(r,table):return run(r.sql.query('SELECT * FROM '+table+' ORDER BY id LIMIT 1'))[0]
def post(c,r,table,row,**extra):return c.post('/api/admin/'+table+'/'+row['uid'],json={'_csrf':r.p['csrf'],'stamp':row['updated_at'],'action':'order','field':'sort_order','value':'-7',**extra},headers={'Origin':r.config.origin,'Accept':'application/json'})

@pytest.mark.parametrize('table,field',[('profiles','sort_order'),('news','sort_order'),('publications','sort_order'),('projects','sort_order'),('students','sort_order'),('student_category_displays','display_order'),('navigation_items','sort_order')])
def test_order_shared_save_returns_current_stamp_and_supports_repeat(fixture,table,field):
    c,r=fixture;row=first(r,table);response=post(c,r,table,row,field=field)
    assert response.status_code==200,response.text
    saved=response.json()['row'];assert saved['value']==-7 and set(saved)=={'uid','updated_at','updated_at_display','field','value','label'}
    row['updated_at']=saved['updated_at'];response=post(c,r,table,row,field=field,value='12')
    assert response.status_code==200,response.text
    assert response.json()['row']['value']==12
    assert field in column_layout(table)[1]
    page=c.get('/admin/'+table);assert page.status_code==200 and 'data-order-field="'+field+'"' in page.text

@pytest.mark.parametrize('value',[1.2,True,'1.5','1e3','',None,{},'9007199254740992'])
def test_bad_values_do_not_write(fixture,value):
    c,r=fixture;row=first(r,'profiles')
    response=post(c,r,'profiles',row,value=value);assert response.status_code==422,response.text
    assert first(r,'profiles')['sort_order']==row['sort_order']


def test_field_allowlist_conflict_and_csrf(fixture):
    c,r=fixture;row=first(r,'profiles')
    assert post(c,r,'profiles',row,field='name',value='Injected').status_code==422
    assert post(c,r,'profiles',row,_csrf='bad').status_code==403
    assert post(c,r,'profiles',row,stamp='2000-01-01T00:00:00.000Z').status_code==409
    assert first(r,'profiles')['sort_order']==row['sort_order']


def test_read_only_role_cannot_edit_or_see_controls(fixture):
    c,r=fixture;reader_role=role(r);reader=user(r,reader_role['uid']);token=run(r.auth.login(reader['username'],'Synthetic-only-password-035','test'))
    c.cookies.set('ts_session',token);r.p=run(r.auth.principal(token));row=first(r,'profiles')
    page=c.get('/admin/profiles');assert page.status_code==200 and 'data-order-field=' not in page.text
    assert post(c,r,'profiles',row).status_code==403


def test_fixed_scope_blocks_leaving_or_editing_outside_range(fixture):
    c,r=fixture;row=first(r,'profiles')
    key=run(r.content.save('navigation_items',r.p,{'title':'Order scope','location':'admin-sidebar','url_name':'order-scope','path':'/admin/profiles?f.sort_order='+str(row['sort_order']),'visibility':'public','enabled':1}))
    nav=run(r.sql.query('SELECT * FROM navigation_items WHERE uid=?',(key,)))[0]
    response=post(c,r,'profiles',row,nav='order-scope',nav_stamp=nav['updated_at'],value='-44')
    assert response.status_code==422,response.text
    assert 'data-order-field=' not in c.get('/admin/n/order-scope').text
