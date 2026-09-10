import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = (path) => readFile(resolve(root, path), 'utf8')

async function filesUnder(directory) {
  const base = resolve(root, directory)
  const output = []
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) output.push(relative(root, path).replaceAll('\\', '/'))
    }
  }
  await walk(base)
  return output
}

test('D1 optimistic writes fail inside the same database batch', async () => {
  const source = await read('server/database/d1/atomic-batch.ts')
  assert.match(source, /VALUES\s*\(\?,\s*\?,\s*changes\(\),\s*\?\)/s)
  assert.match(source, /expectedChanges/)
  assert.match(source, /admin_mutation_guards/)
  assert.equal((source.match(/database\.batch/g) ?? []).length, 1)
})

test('complete-admin integrity migration enforces stable unique identities', async () => {
  const sql = await read('migrations/0008_complete_admin_integrity.sql')
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS ux_auth_users_username_nocase[^\n]+username COLLATE NOCASE/i)
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS ux_auth_permissions_role_module[^\n]+role_uid, module/i)
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS ux_site_settings_single_active[^\n]+is_active/i)
})

test('encrypted restore builds one bounded atomic database batch', async () => {
  const source = await read('server/services/complete-admin/transfer-service.ts')
  assert.match(source, /AES-GCM/)
  assert.match(source, /600_000/)
  assert.match(source, /json_each\(\?\)/)
  assert.match(source, /await db\.batch\(operations\)/)
  assert.equal((source.match(/await db\.batch\(/g) ?? []).length, 1)
  assert.doesNotMatch(source, /for\s*\([^)]*\)\s*\{[^{}]{0,1000}await db\.batch/s)
  assert.match(source, /Backup changed after preview/)
})

test('backup preview returns summaries and not decrypted table rows', async () => {
  const source = await read('server/services/complete-admin/transfer-service.ts')
  const start = source.indexOf('export async function previewAdminBackup')
  const end = source.indexOf('function buildUpsert', start)
  const section = source.slice(start, end)
  assert.match(section, /tables:summary/)
  assert.match(section, /totalRows/)
  assert.doesNotMatch(section, /return\s*\{[^}]*payload\s*:/s)
  assert.doesNotMatch(section, /return\s*\{[^}]*rows\s*:/s)
})

test('binary upload uses binary-aware request protection', async () => {
  const route = await read('server/api/v1/admin/complete/media/upload.post.ts')
  const auth = await read('server/utils/complete-admin/auth.ts')
  assert.match(route, /binary\s*:\s*true/)
  assert.match(auth, /binary\??\s*:\s*boolean/)
  assert.ok(auth.includes('image\\/(?:png') && auth.includes('application\\/(?:pdf'))
})

test('media service applies configured limits, dimensions and lifecycle checks', async () => {
  const source = await read('server/services/complete-admin/media-service.ts')
  assert.match(source, /upload_max_size_mb/)
  assert.match(source, /upload_allowed_extensions/)
  assert.match(source, /detectImageDimensions/)
  assert.match(source, /40[_ ]?000[_ ]?000|40\s*\*\s*1_000_000/)
  assert.match(source, /purge-quarantine/)
  assert.match(source, /media_trash_retention_days/)
})

test('operation logs use the dedicated read-only detail editor', async () => {
  const workspace = await read('app/components/admin/complete/AdminCompleteLogWorkspace.vue')
  assert.match(workspace, /AdminEditorShell/)
  assert.match(workspace, /:can-write="false"/)
  assert.doesNotMatch(workspace, /ElDrawer/)
})

test('all canonical complete backend workspaces exist and legacy pages are removed', async () => {
  const required = [
    'app/pages/admin/settings/site/index.vue',
    'app/pages/admin/settings/global/index.vue',
    'app/pages/admin/navigation/index.vue',
    'app/pages/admin/media/index.vue',
    'app/pages/admin/translation/index.vue',
    'app/pages/admin/auth/index.vue',
    'app/pages/admin/logs/index.vue',
    'app/pages/admin/import-export/index.vue',
    'app/pages/admin/news/index.vue',
    'app/pages/admin/news/editor/[uid]/index.vue',
  ]
  for (const item of required) assert.ok((await stat(resolve(root, item))).isFile(), item)
  const removed = ['site-settings','global-settings','navigation-items','media-library','translation-cache','translations','operation-logs','users','roles','permissions','backup','research-interests','student-category-displays']
  for (const name of removed) await assert.rejects(stat(resolve(root, `app/pages/admin/${name}/index.vue`)), { code: 'ENOENT' })
})

test('consolidated project documentation 01 through 09 exists exactly once', async () => {
  for (let number = 1; number <= 9; number += 1) {
    const prefix = String(number).padStart(2, '0')
    const matches = (await readdir(resolve(root, 'docs'))).filter(name => name.startsWith(`${prefix}_`) && name.endsWith('.md'))
    assert.equal(matches.length, 1, `doc ${prefix}`)
  }
})

test('admin Vue code never uses v-html and public code does not import heavy admin tools', async () => {
  const adminFiles = (await filesUnder('app')).filter(path => path.endsWith('.vue') && path.includes('/admin/'))
  for (const path of adminFiles) assert.doesNotMatch(await read(path), /\bv-html\b/, path)
  const publicFiles = (await filesUnder('app')).filter(path => path.endsWith('.vue') && !path.includes('/admin/') && path !== 'app/layouts/admin.vue')
  for (const path of publicFiles) {
    const source = await read(path)
    assert.doesNotMatch(source, /@tiptap|element-plus|pdfjs|cropper/i, path)
  }
})

test('Tiptap and media editor code is scoped to the admin tree', async () => {
  const files = [...await filesUnder('app'), ...await filesUnder('server'), ...await filesUnder('shared')]
  for (const path of files.filter(path => /\.(?:ts|vue|mjs)$/.test(path))) {
    const source = await read(path)
    if (/@tiptap/.test(source) && !path.startsWith('app/components/admin/') && !path.startsWith('app/pages/admin/')) {
      assert.fail(`Tiptap import outside admin UI: ${path}`)
    }
  }
})

test('package declares every specialized backend dependency and verification command', async () => {
  const pkg = JSON.parse(await read('package.json'))
  for (const dependency of ['element-plus', '@tanstack/vue-query', 'pinia', '@tiptap/vue-3', '@tiptap/starter-kit']) {
    assert.ok(pkg.dependencies?.[dependency] || pkg.devDependencies?.[dependency], dependency)
  }
  assert.ok(pkg.scripts?.['test:complete-admin'])
  assert.ok(pkg.scripts?.['verify:complete-admin'])
})
