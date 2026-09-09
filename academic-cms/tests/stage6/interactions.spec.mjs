import test from 'node:test'
import assert from 'node:assert/strict'
import { core, createHarness, createInteractionServices, seedHarness } from '../helpers/offline-stage6.mjs'

for (const kind of ['sqlite','d1']) {
  test(`public registration creates only a least-privilege account atomically on ${kind}`, async () => {
    const h=createHarness(kind)
    try {
      const seeded=await seedHarness(h); const s=createInteractionServices(h,seeded.passwords)
      const result=await s.registration.register({username:'new_researcher',password:'123456',displayName:'New Researcher',email:'new@example.invalid',network:'192.0.2.10',requestId:'req-reg'})
      assert.equal(result.username,'new_researcher')
      const row=h.db.prepare('SELECT role_uid,status,must_change_password FROM auth_users WHERE username=?').get('new_researcher')
      assert.equal(row.role_uid,core.REGISTERED_USER_ROLE_UID); assert.equal(row.status,'active'); assert.equal(row.must_change_password,0)
      assert.equal(h.db.prepare("SELECT count(*) total FROM operation_logs WHERE action='register' AND target_uid=(SELECT uid FROM auth_users WHERE username='new_researcher')").get().total,1)
      assert.equal(h.db.prepare('SELECT count(*) total FROM auth_permissions WHERE role_uid=?').get(core.REGISTERED_USER_ROLE_UID).total,0)
    } finally {h.close()}
  })
}

test('registration obeys the latest global setting and role invariant', async()=>{
  const h=createHarness(); try{
    const seeded=await seedHarness(h); const s=createInteractionServices(h,seeded.passwords)
    h.db.prepare("UPDATE auth_roles SET level=999 WHERE uid=?").run(core.REGISTERED_USER_ROLE_UID)
    await assert.rejects(()=>s.registration.register({username:'blocked_role',password:'A separate registration passphrase 2026!',network:'192.0.2.11',requestId:'x'}),e=>e.code==='AUTH_CONFLICT')
    assert.equal(h.db.prepare("SELECT count(*) total FROM auth_users WHERE username='blocked_role'").get().total,0)
    h.db.prepare("INSERT INTO global_settings(uid,created_at,updated_at,allow_public_registration,allow_anonymous_messages) VALUES('test:settings:disabled','2026-08-29T11:00:00.000Z','2026-08-29T11:00:00.000Z',0,1)").run()
    assert.equal(await s.registration.available(),false)
  } finally {h.close()}
})

test('password change preserves the current session and revokes every other session',async()=>{
  const h=createHarness(); try{
    const seeded=await seedHarness(h); const s=createInteractionServices(h,seeded.passwords)
    const credential=await s.authStore.findCredentialByUsername('demo_admin'); assert.ok(credential)
    const one=await s.sessions.createForCredential(credential,{accountThrottleHash:'a'.repeat(64),requestId:'login-1'})
    const two=await s.sessions.createForCredential(credential,{accountThrottleHash:'b'.repeat(64),requestId:'login-2'})
    const active=await s.sessions.resolve(one.sessionToken); assert.ok(active)
    const refreshed=await s.account.changePassword(active,{currentPassword:seeded.password,newPassword:'abcdef',requestId:'change-1'})
    assert.equal(refreshed.sessionToken,one.sessionToken)
    await assert.rejects(()=>s.sessions.resolve(two.sessionToken),e=>e.code==='AUTH_SESSION_INVALID')
    assert.ok(await s.sessions.resolve(one.sessionToken))
    assert.equal(h.db.prepare("SELECT count(*) total FROM operation_logs WHERE action='password_change'").get().total,1)
  } finally {h.close()}
})

test('revoke all sessions logs once and invalidates the current device',async()=>{
  const h=createHarness(); try{
    const seeded=await seedHarness(h); const s=createInteractionServices(h,seeded.passwords)
    const credential=await s.authStore.findCredentialByUsername('demo_admin'); const created=await s.sessions.createForCredential(credential,{accountThrottleHash:'a'.repeat(64),requestId:'login'})
    const active=await s.sessions.resolve(created.sessionToken); const count=await s.account.revokeAllSessions(active,'revoke')
    assert.ok(count>=1); await assert.rejects(()=>s.sessions.resolve(created.sessionToken),e=>e.code==='AUTH_SESSION_INVALID')
    assert.equal(h.db.prepare("SELECT count(*) total FROM operation_logs WHERE action='sessions_revoke_all'").get().total,1)
  } finally {h.close()}
})

