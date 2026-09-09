import assert from 'node:assert/strict'
import test from 'node:test'
import { core, load, createHarness, createPublicServices, insert, iso, recordingAdapter, request, seedPublicContent } from '../helpers/offline-stage5.mjs'
const { publicCitation, splitCitationHighlights } = load('server/services/public/public-citation.js')
const { parsePublicSelectionRequest, readPublicSelection } = load('server/services/public/public-selection.js')
const { generatePublicationCitations } = load('shared/admin/publication-tools.js')
const select = (services,uids,style='gbt',locale='zh')=>readPublicSelection({module:'publications',locale,uids,citationStyle:style},query=>services.publications.list(query))
const source={uid:'p',title:'Original Title',authors:'San Zhang; Jane Doe',venue:'Original Journal',year:2026,volume:null,issue:null,pages:null,doi:null,url:null,publicationType:'期刊论文',text:null,highlights:null}

test('saved citation text is preserved exactly and comma-containing highlight names stay intact',()=>{
  const text='[7]  Zhang, S.*, & Doe, J. (2026).  A < B & C.\nJournal 8: 10–20. DOI:10.1000/ABC.'
  const citation=publicCitation({...source,text,highlights:'Zhang, S.；Doe, J.'},'apa')
  assert.equal(citation.text,text);assert.equal(citation.status,'saved')
  assert.deepEqual(citation.highlights,['Zhang, S.','Doe, J.'])
  assert.deepEqual(splitCitationHighlights('张三，李四；张三'),['张三','李四'])
  assert.throws(()=>splitCitationHighlights(Array.from({length:25},(_,i)=>'Name '+i).join(';')))
})
test('fallback reuses the admin generator, omits unknown bibliographic fields and exposes missing formats',()=>{
  const generated=generatePublicationCitations({uid:'p',title:source.title,authors:source.authors,venue:source.venue,year:source.year,publication_type:source.publicationType}).fields
  for(const style of ['gbt','elsevier','apa','ieee']) {
    const actual=publicCitation(source,style)
    assert.equal(actual.text,generated['citation_'+style]);assert.equal(actual.status,'generated')
    assert.ok(!actual.text.includes('vol.'));assert.ok(!actual.text.includes('pp.'));assert.ok(!actual.text.includes('*'))
    for(const patch of [{authors:null},{venue:null},{year:null},{publicationType:null},{publicationType:'未知类型'}]) {
      const missing=publicCitation({...source,...patch},style)
      assert.equal(missing.status,'missing');assert.equal(missing.text,'')
    }
  }
})
test('citation controls are accepted only by the bounded publication endpoint',()=>{
  for(const value of ['vancouver','APA',['apa'],null,"apa; DELETE FROM publications"])assert.throws(()=>parsePublicSelectionRequest({module:'publications',locale:'zh',uid:'p',citationStyle:value}))
  assert.throws(()=>parsePublicSelectionRequest({module:'projects',locale:'zh',uid:'p',citationStyle:'apa'}))
  assert.throws(()=>core.parsePublicListRequest({locale:'zh',citationStyle:'apa'},[]))
})
for(const kind of ['sqlite','d1']) {
  test(`${kind}: list preparation and detail use identical four styles without translating or modifying editorial citations`,async t=>{
    const h=createHarness(kind);t.after(()=>h.close());await seedPublicContent(h)
    const exact='[12]  Zhang, M.*, & Li, H. (2026). Original title. Original Journal, 12(3), 1–20. DOI:10.1234/ABC.'
    insert(h.db,"UPDATE publications SET citation_apa=?, highlight_apa='Zhang, M.', citation_elsevier=NULL, citation_ieee=NULL WHERE uid='publication:one'",exact)
    const services=createPublicServices(h.adapter,{value:Date.parse(iso())})
    const before=h.db.prepare("SELECT * FROM publications WHERE uid='publication:one'").get()
    const detail=(await services.publications.detail('en','publication:one')).viewModel.item
    for(const style of ['gbt','elsevier','apa','ieee']) {
      const zh=await select(services,['publication:one'],style),en=await select(services,['publication:one'],style,'en')
      assert.equal(zh.citationStyle,style);assert.deepEqual(en.items[0].citation,zh.items[0].citation)
      assert.deepEqual(en.items[0].citation,detail.citations.find(citation=>citation.style===style))
      assert.equal(en.items[0].pdf.available,true)
      assert.equal(en.items[0].displayNumber,zh.items[0].displayNumber)
    }
    assert.equal(detail.citations.find(c=>c.style==='apa').text,exact)
    assert.deepEqual(detail.citations.find(c=>c.style==='apa').highlights,['Zhang, M.'])
    assert.deepEqual(h.db.prepare("SELECT * FROM publications WHERE uid='publication:one'").get(),before)
  })
  test(`${kind}: batches retrieve only the current style, preserve long text, enforce PDF permission and ignore hidden records`,async t=>{
    const h=createHarness(kind);t.after(()=>h.close());await seedPublicContent(h)
    const long='Complete citation. '.repeat(1500)
    insert(h.db,"UPDATE publications SET citation_gbt=?,citation_apa='UNREQUESTED-APA',pdf_visibility='hidden' WHERE uid='publication:one'",long)
    const tracked=recordingAdapter(h.adapter),services=createPublicServices(tracked,{value:Date.parse(iso())})
    const batch=await select(services,['publication:one','publication:hidden'])
    assert.equal(batch.items[0].citation.text,long);assert.equal(batch.items[0].pdf.available,false)
    assert.deepEqual(batch.unavailableUids,['publication:hidden'])
    assert.ok(!JSON.stringify(batch).includes('UNREQUESTED-APA'))
    const sql=tracked.commands.flatMap(command=>command.commands??[command]).map(command=>command.sql).join('\n')
    assert.ok(sql.includes('citation_gbt AS citation_text'));assert.ok(!sql.includes('citation_apa AS citation_text'));assert.ok(!sql.includes('abstract'))
    const list=(await services.publications.list(request())).viewModel
    assert.ok(list.items.every(item=>!('citation' in item)))
  })
  test(`${kind}: missing current format remains explicit even if another format is available`,async t=>{
    const h=createHarness(kind);t.after(()=>h.close());await seedPublicContent(h)
    insert(h.db,"UPDATE publications SET authors=NULL,venue=NULL,year=NULL,citation_gbt='Saved GB/T',citation_apa=NULL WHERE uid='publication:one'")
    const services=createPublicServices(h.adapter,{value:Date.parse(iso())})
    const batch=await select(services,['publication:one'],'apa')
    assert.equal(batch.items[0].citation.status,'missing');assert.equal(batch.items[0].citation.text,'')
    assert.deepEqual(batch.unavailableUids,[])
    assert.equal((await select(services,['publication:one'],'gbt')).items[0].citation.text,'Saved GB/T')
  })
}
