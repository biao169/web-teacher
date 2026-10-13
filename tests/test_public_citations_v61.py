"""Public, bounded saved-citation reads do not expose hidden papers or overwrite manual text."""
import pytest
from test_accounts_regression import fixture,run
from test_public_home_step2 import add,configure,DOM

@pytest.mark.parametrize('style',['gbt','elsevier','apa','ieee','bibtex'])
def test_saved_format_order_scope_and_exact_text(fixture,style):
    c,r=fixture;field='bibtex' if style=='bibtex' else 'citation_'+style
    a=add(r,'publications','PaperA');b=add(r,'publications','PaperB');hidden=add(r,'publications','Hidden',visibility='hidden')
    value='  MANUAL <script>literal</script>\n with spacing  '
    for uid in (a,b,hidden):run(r.sql.batch([(f'UPDATE publications SET "{field}"=? WHERE uid=?',(value+uid,uid))]))
    for anonymous in (False,True):
        if anonymous:c.cookies.clear()
        response=c.get('/api/public/publications/citations',params=[('format',style),('uid',b),('uid',hidden),('uid','missing'),('uid',a)])
        assert response.status_code==200 and response.headers['cache-control']=='no-store'
        assert response.json()=={'format':style,'rows':[{'uid':b,'text':value+b},{'uid':a,'text':value+a}]}
    assert run(r.sql.query(f'SELECT "{field}" AS value FROM publications WHERE uid=?',(a,)))[0]['value']==value+a

@pytest.mark.parametrize('style,uids',[('other',['a']),('gbt',[]),('apa',['a']*2),('ieee',[str(i) for i in range(21)]),('bibtex',['a'*129])])
def test_invalid_format_and_batches_rejected(fixture,style,uids):
    c,r=fixture
    assert c.get('/api/public/publications/citations',params=[('format',style),*[('uid',x) for x in uids]]).status_code==422

def test_twenty_records_missing_and_oversize_are_bounded(fixture):
    c,r=fixture;uids=[add(r,'publications',str(i),citation_apa='APA') for i in range(20)]
    run(r.sql.batch([('UPDATE publications SET citation_apa=? WHERE uid=?',(' '*3,uids[0])),('UPDATE publications SET citation_apa=? WHERE uid=?',('X'*65537,uids[1]))]))
    response=c.get('/api/public/publications/citations',params=[('format','apa'),*[('uid',x) for x in uids]])
    rows=response.json()['rows'];assert len(rows)==20 and rows[0]['text'] is None and rows[1]['text'] is None
    assert all(set(x)=={'uid','text'} for x in rows)

def test_copy_dropdown_and_footer_do_not_change_site_citation(fixture):
    c,r=fixture;configure(r,publication_citation_style='ieee')
    uid=add(r,'publications','Paper',citation_ieee='IEEE_DISPLAY',citation_apa='APA_NOT_PRELOADED',bibtex='BIB_NOT_PRELOADED',highlight_ieee='IEEE_DISPLAY',doi='10.1/example',publication_type='journal',is_featured=1)
    html=c.get('/en/publications').text
    assert 'IEEE_DISPLAY' in html and 'APA_NOT_PRELOADED' not in html and 'BIB_NOT_PRELOADED' not in html
    assert '<option value="ieee" selected>' in html and 'data-copy-format' in html
    card=html.split('data-record-id="'+uid+'"')[1].split('</article>')[0]
    assert card.index('publication-links')<card.index('content-tags') and 'https://doi.org/10.1/example</a>' in card
    assert 'data-copy-format' not in c.get('/en').text


@pytest.mark.parametrize('lang',['zh','en'])
def test_shared_publication_content_across_standard_fixed_home_and_clone_definition(fixture,lang):
    from justhtml import JustHTML
    from backend.app.native.navigation import build_public_path
    c,r=fixture;uid=add(r,'publications','Unified paper',is_featured=1,doi='10.1000/a(b)',index_type='SCI; EI',display_tags='Tag A; Tag B',corresponding_authors='Smith, John',url='https://publisher.test/paper')
    run(r.sql.batch([('UPDATE publications SET citation_gbt=? WHERE uid=?',('Saved citation <literal>',uid))]))
    configure(r,homepage_publication_limit=1)
    run(r.content.save('navigation_items',r.p,{'title':'Fixed papers','url_name':'fixed-paper','kind':'route','location':'header','visibility':'public','enabled':1,'path':build_public_path('publications',[{'field':'is_featured','operator':'eq','value':1}])}))
    docs=[JustHTML(c.get(path).text,sanitize=False) for path in ['/'+lang+'/publications','/'+lang+'/n/fixed-paper']]
    home=c.get('/'+lang+'/publications?home=1&page=1',headers={'X-Public-Fragment':'1'});assert home.status_code==200
    docs.append(JustHTML(home.json()['html'],sanitize=False))
    cards=[doc.query('article[data-record-id="'+uid+'"]')[0] for doc in docs]
    for card in cards:
        assert card.query('.publication-footer .publication-links [data-copy-citation] svg')
        assert card.query('.publication-footer .content-tags [data-public-authors]')
        assert card.query('[data-citation-status]')[0].attrs['aria-live']=='polite'
        assert card.query('[data-publication-link="doi"]')[0].attrs['href']=='https://doi.org/10.1000/a%28b%29'
    # Same content-body include drives all three wrappers; dynamic clone includes it too.
    assert [card.query('[data-citation-text]')[0].to_html() for card in cards].count(cards[0].query('[data-citation-text]')[0].to_html())==3
    template=docs[0].query('template[data-publication-card]')[0]
    assert template.query('.publication-footer .publication-links [data-copy-citation] svg')
    assert template.query('[data-citation-status]') and template.query('template[data-publication-fallback]')
    assert not docs[1].query('template[data-publication-card]')