test('contact accepts anonymous or authenticated submissions according to settings',async()=>{
  const h=createHarness(); try{
    const seeded=await seedHarness(h); const s=createInteractionServices(h,seeded.passwords)
    const before=h.db.prepare('SELECT count(*) total FROM messages').get().total
    const receipt=await s.contact.submit({name:'Visitor',email:'visitor@example.invalid',messageType:'collaboration',subject:'Potential research collaboration',content:'I would like to discuss a possible research collaboration with the team.',network:'192.0.2.20',requestId:'contact-1',session:null})
    assert.equal(receipt.accepted,true); assert.equal(h.db.prepare('SELECT count(*) total FROM messages').get().total,before+1)
    h.db.prepare("INSERT INTO global_settings(uid,created_at,updated_at,allow_public_registration,allow_anonymous_messages) VALUES('test:settings:no-anon','2026-08-29T12:00:00.000Z','2026-08-29T12:00:00.000Z',1,0)").run()
    await assert.rejects(()=>s.contact.submit({name:'Visitor',email:'visitor2@example.invalid',messageType:'other',subject:'A second inquiry',content:'This anonymous message should be rejected by the current global setting.',network:'192.0.2.21',requestId:'contact-2',session:null}),e=>e.code==='INTERACTION_AUTH_REQUIRED')
    const credential=await s.authStore.findCredentialByUsername('demo_admin'); const created=await s.sessions.createForCredential(credential,{accountThrottleHash:'c'.repeat(64),requestId:'login'}); const active=await s.sessions.resolve(created.sessionToken)
    await s.contact.submit({messageType:'project',subject:'Authenticated project message',content:'This authenticated submission remains allowed when anonymous messages are disabled.',network:'192.0.2.22',requestId:'contact-3',session:active})
    assert.equal(h.db.prepare('SELECT count(*) total FROM messages').get().total,before+2)
  } finally {h.close()}
})

for (const kind of ['sqlite', 'd1']) {
 test(`news messages resolve a trusted origin and reject closed or unavailable news on ${kind}`, async () => {
  const h = createHarness(kind)
  try {
   const seeded = await seedHarness(h); const services = createInteractionServices(h, seeded.passwords, { contactLimit: 20 })
   const news = h.db.prepare("SELECT uid,title,slug FROM news WHERE visibility='public' AND allow_comments=1 ORDER BY id LIMIT 1").get()
   const body = 'A sufficiently long news inquiry. The submitted body must remain intact.'
   const input = { newsUid: news.uid, name: 'Visitor', email: 'news-origin@example.invalid', messageType: 'other', subject: 'News inquiry', content: body, network: '192.0.2.80', requestId: 'news-origin', session: null }
   const receipt = await services.contact.submit(input)
   const row = h.db.prepare('SELECT content,visibility,status FROM messages WHERE uid=?').get(receipt.reference)
   assert.ok(row.content.includes(news.title)); assert.ok(row.content.includes(`/zh/news/${news.slug}`)); assert.ok(row.content.endsWith(body))
   assert.equal(row.visibility, 'hidden'); assert.equal(row.status, 'new')
   const audit = h.db.prepare("SELECT detail_json FROM operation_logs WHERE target_uid=? AND action='message_submit'").get(receipt.reference)
   assert.equal(JSON.parse(audit.detail_json).news_uid, news.uid)
   const count = h.db.prepare('SELECT count(*) total FROM messages').get().total
   for (const change of ["allow_comments=0", "allow_comments=1,visibility='hidden'", "visibility='public',published_at='2099-01-01T00:00:00.000Z'"]) {
    h.db.prepare(`UPDATE news SET ${change} WHERE uid=?`).run(news.uid)
    await assert.rejects(() => services.contact.submit(input), error => error.code === 'INTERACTION_DISABLED')
   }
   await assert.rejects(() => services.contact.submit({ ...input, newsUid: 'news:missing' }), error => error.code === 'INTERACTION_DISABLED')
   assert.equal(h.db.prepare('SELECT count(*) total FROM messages').get().total, count)
  } finally { h.close() }
 })
 test(`news policy is checked again inside the atomic message/audit write on ${kind}`, async () => {
  const h = createHarness(kind)
  try {
   await seedHarness(h)
   const news = h.db.prepare('SELECT uid FROM news WHERE allow_comments=1 LIMIT 1').get()
   const store = new core.ContactStore(h.adapter)
   assert.ok(await store.messageableNews(news.uid, '2026-08-29T10:00:00.000Z'))
   h.db.prepare('UPDATE news SET allow_comments=0 WHERE uid=?').run(news.uid)
   const uid = 'message:news-policy-race', auditUid = 'audit:news-policy-race'
   await assert.rejects(() => store.create({ newsUid: news.uid, uid, at: '2026-08-29T10:00:00.000Z', authenticated: true, name: 'Visitor', email: null, messageType: 'other', subject: 'A race test', content: 'A sufficiently long race-safe message.', audit: { uid: auditUid, at: '2026-08-29T10:00:00.000Z', actor: { uid: null, name: 'Visitor' }, action: 'message_submit', module: 'messages', targetUid: uid, summary: 'Race test', detail: {}, status: 'success' } }), error => error.code === 'INTERACTION_DISABLED')
   assert.equal(h.db.prepare('SELECT count(*) total FROM messages WHERE uid=?').get(uid).total, 0)
   assert.equal(h.db.prepare('SELECT count(*) total FROM operation_logs WHERE uid=?').get(auditUid).total, 0)
  } finally { h.close() }
 })
}
