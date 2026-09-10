import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applySampleSeed, SAMPLE_TABLE_COUNTS } from '../../db/seeds/sample-data'
import { openNodeDatabase } from '../../db/runtime/node'
import { PasswordService } from '../../server/security/password'
import { validateNewPassword } from '../../server/security/password-policy'
import { AUTH_MODULES, PERMISSION_ACTIONS, SYSTEM_ADMIN_ROLE_UID, systemAdministratorPermissions } from '../../shared/enums/auth'
import { applyMigrations, loadMigrations } from '../db/migrations.mjs'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const defaultDatabase = 'data/local-demo.sqlite3'
const defaultCredentials = 'data/local-demo-login.txt'
const localUrl = 'http://127.0.0.1:8005'

interface Options {
  database: string
  credentials: string
  updateEnv: boolean
}

function parseOptions(argv: readonly string[]): Options {
  const options: Options = { database: defaultDatabase, credentials: defaultCredentials, updateEnv: true }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--database' && argv[index + 1]) { options.database = argv[++index]!; continue }
    if (value === '--credentials' && argv[index + 1]) { options.credentials = argv[++index]!; continue }
    if (value === '--no-env-update') { options.updateEnv = false; continue }
    throw new Error('Usage: initialize-local-demo.ts [--database PATH] [--credentials PATH] [--no-env-update]')
  }
  return options
}

function projectPath(input: string, kind: 'database' | 'credentials'): { absolute: string; relative: string } {
  if (!input.trim()) throw new Error(`${kind} path is empty`)
  const absolute = resolve(root, input)
  const projectRelative = relative(root, absolute)
  if (!projectRelative || projectRelative.startsWith('..') || isAbsolute(projectRelative)) {
    throw new Error(`${kind} path must remain inside the project`)
  }
  const portable = projectRelative.replaceAll('\\', '/')
  if (kind === 'database' && (!/(^|[/_.-])(demo|sample|dev|test)([/_.-]|$)/iu.test(portable) || portable === 'data/site.sqlite3')) {
    throw new Error('The local demo database path must visibly contain demo, sample, dev, or test and cannot be data/site.sqlite3')
  }
  return { absolute, relative: portable }
}

function generatedSecret(): string {
  return randomBytes(48).toString('base64url')
}

function replaceEnvironmentValue(source: string, key: string, value: string, newline: string): string {
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  if (pattern.test(source)) return source.replace(pattern, line)
  return `${source}${source.endsWith('\n') || source.length === 0 ? '' : newline}${line}${newline}`
}

function ensureEnvironmentSecret(source: string, key: string, newline: string): string {
  const pattern = new RegExp(`^${key}=(.*)$`, 'm')
  const current = source.match(pattern)?.[1]?.trim()
  return current ? source : replaceEnvironmentValue(source, key, generatedSecret(), newline)
}

async function updateEnvironment(databasePath: string): Promise<void> {
  const environmentPath = resolve(root, '.env')
  const examplePath = resolve(root, '.env.example')
  let source = existsSync(environmentPath)
    ? await readFile(environmentPath, 'utf8')
    : existsSync(examplePath) ? await readFile(examplePath, 'utf8') : ''
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  for (const key of ['NUXT_AUTH_SECRET', 'NUXT_AUTH_BOOTSTRAP_TOKEN', 'NUXT_MEDIA_GRANT_SECRET']) {
    source = ensureEnvironmentSecret(source, key, newline)
  }
  source = replaceEnvironmentValue(source, 'CMS_DATABASE_PATH', databasePath, newline)
  source = replaceEnvironmentValue(source, 'NUXT_AUTH_TRUSTED_ORIGINS', localUrl, newline)
  source = replaceEnvironmentValue(source, 'NUXT_AUTH_SECURE_COOKIES', 'false', newline)
  source = replaceEnvironmentValue(source, 'NUXT_PUBLIC_SITE_URL', localUrl, newline)
  source = replaceEnvironmentValue(source, 'NUXT_CACHE_ORIGIN', localUrl, newline)
  await writeFile(environmentPath, source, { encoding: 'utf8', mode: 0o600 })
  await chmod(environmentPath, 0o600)
}

function backupStamp(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

async function backupAndRemoveDatabase(databasePath: string): Promise<string | null> {
  if (!existsSync(databasePath)) return null
  const backupDirectory = resolve(root, 'data/backups')
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 })
  const backupPath = resolve(backupDirectory, `local-demo-before-reinitialize-${backupStamp()}.sqlite3`)
  const connection = new Database(databasePath, { fileMustExist: true })
  try {
    connection.pragma('busy_timeout = 5000')
    connection.pragma('wal_checkpoint(TRUNCATE)')
    await connection.backup(backupPath)
  }
  finally {
    connection.close()
  }
  await chmod(backupPath, 0o600)
  await rm(databasePath)
  await rm(`${databasePath}-wal`, { force: true })
  await rm(`${databasePath}-shm`, { force: true })
  return relative(root, backupPath).replaceAll('\\', '/')
}

