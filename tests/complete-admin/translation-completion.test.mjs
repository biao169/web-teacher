import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')

test('translation workspace mounts the specialist UI and exposes guarded task actions', async () => {
  const [page, workspace] = await Promise.all([read('app/pages/admin/translation/index.vue'), read('app/components/admin/complete/AdminCompleteTranslationWorkspace.vue')])
  assert.match(page, /AdminCompleteTranslationWorkspace/u)
  for (const endpoint of ['/translation/scan', '/translation/run', '/translation/retry', '/translation/task', '/translation/invalidate']) assert.ok(workspace.includes(endpoint), endpoint)
  assert.match(workspace, /hasAdminPermission/u)
  assert.match(workspace, /useAdminEditorLifecycle/u)
  assert.match(workspace, /sourceUpdatedAt/u)
  assert.match(workspace, /activeAction/u)
  assert.match(workspace, /actionIs\('scan'\)/u)
  assert.match(workspace, /aria-label="扫描与校准"/u)
  assert.match(workspace, /scanNotice/u)
  assert.match(workspace, /翻译选中项/u)
  assert.match(workspace, /selectedTranslatable/u)
  assert.doesNotMatch(workspace, /<template #append>[\s\S]*translation-related-tools/u)
})

test('manual translation editor has canonical deep-link, save, and return flows', async () => {
  const workspace = await read('app/components/admin/complete/AdminCompleteTranslationWorkspace.vue')
  for (const contract of [
    /route\.query\.edit/u,
    /router\.replace\(\{ query \}\)/u,
    /restoreEditFromQuery/u,
    /syncEditQuery\(row\.uid\)/u,
    /syncEditQuery\(null\)/u,
    /@back="closeEdit\(\)"/u,
    /@save="saveManual\(false\)"/u,
    /@save-and-return="saveManual\(true\)"/u,
    /TRANSLATION_EDIT_CONFLICT/u,
    /TRANSLATION_SOURCE_CHANGED/u,
  ]) assert.match(workspace, contract)
})

test('specialist admin writes recover a missing readable CSRF cookie before posting', async () => {
  const api = await read('app/composables/useCompleteAdminApi.ts')
  assert.match(api, /csrfTokenForWrite/u)
  assert.match(api, /auth\.load\(true\)/u)
  assert.match(api, /headers\.set\('x-csrf-token', csrf\)/u)
  assert.match(api, /credentials: 'include'/u)
})

test('translation service shares canonical public references and fingerprints', async () => {
  const service = await read('server/services/complete-admin/translation-service.ts')
  assert.match(service, /buildSourceRefKey/u)
  assert.match(service, /translationSourceHash/u)
  assert.ok(!service.includes("join(':')"))
  for (const field of ['navigation_items', 'publication_type', 'corresponding_authors', 'principal', 'inventors', 'content']) assert.ok(service.includes(field), field)
  for (const guard of ['sourceUpdatedAt', 'leaseToken', 'retryAfter', 'MAX_ATTEMPTS', 'TRANSLATION_SOURCE_CHANGED']) assert.ok(service.includes(guard), guard)
  assert.match(service, /public:translations/u)
  assert.match(service, /DATABASE_LIMITS\.batchStatements/u)
  assert.match(service, /planTranslationBatches/u)
  assert.match(service, /buildTranslationEnvelope/u)
  assert.match(service, /providerRequests/u)
  assert.doesNotMatch(service, /provider === 'mymemory' \? 1 : configuredBatch/u)
  assert.doesNotMatch(service, /operations\.slice\(index, index \+ 90\)/u)
})

test('generic translation mutations cannot bypass specialist invariants', async () => {
  const core = await read('shared/complete-admin/core.mjs')
  const descriptor = core.slice(core.indexOf('translation: {'), core.indexOf('users: {'))
  assert.match(descriptor, /translated_text[^\n]+readonly: true/u)
  assert.match(descriptor, /batch: \[\]/u)
  assert.match(descriptor, /source_refs/u)
  assert.match(descriptor, /error_message/u)
  assert.match(descriptor, /public:translations/u)
})

test('translation write routes require edit permission and bounded JSON', async () => {
  for (const route of ['scan.post.ts', 'run.post.ts', '[uid].patch.ts', 'retry.post.ts', 'task.patch.ts', 'invalidate.post.ts', 'test.post.ts']) {
    const source = await read(`server/api/v1/admin/complete/translation/${route}`)
    assert.match(source, /requireAdmin/u)
    assert.match(source, /'edit'/u)
    assert.match(source, /write: true/u)
    assert.match(source, /readBoundedJson/u)
  }
})

test('selected automatic translations can be rerun while manual and inactive records stay protected', async () => {
  const [workspace, service, route] = await Promise.all([
    read('app/components/admin/complete/AdminCompleteTranslationWorkspace.vue'),
    read('server/services/complete-admin/translation-service.ts'),
    read('server/api/v1/admin/complete/translation/run.post.ts'),
  ])
  assert.match(workspace, /body: uids\.length \? \{ uids \} : \{\}/u)
  assert.match(service, /status IN \$\{runnableStatuses\}/u)
  assert.match(service, /is_manual = 0 AND is_current = 1/u)
  assert.match(service, /'pending','failed','success'/u)
  assert.match(service, /INVALID_TRANSLATION_RUN_SELECTION/u)
  assert.match(route, /\.run\(await readBoundedJson/u)
})
