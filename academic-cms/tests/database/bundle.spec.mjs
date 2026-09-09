import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { assertWorkerDatabaseIsolation } from '../../scripts/lib/database-bundle.mjs'

async function fixture(run) {
  const dir = await mkdtemp(resolve(tmpdir(), 'cms-worker-bundle-'))
  try { await mkdir(resolve(dir, '.output/server/chunks'), { recursive: true }); await run(dir) }
  finally { await rm(dir, { recursive: true, force: true }) }
}
test('Worker database guard accepts a JS-only D1 output', () => fixture(async dir => {
  await writeFile(resolve(dir, '.output/server/index.mjs'), 'export default { fetch() { return new Response("ok") } }')
  await assert.doesNotReject(assertWorkerDatabaseIsolation(dir))
}))
test('Worker database guard rejects a transitive native SQLite import', () => fixture(async dir => {
  await writeFile(resolve(dir, '.output/server/chunks/database.mjs'), 'import Database from "better-sqlite3";')
  await assert.rejects(assertWorkerDatabaseIsolation(dir), /native SQLite/)
}))
test('Worker database guard rejects native addon files regardless of name', () => fixture(async dir => {
  await writeFile(resolve(dir, '.output/server/chunks/unexpected.node'), 'native-binary')
  await assert.rejects(assertWorkerDatabaseIsolation(dir), /native addon/)
}))
