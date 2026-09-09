import assert from 'node:assert/strict'
import test from 'node:test'
import { core, createHarness, createPublicServices, request, seedPublicContent, iso, insert } from '../helpers/offline-stage5.mjs'
import { createHomeService } from '../helpers/offline-stage4.mjs'

for (const kind of ['sqlite','d1']) {
 test(`${kind}: homepage uses first public active featured teacher, permission-projected contacts and complete collection totals`,async t=>{
  const h=createHarness(kind);t.after(()=>h.close());await seedPublicContent(h)
  const clock={value:Date.parse(iso())}
  insert(h.db,"UPDATE profiles SET sort_order=100 WHERE uid='profile:lead'")
  insert(h.db,"UPDATE profiles SET is_featured=1, sort_order=0, bio='FIRST TEACHER BIO', contact_visibility='hidden', email='PRIVATE-FIRST-EMAIL',phone='PRIVATE-FIRST-PHONE',office='PRIVATE-FIRST-OFFICE' WHERE uid='profile:member'")
  const {service}=createHomeService(h.adapter,clock)
  const home=(await service.home('zh')).viewModel,services=createPublicServices(h.adapter,clock)
  assert.equal(home.featuredProfile.uid,'profile:member');assert.equal(home.featuredProfile.biography,'FIRST TEACHER BIO');assert.equal(home.featuredProfile.contact,null)
  assert.ok(!JSON.stringify(home).includes('PRIVATE-FIRST-'))
  for(const [module,key] of [['publications','publications'],['projects','projects'],['research','researchInterests'],['news','news']]) {
   const list=(await services[module].list(request())).viewModel
   assert.equal(home.counts[module],list.totalPublic)
   const numbers=new Map(list.items.map(item=>[item.uid,item.displayNumber]))
   for(const row of home[key])assert.equal(row.displayNumber,numbers.get(row.uid))
   if(module==='publications')assert.equal(home.publicationRevision,list.revision)
  }
  assert.ok(home.counts.publications>home.publications.length)
  assert.ok(home.projects.every(item=>item.summary===null))
 })
 test(`${kind}: homepage limits and featured selection never renumber records or change totals`,async t=>{
  const h=createHarness(kind);t.after(()=>h.close());await seedPublicContent(h)
  const clock={value:Date.parse(iso())}
  insert(h.db,"UPDATE site_settings SET homepage_publication_limit=1, homepage_news_limit=0")
  insert(h.db,"UPDATE publications SET year=2050,is_featured=0 WHERE uid='publication:not-featured'")
  const home=(await createHomeService(h.adapter,clock).service.home('en')).viewModel
  assert.equal(home.counts.publications,3);assert.equal(home.publications.length,1);assert.equal(home.publications[0].displayNumber,2)
  assert.equal(home.news.length,0);assert.equal(home.counts.news,2)
  assert.equal(home.featuredProfile.contact.email,'lead@example.edu')
  insert(h.db,"UPDATE profiles SET visibility='hidden' WHERE uid='profile:lead'")
  const fresh=(await createHomeService(h.adapter,clock).service.home('zh')).viewModel
  assert.equal(fresh.featuredProfile,null)
 })
 test(`${kind}: research detail keeps full localized description and rejects non-public or missing UIDs`,async t=>{
  const h=createHarness(kind);t.after(()=>h.close());await seedPublicContent(h)
  const body='完整研究说明。'.repeat(600)
  insert(h.db,"UPDATE research_interests SET description=? WHERE uid='research:reliable'",body)
  const services=createPublicServices(h.adapter,{value:Date.parse(iso())})
  const detail=(await services.research.detail('zh','research:reliable')).viewModel
  assert.equal(detail.item.description,body);assert.equal(detail.item.href,'/zh/research/research%3Areliable')
  assert.equal(detail.meta.alternatePath,'/en/research/research%3Areliable')
  const list=(await services.research.list(request())).viewModel
  assert.equal(list.items[0].href,detail.item.href)
  await assert.rejects(()=>services.research.detail('zh','missing'),{code:'PUBLIC_NOT_FOUND'})
  insert(h.db,"UPDATE research_interests SET visibility='hidden' WHERE uid='research:reliable'")
  const fresh=createPublicServices(h.adapter,{value:Date.parse(iso())})
  await assert.rejects(()=>fresh.research.detail('en','research:reliable'),{code:'PUBLIC_NOT_FOUND'})
 })
}
