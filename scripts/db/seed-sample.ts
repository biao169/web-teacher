import { lstat, realpath } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { openNodeDatabase } from '../../db/runtime/node'
import { applySampleSeed, SAMPLE_DATASET_VERSION } from '../../db/seeds/sample-data'
import { PasswordService } from '../../server/security/password'
import { validateNewPassword } from '../../server/security/password-policy'

const ACKNOWLEDGEMENT = 'I_UNDERSTAND_THIS_IS_DEMO_ONLY'
const root = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
let databaseArgument: string | null = null
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--database' && args[index + 1]) { databaseArgument = args[++index]!; continue }
  throw new Error('Usage: pnpm db:seed:sample --database data/demo.sqlite3')
}
if (!databaseArgument) throw new Error('An explicit --database path is required')
if (process.env.NODE_ENV === 'production') throw new Error('Sample data cannot be seeded with NODE_ENV=production')
if (process.env.CMS_DEMO_SEED_ACK !== ACKNOWLEDGEMENT) {
  throw new Error(`Set CMS_DEMO_SEED_ACK=${ACKNOWLEDGEMENT} to confirm this is a disposable demo database`)
}
const password = process.env.CMS_DEMO_PASSWORD
if (!password) throw new Error('CMS_DEMO_PASSWORD is required and is never stored by the seed runner')
await validateNewPassword(password, { username: 'demo_admin', siteName: 'academic cms demo' })

const databasePath = resolve(root, databaseArgument)
const relative = databasePath.startsWith(`${root}/`) ? databasePath.slice(root.length + 1) : null
if (!relative || !/(^|[/_.-])(demo|sample|dev|test)([/_.-]|$)/iu.test(relative) || databasePath === resolve(root, 'data/site.sqlite3')) {
  throw new Error('The sample database path must remain inside the project and visibly contain demo, sample, dev, or test')
}
const info = await lstat(databasePath)
if (!info.isFile() || info.isSymbolicLink()) throw new Error('The demo database must be an existing regular file, not a symlink')
const actualPath = await realpath(databasePath)
if (actualPath !== databasePath) throw new Error('The demo database path may not traverse symlinks')

const database = openNodeDatabase(databasePath)
try {
  const table = await database.adapter.execute({ sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'demo_seed_state'", params: [], mode: 'rows', write: false })
  if (table.rows.length !== 1) throw new Error('Run the CMS database migrations before seeding sample data')
  const passwordHash = await new PasswordService().hash(password)
  const result = await applySampleSeed(database.adapter, { passwordHash })
  console.log(JSON.stringify({
    status: 'seeded', dataset: SAMPLE_DATASET_VERSION, database: relative,
    demoLogin: { username: 'demo_admin', passwordSource: 'CMS_DEMO_PASSWORD' },
    counts: result.counts, seedDigest: result.seedDigest,
    warning: 'This database contains fictional records and known demo credentials. Never deploy it as production data.',
  }, null, 2))
}
finally { database.close() }
