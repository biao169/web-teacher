import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { core, createHarness, root, seedHarness } from '../helpers/offline-stage6.mjs'

for (const kind of ['sqlite', 'd1']) {
  test(`sample dataset populates every repeatable table and validates integrity on ${kind}`, async () => {
    const h = createHarness(kind)
    try {
      const { result } = await seedHarness(h)
      assert.deepEqual(result.counts, core.SAMPLE_TABLE_COUNTS)
      assert.deepEqual(h.db.prepare('PRAGMA foreign_key_check').all(), [])
      assert.equal(h.db.prepare('SELECT count(*) total FROM site_settings WHERE is_active=1').get().total, 1)
      assert.equal(h.db.prepare('SELECT allow_public_registration value FROM global_settings ORDER BY updated_at DESC,id DESC LIMIT 1').get().value, 1)
      assert.equal(h.db.prepare("SELECT count(*) total FROM auth_sessions WHERE revoked_at IS NULL").get().total, 0)
      assert.equal(h.db.prepare('SELECT dataset_version FROM demo_seed_state WHERE id=1').get().dataset_version, core.SAMPLE_DATASET_VERSION)
      const demoEmails = h.db.prepare(`SELECT email FROM auth_users WHERE email IS NOT NULL
        UNION ALL SELECT email FROM profiles WHERE email IS NOT NULL
        UNION ALL SELECT email FROM students WHERE email IS NOT NULL
        UNION ALL SELECT email FROM messages WHERE email IS NOT NULL
        UNION ALL SELECT notify_email AS email FROM global_settings WHERE notify_email IS NOT NULL`).all()
      assert.ok(demoEmails.length > 0)
      assert.ok(demoEmails.every(row => typeof row.email === 'string' && row.email.endsWith('@example.invalid')))
      const media = h.db.prepare("SELECT object_key,size,checksum FROM media_assets WHERE storage_kind='static' ORDER BY object_key").all()
      assert.equal(media.length, 20)
      for (const row of media) {
        const bytes = await readFile(resolve(root, 'public', row.object_key))
        assert.equal(bytes.byteLength, row.size)
        const digest = await crypto.subtle.digest('SHA-256', bytes)
        assert.equal(Buffer.from(digest).toString('hex'), row.checksum)
      }
    }
    finally { h.close() }
  })
}

test('sample dataset refuses a non-empty database and rolls back atomically', async () => {
  const h = createHarness('sqlite')
  try {
    h.db.prepare("INSERT INTO research_interests(uid,name,visibility) VALUES('real:row','Existing record','public')").run()
    await assert.rejects(() => seedHarness(h), /constraint|check|database/iu)
    assert.equal(h.db.prepare('SELECT count(*) total FROM research_interests').get().total, 1)
    assert.equal(h.db.prepare('SELECT count(*) total FROM media_assets').get().total, 0)
    assert.equal(h.db.prepare('SELECT count(*) total FROM demo_seed_state').get().total, 0)
  }
  finally { h.close() }
})

test('sample dataset cannot be applied twice', async () => {
  const h = createHarness('sqlite')
  try {
    await seedHarness(h)
    await assert.rejects(() => seedHarness(h), /unique|constraint|database/iu)
    assert.equal(h.db.prepare('SELECT count(*) total FROM profiles').get().total, 12)
  }
  finally { h.close() }
})


test('sample translations are current fingerprints of the referenced source fields', async () => {
  const h = createHarness('sqlite')
  try {
    await seedHarness(h)
    const translations = h.db.prepare('SELECT source_ref_key, source_text, source_hash FROM translation_cache ORDER BY uid').all()
    assert.equal(translations.length, 20)
    for (const translation of translations) {
      const reference = core.parseSourceRefKey(translation.source_ref_key)
      assert.match(reference.entity, /^(research_interests|news)$/u)
      assert.match(reference.field, /^(description|title)$/u)
      const source = h.db.prepare(`SELECT "${reference.field}" AS value FROM "${reference.entity}" WHERE uid = ?`).get(reference.uid)
      assert.ok(source, translation.source_ref_key)
      assert.equal(translation.source_text, source.value, translation.source_ref_key)
      assert.equal(translation.source_hash, await core.translationSourceHash(source.value), translation.source_ref_key)
    }
  }
  finally { h.close() }
})
