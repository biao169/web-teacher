import test from 'node:test'
import assert from 'node:assert/strict'
import { core, createHarness, createInteractionServices, seedHarness } from '../helpers/offline-stage6.mjs'

test('registration throttle is keyed independently from login throttling',async()=>{
 const h=createHarness();try{const seeded=await seedHarness(h);const s=createInteractionServices(h,seeded.passwords,{registrationLimit:1})
 await s.registration.register({username:'rate_one',password:'A unique registration passphrase 2026!',network:'198.51.100.1',requestId:'r1'})
 await assert.rejects(()=>s.registration.register({username:'rate_one',password:'A unique registration passphrase 2026!',network:'198.51.100.1',requestId:'r2'}),e=>e.code==='AUTH_THROTTLED'&&e.statusCode===429)
 assert.equal(h.db.prepare("SELECT count(*) total FROM public_action_throttles WHERE action='registration'").get().total>=2,true)
 assert.equal(h.db.prepare('SELECT count(*) total FROM auth_login_throttles').get().total,10)
 }finally{h.close()}
})

test('contact honeypot returns an indistinguishable receipt without writing a message',async()=>{
 const h=createHarness();try{const seeded=await seedHarness(h);const s=createInteractionServices(h,seeded.passwords)
 const before=h.db.prepare('SELECT count(*) total FROM messages').get().total
 const result=await s.contact.submit({name:'Bot',email:'bot@example.invalid',messageType:'other',subject:'This field looks valid',content:'This body is long enough but the hidden website field is intentionally filled.',website:'https://spam.example',network:'203.0.113.10',requestId:'bot',session:null})
 assert.equal(result.accepted,true);assert.match(result.reference,/^message:/u);assert.equal(h.db.prepare('SELECT count(*) total FROM messages').get().total,before)
 }finally{h.close()}
})

test('contact throttle blocks the fifth submission for one identity',async()=>{
 const h=createHarness();try{const seeded=await seedHarness(h);const s=createInteractionServices(h,seeded.passwords,{contactLimit:4})
 for(let i=0;i<4;i+=1) await s.contact.submit({name:'Rate Test',email:'rate@example.invalid',messageType:'other',subject:`Valid rate test subject ${i}`,content:'This is a sufficiently long test message for public contact throttling.',network:`203.0.113.${20+i}`,requestId:`c${i}`,session:null})
 await assert.rejects(()=>s.contact.submit({name:'Rate Test',email:'rate@example.invalid',messageType:'other',subject:'Fifth valid subject',content:'This is the fifth sufficiently long test message for public contact throttling.',network:'203.0.113.30',requestId:'c5',session:null}),e=>e.code==='INTERACTION_THROTTLED'&&e.statusCode===429)
 }finally{h.close()}
})

test('safe redirect helper rejects cross-origin and privileged internal destinations',()=>{
 assert.equal(core.safeApplicationRedirect('/zh/publications?page=2','/zh'),'/zh/publications?page=2')
 for(const value of ['https://evil.example','//evil.example','/api/v1/auth/session','/_nuxt/x.js','/media/secret','/zh/../admin','/\\admin']) assert.equal(core.safeApplicationRedirect(value,'/zh'),'/zh')
})


test('honeypot submissions cannot consume a real visitor throttle budget',async()=>{
 const h=createHarness();try{const seeded=await seedHarness(h);const s=createInteractionServices(h,seeded.passwords,{contactLimit:1})
 const baseline=h.db.prepare("SELECT count(*) total FROM public_action_throttles WHERE action='contact'").get().total
 const common={name:'Shared Visitor',email:'shared@example.invalid',messageType:'other',subject:'A valid shared subject',content:'This is a sufficiently long contact message used to verify honeypot isolation.',network:'203.0.113.77',session:null}
 const decoy=await s.contact.submit({...common,website:'https://automated.example',requestId:'honeypot-first'})
 assert.equal(decoy.accepted,true)
 assert.equal(h.db.prepare("SELECT count(*) total FROM public_action_throttles WHERE action='contact'").get().total,baseline)
 const real=await s.contact.submit({...common,website:'',requestId:'real-after-honeypot'})
 assert.equal(real.accepted,true)
 assert.equal(h.db.prepare("SELECT count(*) total FROM messages WHERE email='shared@example.invalid'").get().total,1)
 }finally{h.close()}
})

test('public registration does not depend on a post-commit credential readback',async()=>{
 const h=createHarness();try{
  await seedHarness(h)
  const passwordHash=h.db.prepare("SELECT password_hash FROM auth_users WHERE username='demo_admin'").get().password_hash
  const adapter={kind:h.adapter.kind,metrics:h.adapter.metrics,batch:commands=>h.adapter.batch(commands),execute:async()=>{throw new Error('simulated readback outage')}}
  const store=new core.AuthStore(adapter)
  await assert.doesNotReject(()=>store.registerPublicUser({
   userUid:'user:postcommit-safe',username:'postcommit_safe',passwordHash,displayName:'Post Commit',email:'postcommit@example.invalid',at:'2026-08-29T10:10:00.000Z',
   audit:{uid:'audit:postcommit-safe',at:'2026-08-29T10:10:00.000Z',actor:{uid:'user:postcommit-safe',name:'Post Commit'},action:'register',module:'auth',targetUid:'user:postcommit-safe',summary:'Public user registered',detail:{request_id:'postcommit'},status:'success'},
  }))
  assert.equal(h.db.prepare("SELECT count(*) total FROM auth_users WHERE uid='user:postcommit-safe'").get().total,1)
  assert.equal(h.db.prepare("SELECT count(*) total FROM operation_logs WHERE uid='audit:postcommit-safe'").get().total,1)
 }finally{h.close()}
})

test('a disabled contact race cannot commit an audit event for an old colliding message uid',async()=>{
 const h=createHarness();try{
  await seedHarness(h)
  h.db.prepare("INSERT INTO global_settings(uid,created_at,updated_at,allow_public_registration,allow_anonymous_messages) VALUES('test:contact-disabled-race','2026-08-29T10:20:00.000Z','2026-08-29T10:20:00.000Z',1,0)").run()
  const before=h.db.prepare("SELECT count(*) total FROM operation_logs WHERE uid='audit:contact-race'").get().total
  const store=new core.ContactStore(h.adapter)
  await assert.rejects(()=>store.create({
   uid:'demo:message:01',at:'2026-08-29T10:21:00.000Z',authenticated:false,name:'Race Visitor',email:'race@example.invalid',messageType:'other',subject:'A race-safe contact subject',content:'This message must not be inserted after anonymous contact is disabled.',
   audit:{uid:'audit:contact-race',at:'2026-08-29T10:21:00.000Z',actor:{uid:null,name:'Race Visitor'},action:'message_submit',module:'messages',targetUid:'demo:message:01',summary:'Contact message submitted',detail:{request_id:'race'},status:'success'},
  }),error=>error.code==='INTERACTION_DISABLED')
  assert.equal(h.db.prepare("SELECT count(*) total FROM operation_logs WHERE uid='audit:contact-race'").get().total,before)
 }finally{h.close()}
})
