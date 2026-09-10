import { lstat, realpath } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'
import { openNodeDatabase } from '../../db/runtime/node'
import { applySampleSeed } from '../../db/seeds/sample-data'
import { PasswordService } from '../../server/security/password'

const root=resolve(import.meta.dirname,'../..')
const target=resolve(process.env.CMS_E2E_DATABASE ?? '')
const rel=relative(resolve(root,'.tmp'),target)
if(!rel.startsWith('production-e2e-') || rel.startsWith('..') || !rel.endsWith(`${sep}demo.sqlite3`))throw new Error('Fixture database must be an isolated production-e2e directory')
const info=await lstat(target)
if(!info.isFile() || info.isSymbolicLink() || await realpath(target)!==target)throw new Error('Fixture database must be a real file')
const password=process.env.CMS_E2E_PASSWORD
if(!password || password.length<32)throw new Error('Random test password is required')
const database=openNodeDatabase(target)
try {
  const result=await applySampleSeed(database.adapter,{passwordHash:await new PasswordService().hash(password)})
  console.log(JSON.stringify({status:'fixture_seeded',counts:result.counts}))
} finally { database.close() }
