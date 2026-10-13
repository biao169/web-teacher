"""Display, editor, suggestions and matching use semicolon/newline tokens."""
import pytest
from justhtml import JustHTML
from test_accounts_regression import fixture,run
from test_public_home_step2 import add
from backend.app.native.suggestions import split_values,suggestions
from backend.app.native.public_data import people_facet
from backend.app.native.navigation import build_public_path

@pytest.mark.parametrize('value,expected',[(' SCI；EI\r\nSCI; ;',['SCI','EI']),('Smith, John;王，明\n Team',['Smith, John','王，明','Team']),('',[]),(None,[]),(' ;\n；',[])])
def test_token_rule(value,expected):assert split_values(value)==expected

@pytest.mark.parametrize('lang',['zh','en'])
def test_publication_server_tags_split_and_keep_comma_without_markup_execution(fixture,lang):
 c,r=fixture;uid=add(r,'publications','Token paper',index_type='SCI；EI\r\nSCI; ',display_tags='Tag, intact; <script>unsafe</script>\nAnother',corresponding_authors='Smith, John')
 doc=JustHTML(c.get('/'+lang+'/publications').text,sanitize=False);card=doc.query('article[data-record-id="'+uid+'"]')[0]
 assert [n.to_html() for n in card.query('[data-publication-tag="index_type"]')]==['<span data-publication-tag="index_type">SCI</span>','<span data-publication-tag="index_type">EI</span>']
 tags=card.query('[data-publication-tag="display_tags"]');assert len(tags)==3 and 'Tag, intact' in tags[0].to_html()
 assert not card.query('script') and '&lt;script&gt;' in tags[1].to_html()
 assert 'Smith, John' in card.query('[data-public-authors]')[0].to_html()

def test_news_editor_history_display_save_and_front_admin_filters(fixture):
 c,r=fixture;raw='学术动态；研讨, Forum\r\n诊断研究; 学术动态;'
 uid=add(r,'news','Multicategory News',category=raw,is_featured=1)
 add(r,'news','Nonmatching News',category='诊断研究所')
 hidden=add(r,'news','Hidden News',category='PRIVATE_CATEGORY',visibility='hidden')
 # Native UI becomes a multi-value textarea; the stored value remains original text.
 edit=JustHTML(c.get('/admin/news/'+uid+'/edit').text,sanitize=False)
 assert edit.query('textarea[name="category"]')
 assert edit.query('[data-history-field="category"]')[0].attrs['data-history-multiple']=='true'
 form=edit.query('form#native-editor')[0]
 payload={n.attrs['name']:n.attrs.get('value','') for n in form.query('input[type="hidden"]')}
 payload['category']='学术动态\n诊断研究;研讨, Forum'
 response=c.post('/admin/news/save',data=payload,headers={'Origin':r.config.origin},follow_redirects=False)
 assert response.status_code==303
 assert run(r.sql.query('SELECT category FROM news WHERE uid=?',(uid,)))[0]['category']==payload['category']
 for path in ['/zh/news','/zh/news/'+uid]:
  doc=JustHTML(c.get(path).text,sanitize=False)
  card=doc.query('[data-record-id="'+uid+'"]')[0]
  assert len(card.query('[data-news-category]'))==3
  assert not doc.query('[data-news-category] script')
 for value in ['诊断研究','研讨, Forum']:
  public=c.get('/zh/news',params={'f.category':value});assert public.status_code==200
  doc=JustHTML(public.text,sanitize=False);assert [n.attrs['data-record-id'] for n in doc.query('[data-stream-items] article')]==[uid]
  admin=JustHTML(c.get('/admin/news',params={'f.category':value}).text,sanitize=False)
  assert [n.attrs['data-uid'] for n in admin.query('tr[data-uid]')]==[uid]
  assert len(admin.query('td[data-column="category"] [data-news-category]'))==3
 facets=run(people_facet(r.content,'news','category'))['values']
 assert '研讨, Forum' in facets and '诊断研究' in facets and 'PRIVATE_CATEGORY' not in facets
 result=run(suggestions(r.content,r.p,{'table':'news','field':'category','query':'研讨'}))
 assert result['multiple'] is True and result['values']==['研讨, Forum']
 model=c.get('/api/public/data/zh/news').json()
 assert model['semantics']['filters']['category']['facet_tokens'] is True
 item=next(item for item in model['items'] if item['uid']==uid)
 assert item['filter_tokens']['category']==['学术动态','诊断研究','研讨, Forum']
 assert all(item['uid']!=hidden for item in model['items'])
 run(r.content.save('navigation_items',r.p,{'title':'Category','url_name':'news-topic','kind':'route','location':'header','visibility':'public','enabled':1,'path':build_public_path('news',[{'field':'category','operator':'eq','value':'诊断研究'}])}))
 fixed=JustHTML(c.get('/zh/n/news-topic').text,sanitize=False)
 assert [n.attrs['data-record-id'] for n in fixed.query('[data-stream-items] article')]==[uid]
