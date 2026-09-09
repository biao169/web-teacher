import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { relative, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

test('local demo initializer creates a login-ready migrated database', async () => {
  const directory = await mkdtemp(resolve(root, '.tmp/windows-init-test-'))
  const database = resolve(directory, 'demo-site.sqlite3')
  const credentials = resolve(directory, 'demo-login.txt')
  try {
    const result = spawnSync(process.execPath, [
      '--import', 'tsx',
      'scripts/windows/initialize-local-demo.ts',
      '--database', relative(root, database),
      '--credentials', relative(root, credentials),
      '--no-env-update',
    ], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CMS_DEMO_PASSWORD: 'Runtime-Demo-2026-Strong' },
      timeout: 30_000,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const output = JSON.parse(result.stdout)
    assert.equal(output.status, 'ready')
    assert.equal(output.login.username, 'demo_admin')
    assert.equal(output.login.password, 'Runtime-Demo-2026-Strong')
    assert.equal(output.migrations.length, 9)

    const text = await readFile(credentials, 'utf8')
    assert.match(text, /USERNAME=demo_admin/u)
    assert.match(text, /PASSWORD=Runtime-Demo-2026-Strong/u)

    const connection = new Database(database, { readonly: true, fileMustExist: true })
    try {
      assert.equal(connection.pragma('quick_check', { simple: true }), 'ok')
      assert.equal(connection.prepare('SELECT count(*) AS total FROM auth_users').get().total, 10)
      assert.equal(connection.prepare('SELECT count(*) AS total FROM site_settings WHERE is_active = 1').get().total, 1)
      assert.equal(connection.prepare('SELECT count(*) AS total FROM global_settings').get().total, 10)
      assert.equal(connection.prepare('SELECT count(*) AS total FROM media_assets').get().total, 20)
    }
    finally {
      connection.close()
    }
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})