async function migrateDatabase(databasePath: string): Promise<readonly string[]> {
  await mkdir(resolve(databasePath, '..'), { recursive: true, mode: 0o700 })
  const migrations = await loadMigrations(resolve(root, 'migrations'))
  const connection = new Database(databasePath)
  try {
    connection.pragma('foreign_keys = ON')
    connection.pragma('journal_mode = WAL')
    connection.pragma('synchronous = FULL')
    connection.pragma('busy_timeout = 5000')
    const result = applyMigrations(connection, migrations)
    const integrity = connection.pragma('quick_check', { simple: true })
    if (integrity !== 'ok') throw new Error('SQLite integrity check failed after migration')
    return result.applied
  }
  finally {
    connection.close()
  }
}

async function seedDatabase(databasePath: string, password: string) {
  await validateNewPassword(password, { username: 'demo_admin', siteName: 'academic cms local demo' })
  const passwordHash = await new PasswordService().hash(password)
  const database = openNodeDatabase(databasePath)
  try {
    return await applySampleSeed(database.adapter, { passwordHash })
  }
  finally {
    database.close()
  }
}

function verifyDatabase(databasePath: string): Record<string, number> {
  const connection = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    if (connection.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('SQLite quick_check failed')
    if (connection.prepare('PRAGMA foreign_key_check').all().length !== 0) throw new Error('SQLite foreign_key_check failed')
    const counts: Record<string, number> = {}
    for (const table of Object.keys(SAMPLE_TABLE_COUNTS)) {
      const row = connection.prepare(`SELECT count(*) AS total FROM "${table}"`).get() as { total: number }
      if (!Number.isSafeInteger(row.total) || row.total < 1) throw new Error(`Sample table is empty: ${table}`)
      counts[table] = row.total
    }
    const administrator = connection.prepare(`SELECT u.status, r.uid AS role_uid, r.is_active AS role_active
      FROM auth_users u JOIN auth_roles r ON r.uid = u.role_uid WHERE u.username = ? COLLATE NOCASE`).get('demo_admin') as
      { status: string; role_uid: string; role_active: number } | undefined
    if (!administrator || administrator.status !== 'active' || administrator.role_uid !== SYSTEM_ADMIN_ROLE_UID || administrator.role_active !== 1) {
      throw new Error('The demo administrator is not active with the system administrator role')
    }
    const permissionRows = connection.prepare(`SELECT module, can_view, can_create, can_edit, can_delete, can_export
      FROM auth_permissions WHERE role_uid = ?`).all(SYSTEM_ADMIN_ROLE_UID) as Array<Record<string, string | number>>
    if (permissionRows.length !== AUTH_MODULES.length) throw new Error('The demo administrator does not have the complete module permission set')
    const expectedPermissions = systemAdministratorPermissions()
    for (const module of AUTH_MODULES) {
      const row = permissionRows.find(item => item.module === module)
      if (!row) throw new Error(`The demo administrator is missing permission module: ${module}`)
      for (const action of PERMISSION_ACTIONS) {
        if (Number(row[`can_${action}`]) !== (expectedPermissions[module][action] ? 1 : 0)) {
          throw new Error(`The demo administrator permission is incorrect: ${module}:${action}`)
        }
      }
    }
    const activeSite = connection.prepare('SELECT count(*) AS total FROM site_settings WHERE is_active = 1').get() as { total: number }
    if (activeSite.total !== 1) throw new Error('The demo database must contain exactly one active site setting')
    return counts
  }
  finally {
    connection.close()
  }
}

async function writeCredentials(path: string, database: string, password: string): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true, mode: 0o700 })
  const content = [
    'Academic CMS 本地演示登录信息',
    `URL=${localUrl}/zh/login`,
    'USERNAME=demo_admin',
    `PASSWORD=${password}`,
    `DATABASE=${database}`,
    `GENERATED_AT=${new Date().toISOString()}`,
    'WARNING=仅用于本机开发测试，禁止部署到公网或生产环境。',
    '',
  ].join('\r\n')
  await writeFile(path, content, { encoding: 'utf8', mode: 0o600 })
  await chmod(path, 0o600)
}

const options = parseOptions(process.argv.slice(2))
const database = projectPath(options.database, 'database')
const credentials = projectPath(options.credentials, 'credentials')
const password = process.env.CMS_DEMO_PASSWORD?.trim() || `LocalDemo-${randomBytes(12).toString('base64url')}-A9!`
process.umask(0o077)

const backup = await backupAndRemoveDatabase(database.absolute)
const migrations = await migrateDatabase(database.absolute)
const seed = await seedDatabase(database.absolute, password)
const counts = verifyDatabase(database.absolute)
await writeCredentials(credentials.absolute, database.relative, password)
if (options.updateEnv) await updateEnvironment(database.relative)

process.stdout.write(`${JSON.stringify({
  status: 'ready',
  database: database.relative,
  backup,
  migrations,
  dataset: seed.datasetVersion,
  seedDigest: seed.seedDigest,
  counts,
  login: { url: `${localUrl}/zh/login`, username: 'demo_admin', password, credentialsFile: credentials.relative },
  next: 'Run start_windows.bat and sign in with the credentials above.',
}, null, 2)}\n`)
