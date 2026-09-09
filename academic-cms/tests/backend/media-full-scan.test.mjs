import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { LocalMediaStore } from '../../server/media/local-store.ts'
import { MediaService } from '../../server/services/media/media-service.ts'
import { createHash } from 'node:crypto'
import { mediaScanStatus, startMediaFullScan } from '../../server/services/complete-admin/media-full-scan.ts'

async function setup() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  const migrations = resolve(import.meta.dirname, '../../migrations')
  for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) sqlite.exec(await readFile(resolve(migrations, name), 'utf8'))
  const db = {
    kind: 'sqlite',
    async first(sql, params = []) { return sqlite.prepare(sql).get(...params) ?? null },
    async all(sql, params = []) { return sqlite.prepare(sql).all(...params) },
    async run(sql, params = []) { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes) } },
    async batch(operations) {
      sqlite.exec('BEGIN')
      try { const result = []; for (const op of operations) result.push(await db.run(op.sql, op.params)); sqlite.exec('COMMIT'); return result }
      catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
  }
  const directory = await mkdtemp(resolve(tmpdir(), 'media-scan-'))
  const store = new LocalMediaStore(directory)
  const old = new Date(Date.now() - 60_000)
  const file = async (key, content = '%PDF-1.7\nfixture\n%%EOF') => {
    const path = resolve(directory, key)
    await mkdir(resolve(path, '..'), { recursive: true })
    await writeFile(path, content); await utimes(path, old, old)
  }
  const add = (uid, key, status = 'active') => sqlite.prepare(`INSERT INTO media_assets(uid,object_key,title,size,status) VALUES (?,?,?,1,?)`).run(uid, key, uid, status)
  return { sqlite, db, store, directory, file, add, close: async () => { sqlite.close(); await rm(directory, { recursive: true, force: true }) } }
}

test('one job checks more than 100 records, imports nested orphans, retains trash and missing, and is idempotent', async () => {
  const h = await setup()
  try {
    for (let i = 0; i < 235; i++) h.add(`media:${i}`, `existing/${i}.pdf`)
    h.add('media:trash', 'trash.pdf', 'trash')
    await h.file('trash.pdf')
    await h.file('nested/新增.pdf')
    await h.file('fake.pdf', '<script>bad</script>')
    await h.file('purge-quarantine/old.pdf')
    await h.file('ignored.pdf.upload')
    await h.file('.private/hidden.pdf')
    await symlink(resolve(h.directory, 'nested'), resolve(h.directory, 'linked'))
    const seen = []
    const deps = {
      db: h.db, local: h.store, maxObjectBytes: 20 * 1024 * 1024, actor: { userUid: 'user:scan', name: 'Scan test' },
      inspect: async asset => {
        seen.push(asset.uid)
        if (asset.uid === 'media:100') throw new Error('simulated EACCES')
        return { exists: asset.uid !== 'media:0', consistent: asset.uid !== 'media:0', checkedAt: new Date().toISOString() }
      },
    }
    const first = await startMediaFullScan(deps)
    const duplicate = await startMediaFullScan(deps)
    assert.equal(duplicate.work, undefined)
    await first.work
    const state = await mediaScanStatus(h.db)
    assert.equal(state.status, 'completed', JSON.stringify(state))
    assert.equal(state.checked, 236)
    assert.equal(new Set(seen).size, 236)
    assert.equal(state.missing, 1)
    assert.equal(state.abnormal, 1)
    assert.equal(state.added, 1)
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM media_assets').get().n, 237)
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM media_inspections').get().n, 237)
    assert.equal(h.sqlite.prepare("SELECT status FROM media_assets WHERE uid='media:trash'").get().status, 'trash')
    const orphan = h.sqlite.prepare("SELECT * FROM media_assets WHERE object_key='nested/新增.pdf'").get()
    assert.equal(orphan.mime_type, 'application/pdf')
    assert.match(orphan.checksum, /^[a-f0-9]{64}$/)
    const repeat = await startMediaFullScan(deps); await repeat.work
    assert.equal((await mediaScanStatus(h.db)).added, 0)
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM media_assets').get().n, 237)
  } finally { await h.close() }
})

test('empty catalog still scans disk; invalid, oversized and recent files stay unregistered; stale job can restart', async () => {
  const h = await setup()
  try {
    await h.file('good.pdf')
    await h.file('large.pdf', '%PDF-1.7\n' + 'x'.repeat(300))
    await h.file('wrong.png')
    await h.file('fresh.pdf')
    await utimes(resolve(h.directory, 'fresh.pdf'), new Date(), new Date())
    const deps = { db: h.db, local: h.store, maxObjectBytes: 100, actor: { userUid: 'user:scan', name: 'Scan test' }, inspect: async () => ({ exists: true, consistent: true }) }
    const job = await startMediaFullScan(deps); await job.work
    assert.equal((await mediaScanStatus(h.db)).added, 1)
    const state = { ...await mediaScanStatus(h.db), status: 'running' }
    await h.db.run('UPDATE media_scan_jobs SET state_json = ?, lease_until = 1', [JSON.stringify(state)])
    assert.equal((await mediaScanStatus(h.db)).status, 'interrupted')
    const next = await startMediaFullScan(deps); assert.ok(next.work); await next.work
    assert.equal((await mediaScanStatus(h.db)).status, 'completed')
    assert.equal((await mediaScanStatus(h.db)).added, 0)
  } finally { await h.close() }
})

test('real storage inspection persists missing and same-size checksum corruption without changing catalog metadata', async () => {
  const h = await setup()
  try {
    const content = '%PDF-1.7\noriginal'
    await h.file('changed.pdf', content.replace('original', 'modified'))
    h.add('media:changed', 'changed.pdf')
    h.add('media:missing', 'missing.pdf')
    const checksum = createHash('sha256').update(content).digest('hex')
    await h.db.run("UPDATE media_assets SET size = ?, checksum = ? WHERE uid = 'media:changed'", [Buffer.byteLength(content), checksum])
    const media = new MediaService({}, { local: h.store }, {})
    const job = await startMediaFullScan({ db: h.db, local: h.store, maxObjectBytes: 1000, actor: { userUid: 'user:scan', name: 'Scan test' }, inspect: asset => media.inspectStorage(asset, { deepChecksum: true }) })
    await job.work
    const state = await mediaScanStatus(h.db)
    assert.equal(state.status, 'completed')
    assert.equal(state.abnormal, 1)
    assert.equal(state.missing, 1)
    const result = JSON.parse((await h.db.first("SELECT result_json FROM media_inspections WHERE media_uid = 'media:changed'")).result_json)
    assert.equal(result.checksumMatches, false)
    assert.equal((await h.db.first("SELECT checksum FROM media_assets WHERE uid = 'media:changed'")).checksum, checksum)
  } finally { await h.close() }
})
