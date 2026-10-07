"""Exact-DOI correspondence supplement and grouped single-translation HTTP regression."""
import json
from urllib.parse import urlsplit
import pytest
from test_translation_regression import fixture,run,source,cache
from backend.app.native.metadata_search import MetadataSearch
from backend.app.native.metadata_sources import extract
from backend.app.native.translation_groups import TranslationGroups

DOI='10.1234/synthetic'
class Scholar:
    def __init__(self,mode='good'):self.calls=[];self.mode=mode
    async def get(self,url,headers=None):
        self.calls.append(url)
        if urlsplit(url).hostname=='api.crossref.org':return 200,{'message':{'DOI':DOI,'title':['Original title'],'author':[{'given':'A','family':'Chen'}]}}
        if self.mode=='failed':return 503,{}
        return 200,{'results':[{'title':'Other title','doi':'https://doi.org/'+('10.1234/other' if self.mode=='mismatch' else DOI),'authorships':[{'author':{'display_name':'A Chen'},'is_corresponding':self.mode=='good'},{'author':{'display_name':'B Lee'},'author_position':'last'}]}]}
def configure(r,enabled=True):
    run(r.sql.batch([("UPDATE global_settings SET publication_metadata_provider='crossref',publication_metadata_providers=?,publication_suggestion_cache_seconds=60",(json.dumps(['crossref','openalex'] if enabled else ['crossref']),))]))

@pytest.mark.parametrize('mode',['good','missing','failed','mismatch'])
def test_exact_doi_supplement_preserves_primary_fields(fixture,mode):
    c,r=fixture;configure(r);r.scholarly=Scholar(mode)
    result=run(MetadataSearch(r).search(DOI,correspondence=True));fields=result['candidates'][0]['fields']
    assert fields['title']=='Original title' and fields['doi']==DOI
    assert fields.get('corresponding_authors')==('A Chen' if mode=='good' else None)
    assert len(r.scholarly.calls)==2
    assert not run(r.sql.query('SELECT uid FROM publications WHERE doi=?',(DOI,)))

def test_supplement_respects_enabled_flag_and_cache(fixture,monkeypatch):
    # Cache has 64 bounded slots: a random settings timestamp can put Crossref
    # and its OpenAlex supplement in the same slot, legitimately evicting each
    # other. Pin only the settings stamp for a deterministic cache-hit test.
    import backend.app.native.metadata_search as search_module
    original=search_module.load_settings
    async def settings(r):
        result=await original(r)
        return dict(result,stamp='metadata-cache-regression')
    monkeypatch.setattr(search_module,'load_settings',settings)
    c,r=fixture;configure(r);r.scholarly=Scholar()
    for _ in range(2):run(MetadataSearch(r).search(DOI,correspondence=True))
    assert len(r.scholarly.calls)==2
    configure(r,False);r.scholarly=Scholar();run(MetadataSearch(r).search(DOI,correspondence=True));assert not any('openalex' in str(call) for call in r.scholarly.calls)
    configure(r);r.scholarly=Scholar();run(MetadataSearch(r).search('10.1234/synthetic',correspondence=False));assert not any('openalex' in v for v in r.scholarly.calls)

def test_openalex_explicit_ids_multiple_markers_no_position_guess():
    payload={'results':[{'title':'Paper','doi':DOI,'corresponding_author_ids':['A2'],'authorships':[{'author':{'id':'A1','display_name':'One'},'is_corresponding':True},{'author':{'id':'A2','display_name':'Two'}},{'author':{'id':'A3','display_name':'Last'},'author_position':'last'}]}]}
    assert extract('openalex',payload,'doi',DOI)[0]['fields']['corresponding_authors']=='One; Two'

def grouped(r):return run(TranslationGroups(r).listing())['rows'][0]
def translate(c,r,group,target,**extra):
    return c.post('/api/assistance/translation-groups/'+group['uid']+'/translate',json={'_csrf':r.p['csrf'],'target_uid':target['uid'],'stamp':target['updated_at'],**extra},headers={'Origin':r.config.origin,'Accept':'application/json'})

def test_list_all_bounded_sources_actions_and_single_reuse(fixture):
    c,r=fixture;targets=[]
    for i in range(5):
        item=source(r,text='同一个词条',name='来源'+str(i));targets.append(cache(r,'profiles',item,'title','Shared' if i==0 else None,manual=int(i==0),current=int(i==0),status='success' if i==0 else 'pending'))
    group=grouped(r);assert len(group['source_items'])==5 and group['edit_uid']==targets[0]['uid']
    target=next(v for v in targets if v['uid']==group['translate_uid']);assert group['translate_stamp']==target['updated_at']
    page=c.get('/admin/translation_cache').text
    assert 'data-translate-entry' in page and '编辑译文' in page and '来源记录，可上下滚动' in page
    response=translate(c,r,group,target);assert response.status_code==200,response.text
    assert response.json()['reused'] is True
    assert run(r.content.get('translation_cache',targets[0]['uid'],r.p))['translated_text']=='Shared'
    assert sum(run(r.content.get('translation_cache',v['uid'],r.p))['status']=='pending' for v in targets)==3

@pytest.mark.parametrize('case',['manual','stale','other-group','csrf','changed-source','revoked'])
def test_single_translation_guards_do_not_send_network(fixture,case,monkeypatch):
    c,r=fixture;item=source(r);target=cache(r,'profiles',item,'title',None,current=0,status='pending',manual=int(case=='manual'));group=grouped(r)
    from backend.app.native.translation_service import TranslationService
    async def forbidden(*args,**kwargs):raise AssertionError('Provider must not run')
    monkeypatch.setattr(TranslationService,'execute',forbidden)
    extra={}
    if case=='stale':target['updated_at']='2000-01-01T00:00:00.000Z'
    elif case=='csrf':extra['_csrf']='bad'
    elif case=='other-group':other=source(r,text='另一词条');target=cache(r,'profiles',other,'title',None,current=0,status='pending')
    elif case=='changed-source':run(r.content.save('profiles',r.p,{'title':'新原文'},item['uid'],item['updated_at']))
    elif case=='revoked':run(r.sql.batch([("UPDATE auth_permissions SET can_edit=0 WHERE role_uid=? AND module='translation_cache'",(r.p['role_uid'],))]))
    assert translate(c,r,group,target,**extra).status_code in (403,409)
