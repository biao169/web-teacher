import { mkdtemp, rm, stat, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { expect, test } from 'vitest'
import { openNodeDatabase } from '../../db/runtime/node'
import { applyMigrations, loadMigrations } from '../../scripts/db/migrations.mjs'

test('production runtime refuses a missing database instead of creating it', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'cms-native-missing-'))
  try {
    const path = resolve(dir, 'site.sqlite3')
    expect(() => openNodeDatabase(path)).toThrow()
    expect(await access(path).then(() => true, () => false)).toBe(false)
    expect(() => openNodeDatabase(':memory:')).toThrow()
  }
  finally { await rm(dir, { recursive: true, force: true }) }
})

test('WAL, foreign keys, busy timeout and persistence are enabled on an existing database', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'cms-native-runtime-'))
  try {
    const path = resolve(dir, 'site.sqlite3'), initial = new Database(path)
    applyMigrations(initial, await loadMigrations(fileURLToPath(new URL('../../migrations', import.meta.url))))
    initial.close()
    const context = openNodeDatabase(path)
    try {
      await context.repository.create('profiles', { uid: 'persist', name: 'Preserved' })
      const value = async (sql: string) => (await context.adapter.execute({ sql, params: [], mode: 'rows', write: false })).rows[0]
      expect((await value('PRAGMA journal_mode'))?.journal_mode).toBe('wal')
      expect((await value('PRAGMA foreign_keys'))?.foreign_keys).toBe(1)
      expect((await value('PRAGMA synchronous'))?.synchronous).toBe(2)
      expect((await value('PRAGMA busy_timeout'))?.timeout).toBe(5000)
    }
    finally { context.close() }
    const reopened = openNodeDatabase(path)
    try { expect((await reopened.repository.findByUid('profiles', 'persist'))?.name).toBe('Preserved') }
    finally { reopened.close() }
    expect((await stat(path)).size).toBeGreaterThan(0)
  }
  finally { await rm(dir, { recursive: true, force: true }) }
})

test('production runtime rejects an existing legacy database without modifying its content', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'cms-native-legacy-'))
  try {
    const path = resolve(dir, 'legacy.sqlite3'), legacy = new Database(path)
    legacy.exec("CREATE TABLE important(value TEXT); INSERT INTO important VALUES('keep')")
    legacy.close()
    expect(() => openNodeDatabase(path)).toThrow(/not initialized/)
    const check = new Database(path, { readonly: true })
    try { expect(check.prepare('SELECT value FROM important').get()).toEqual({ value: 'keep' }) }
    finally { check.close() }
  }
  finally { await rm(dir, { recursive: true, force: true }) }
})
