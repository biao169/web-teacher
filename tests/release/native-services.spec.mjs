import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { applyMigrations, loadMigrations } from '../../scripts/db/migrations.mjs'
const require = createRequire(import.meta.url)
const out = process.env.CMS_RELEASE_CORE_OUTPUT
if (!out) throw new Error('Use scripts/run-release-core.mjs; never reuse old compiled output')
const load = file => require(resolve(out,file))
const { SqliteAdapter } = load('db/adapters/sqlite.js')
const { PasswordService } = load('server/security/password.js')
const { AuthTokenService } = load('server/security/tokens.js')
const { AuthStore } = load('server/services/auth/auth-store.js')
const { SessionService } = load('server/services/auth/session-service.js')
const { LoginThrottleService } = load('server/services/auth/throttle-service.js')
const { AuthenticationService } = load('server/services/auth/authentication-service.js')
const { AccountService } = load('server/services/auth/account-service.js')
const { RegistrationService } = load('server/services/auth/registration-service.js')
const { InteractionSettingsStore } = load('server/services/interactions/settings-store.js')
const { PublicActionThrottleStore } = load('server/services/interactions/action-throttle-store.js')
const { PublicActionThrottleService } = load('server/services/interactions/action-throttle-service.js')
const { ContactStore } = load('server/services/contact/contact-store.js')
const { ContactService } = load('server/services/contact/contact-service.js')
const { applySampleSeed, SAMPLE_TABLE_COUNTS } = load('db/seeds/sample-data.js')
const migrations = await loadMigrations(resolve('migrations'))

async function fixture(t) {
  const db = new DatabaseSync(':memory:')
  t.after(()=>db.close())
  db.exec('PRAGMA foreign_keys=ON')
  const connection = { prepare: sql=>db.prepare(sql), exec: sql=>db.exec(sql), get inTransaction(){return db.isTransaction} }
  applyMigrations(connection,migrations)
  const adapter=new SqliteAdapter(connection)
  const passwords=new PasswordService() // Production engine, not the deterministic contract double.
  const password=`Cedar!${randomBytes(18).toString('hex')}!Orbit`
  const passwordHash=await passwords.hash(password)
  const seeded=await applySampleSeed(adapter,{passwordHash})
  const tokens=new AuthTokenService(randomBytes(48).toString('hex'))
  const store=new AuthStore(adapter)
  const sessions=new SessionService(store,tokens)
  const throttle=new LoginThrottleService(store,tokens,{windowSeconds:900,blockSeconds:900,accountFailures:5,networkFailures:30})
  const auth=new AuthenticationService(store,passwords,sessions,throttle)
  const account=new AccountService(store,passwords,sessions)
  const settings=new InteractionSettingsStore(adapter)
  const actionThrottle=new PublicActionThrottleService(new PublicActionThrottleStore(adapter),tokens,{windowSeconds:900,blockSeconds:900,identityLimit:4,networkLimit:20,retentionSeconds:86400})
  const registration=new RegistrationService(store,settings,actionThrottle,passwords)
  const contact=new ContactService(new ContactStore(adapter),settings,actionThrottle)
  return {db,adapter,password,passwords,passwordHash,seeded,auth,store,sessions,account,registration,contact}
}
const login=(f)=>f.auth.login({username:'demo_admin',password:f.password,network:'127.0.0.1',requestId:'native-login'})

test('all 25 sample tables seed into real SQLite with foreign keys and real PBKDF2',async(t)=>{
 const f=await fixture(t)
 assert.deepEqual(f.seeded.counts,SAMPLE_TABLE_COUNTS)
 assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[])
 assert.match(f.passwordHash,/^pbkdf2-sha256\$600000\$/)
 const v=await f.passwords.verify(f.password,f.passwordHash);assert.equal(v.valid,true)
 assert.equal((await f.passwords.verify('An incorrect but long passphrase',f.passwordHash)).valid,false)
})
test('login stores only token digests and resolves actual database-backed sessions',async(t)=>{
 const f=await fixture(t);const created=await login(f)
 const active=await f.sessions.resolve(created.sessionToken)
 assert.equal(active.principal.username,'demo_admin')
 const rows=f.db.prepare('SELECT token_hash FROM auth_sessions WHERE revoked_at IS NULL').all()
 assert.equal(rows.length,1);assert.notEqual(rows[0].token_hash,created.sessionToken)
 assert.equal(JSON.stringify(rows).includes(created.sessionToken),false)
})
test('password change revokes the other device atomically and preserves current device',async(t)=>{
 const f=await fixture(t);const current=await login(f);const other=await login(f)
 const active=await f.sessions.resolve(current.sessionToken)
 const next='123456'
 await f.account.changePassword(active,{currentPassword:f.password,newPassword:next,requestId:'native-password'})
 await assert.rejects(f.sessions.resolve(other.sessionToken))
 assert.equal((await f.sessions.resolve(current.sessionToken)).principal.username,'demo_admin')
 await assert.rejects(login(f))
 const changed=await f.auth.login({username:'demo_admin',password:next,network:'127.0.0.1',requestId:'native-after-change'})
 assert.ok(changed.sessionToken)
})
test('public registration persists only the registered low-privilege role',async(t)=>{
 const f=await fixture(t)
 await f.registration.register({username:'native_reader',password:'abcdef',displayName:'Native Reader',email:'native@example.invalid',network:'127.0.0.1',requestId:'native-register'})
 const row=f.db.prepare('SELECT role_uid,status FROM auth_users WHERE username=?').get('native_reader')
 assert.equal(row.role_uid,'role:registered-user');assert.equal(row.status,'active')
 assert.equal(f.db.prepare('SELECT count(*) n FROM auth_permissions WHERE role_uid=? AND can_edit=1').get(row.role_uid).n,0)
 const signedIn=await f.auth.login({username:'native_reader',password:'abcdef',network:'127.0.0.1',requestId:'native-register-login'})
 assert.ok(signedIn.sessionToken)
})
test('contact and honeypot use real persistence and retain the original message',async(t)=>{
 const f=await fixture(t)
 const before=f.db.prepare('SELECT count(*) n FROM messages').get().n
 const input={name:'Native Visitor',email:'visitor@example.invalid',messageType:'collaboration',subject:'Native integration check',content:'This is a real database contact message with sufficient content.',website:null,network:'127.0.0.1',requestId:'native-contact'}
 const receipt=await f.contact.submit(input,null)
 assert.equal(receipt.accepted,true)
 assert.equal(f.db.prepare('SELECT count(*) n FROM messages').get().n,before+1)
 const saved=f.db.prepare('SELECT content,visibility,status FROM messages WHERE subject=?').get(input.subject)
 assert.equal(saved.content,input.content);assert.equal(saved.visibility,'hidden');assert.equal(saved.status,'new')
 await f.contact.submit({...input,website:'bot-field-filled'},null)
 assert.equal(f.db.prepare('SELECT count(*) n FROM messages').get().n,before+1)
})
test('a second sample seed is rejected without partially replacing existing rows',async(t)=>{
 const f=await fixture(t)
 await assert.rejects(applySampleSeed(f.adapter,{passwordHash:f.passwordHash}))
 for(const [table,count] of Object.entries(SAMPLE_TABLE_COUNTS))assert.equal(f.db.prepare(`SELECT count(*) n FROM "${table}"`).get().n,count)
})
