import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMigrations } from './migrations.mjs'
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const args = process.argv.slice(2)
const remote = args.includes('--remote'), list = args.includes('--list')
let confirmedName
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--confirm-database' && args[i + 1]) { confirmedName = args[++i]; continue }
  if (['--remote', '--local', '--list'].includes(args[i])) continue
  throw new Error('Usage: d1.mjs [--local|--remote --confirm-database NAME] [--list]')
}
if (args.includes('--local') && remote) throw new Error('Select exactly one target')
await loadMigrations(resolve(root, 'migrations'))
const config = JSON.parse(await readFile(resolve(root, 'wrangler.jsonc'), 'utf8'))
const db = config.d1_databases?.find(item => item.binding === 'DB')
if (!db) throw new Error('Missing DB binding')
if (remote && (confirmedName !== db.database_name || !/^[a-f0-9-]{36}$/i.test(db.database_id) || /^0{8}-/.test(db.database_id))) throw new Error('Remote migration requires the exact database name and a configured non-placeholder database ID')
const child = spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec', 'wrangler', 'd1', 'migrations', list ? 'list' : 'apply', db.database_name, remote ? '--remote' : '--local', '--config', 'wrangler.jsonc'], { cwd: root, stdio: 'inherit', shell: false })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : code ?? 1 })
