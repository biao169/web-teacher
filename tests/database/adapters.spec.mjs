import test from 'node:test'
import assert from 'node:assert/strict'
import { createHarness, core, load } from '../helpers/offline-db.mjs'
const { DatabaseError } = load('db/errors.js')
const { decodeRow } = load('db/codec.js')

test('D1 rows-mode missing results is a protocol failure, not an empty table', async () => {
  const adapter = new core.D1Adapter({ prepare: () => ({ all: async () => ({ success: true }) }) })
  await assert.rejects(adapter.execute(core.read('SELECT 1')), error => error instanceof DatabaseError && error.code === 'DB_PROTOCOL')
})
test('D1 batch result cardinality is checked', async () => {
  const adapter = new core.D1Adapter({ prepare: () => ({}), batch: async () => [] })
  await assert.rejects(adapter.batch([core.read('SELECT 1')]), error => error.code === 'DB_PROTOCOL')
})
test('D1 failed result does not expose the underlying SQL error', async () => {
  const adapter = new core.D1Adapter({ prepare: () => ({ all: async () => ({ success: false, error: 'UNIQUE constraint failed secret@example.test' }) }) })
  await assert.rejects(adapter.execute(core.read('SELECT 1')), error => error.code === 'DB_UNIQUE' && !error.message.includes('secret'))
})
test('SQLite prepared statement cache is bounded and actually reused', async () => {
  const h = createHarness(); let prepares = 0
  try {
    const connection = { ...h.connection, prepare(sql) { prepares += 1; return h.db.prepare(sql) }, get inTransaction() { return h.db.isTransaction } }
    const adapter = new core.SqliteAdapter(connection, 2)
    await adapter.execute(core.read('SELECT ? AS x', [1])); await adapter.execute(core.read('SELECT ? AS x', [2]))
    assert.equal(prepares, 1)
    await adapter.execute(core.read('SELECT 2 AS x')); await adapter.execute(core.read('SELECT 3 AS x')); await adapter.execute(core.read('SELECT ? AS x', [3]))
    assert.equal(prepares, 4)
  }
  finally { h.close() }
})
test('nested SQLite batch does not commit a caller transaction', async () => {
  const h = createHarness()
  try {
    h.db.exec('BEGIN')
    await assert.rejects(h.adapter.batch([core.read('SELECT 1')]), error => error.code === 'DB_TRANSACTION')
    assert.equal(h.db.isTransaction, true); h.db.exec('ROLLBACK')
  }
  finally { h.close() }
})
test('row decoder fails closed on corrupted integer storage', async () => {
  const h = createHarness()
  try {
    const row = await new core.Repository(h.adapter).create('profiles', { name: 'valid' })
    const raw = h.db.prepare('SELECT * FROM profiles WHERE uid=?').get(row.uid)
    assert.throws(() => decodeRow('profiles', { ...raw, sort_order: 'invalid' }), error => error.code === 'DB_PROTOCOL')
  }
  finally { h.close() }
})
