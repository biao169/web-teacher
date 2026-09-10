import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { root } from '../helpers/offline-stage6.mjs'

const read = path => readFile(resolve(root,path),'utf8')

test('Chinese and English interaction route trees are symmetrical',async()=>{
 for(const file of ['login.vue','register.vue','contact.vue','account/index.vue','account/password.vue']){
  assert.equal(await read(`app/pages/zh/${file}`).then(()=>true),true);assert.equal(await read(`app/pages/en/${file}`).then(()=>true),true)
 }
})

test('interaction write routes explicitly disable caching and enforce bounded JSON protection',async()=>{
 const routes=['server/routes/api/v1/auth/register.post.ts','server/routes/api/v1/auth/password/change.post.ts','server/routes/api/v1/auth/session/refresh.post.ts','server/routes/api/v1/auth/sessions/revoke-all.post.ts','server/routes/api/v1/public/contact.post.ts']
 for(const route of routes){const source=await read(route);assert.match(source,/applyPrivateNoStore|setHeader\(event, 'cache-control'/u,route);assert.match(source,/protectJsonWrite/u,route);assert.match(source,/readBoundedJsonBody/u,route)}
})

test('public interaction UI has no raw HTML or direct server/database imports',async()=>{
 const dirs=['app/components/public/auth','app/components/public/contact']
 for(const dir of dirs)for(const file of await readdir(resolve(root,dir))){const source=await read(`${dir}/${file}`);assert.doesNotMatch(source,/\bv-html\b|~~\/(?:db|server)\//u,file)}
})

test('sample seed CLI requires explicit path, demo acknowledgement and password',async()=>{
 const source=await read('scripts/db/seed-sample.ts')
 assert.match(source,/I_UNDERSTAND_THIS_IS_DEMO_ONLY/u);assert.match(source,/CMS_DEMO_PASSWORD/u);assert.match(source,/--database/u);assert.match(source,/NODE_ENV === 'production'/u);assert.match(source,/data\/site\.sqlite3/u)
})


test('contact pages remain indexable while account surfaces are noindex',async()=>{
 for(const locale of ['zh','en']){
  const contact=await read(`app/pages/${locale}/contact.vue`)
  assert.match(contact,/usePublicContentSeo\(/u)
  assert.match(await read('app/composables/usePublicContentSeo.ts'), /robots:.*publicPageRobots/u)
  for(const file of ['login.vue','register.vue','account/index.vue','account/password.vue']){
   assert.match(await read(`app/pages/${locale}/${file}`),/robots:\s*'noindex, nofollow'/u,`${locale}/${file}`)
  }
 }
})

test('registration-to-login handoff preserves username and a safe next destination',async()=>{
 const login=await read('app/components/public/auth/LoginForm.vue')
 const register=await read('app/components/public/auth/RegisterForm.vue')
 assert.match(login,/route\.query\.username/u)
 assert.match(login,/USERNAME_PATTERN|\[A-Za-z\]/u)
 assert.match(register,/route\.query\.next/u)
 assert.match(register,/username:\s*receipt/u)
})

test('runtime and schema declarations include stage-6 technical tables and migrations',async()=>{
 const nodeRuntime=await read('db/runtime/node.ts')
 assert.match(nodeRuntime,/0004_public_content_indexes\.sql/u)
 assert.match(nodeRuntime,/0005_public_interactions_and_demo_seed\.sql/u)
 const schema=await read('db/interaction-schema.ts')
 assert.match(schema,/publicActionThrottles/u)
 assert.match(schema,/demoSeedState/u)
 assert.match(schema,/ck_public_action_throttles_action/u)
 assert.match(schema,/ck_demo_seed_state_singleton/u)
})
