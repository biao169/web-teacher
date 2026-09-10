import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareDevelopment } from '../../scripts/windows/prepare-development.mjs'

test('development preparation removes only generated caches and is repeatable', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cms-dev-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const files = {
    'package.json': JSON.stringify({ name: 'academic-cms' }),
    'nuxt.config.ts': 'config',
    'shared/complete-admin/core.mjs': 'export {}',
    '.nuxt/dev/index.mjs': 'stale import',
    'node_modules/.cache/nuxt/old.mjs': 'stale',
    '.env': 'local configuration',
    'data/site.sqlite3': 'database fixture',
    'media/upload.bin': 'upload fixture',
    'node_modules/example/index.js': 'dependency fixture',
    '.output/server/index.mjs': 'production fixture',
  }
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(join(root, name, '..'), { recursive: true })
    await writeFile(join(root, name), contents)
  }
  await prepareDevelopment(root)
  await prepareDevelopment(root)
  for (const [name, contents] of Object.entries(files)) {
    if (name.startsWith('.nuxt/') || name.startsWith('node_modules/.cache/nuxt/')) {
      await assert.rejects(access(join(root, name)), { code: 'ENOENT' })
    } else assert.equal(await readFile(join(root, name), 'utf8'), contents)
  }
})

test('incomplete source package fails before deleting any cache', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cms-dev-incomplete-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'academic-cms' }))
  await writeFile(join(root, 'nuxt.config.ts'), 'config')
  await mkdir(join(root, '.nuxt'))
  await writeFile(join(root, '.nuxt/keep'), 'unchanged')
  await assert.rejects(prepareDevelopment(root), { code: 'ENOENT' })
  assert.equal(await readFile(join(root, '.nuxt/keep'), 'utf8'), 'unchanged')
})
