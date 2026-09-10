import { spawnSync } from 'node:child_process'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const reportDir = resolve(root, 'reports/stage4')
await mkdir(reportDir, { recursive: true })
const report = {
  stage: 4,
  scope: 'pinned production dependencies, native SQLite, workerd, Nuxt production build, lint/unit/browser and public performance release gates',
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  status: 'running',
  blockers: [],
  checks: [],
}

const exists = path => access(path).then(() => true, () => false)
const [major, minor] = process.versions.node.split('.').map(Number)
if (major !== 24 || minor < 19) report.blockers.push(`Requires Node >=24.19.0 <25; found ${process.version}`)
if (!await exists(resolve(root, 'pnpm-lock.yaml'))) report.blockers.push('Missing pnpm-lock.yaml; perform the first genuine pnpm install and commit the resulting lock')

for (const name of [
  'typescript', 'vitest', 'nuxt', 'vue', 'h3', 'zod', 'nuxt-security',
  'drizzle-orm', 'better-sqlite3', '@cloudflare/vitest-plugin',
  '@cloudflare/workers-types', 'tsx', 'wrangler',
  'tailwindcss', '@tailwindcss/vite', '@lucide/vue', '@playwright/test',
]) {
  if (!await exists(resolve(root, 'node_modules', name, 'package.json'))) report.blockers.push(`Missing pinned dependency: ${name}`)
}

const manager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const expectedPnpm = packageJson.packageManager.replace('pnpm@', '')
const version = spawnSync(manager, ['--version'], { cwd: root, encoding: 'utf8', timeout: 10_000 })
if (version.status !== 0 || version.stdout.trim() !== expectedPnpm) report.blockers.push(`Requires pnpm ${expectedPnpm}`)

if (report.blockers.length > 0) {
  report.status = 'blocked_prerequisites'
  process.exitCode = 2
}
else {
  for (const name of [
    'verify:stage4:offline',
    'typecheck:stage4',
    'typecheck:stage3',
    'typecheck:security',
    'typecheck:security:http',
    'typecheck:database',
    'test:database:native',
    'test:database:workerd',
    'typecheck',
    'lint',
    'test:unit',
    'build:ubuntu',
    'smoke:ubuntu',
    'build:cloudflare',
    'smoke:cloudflare',
    'test:e2e',
  ]) {
    const result = spawnSync(manager, ['run', name], {
      cwd: root,
      encoding: 'utf8',
      timeout: 600_000,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1' },
    })
    const logName = `release-${name.replaceAll(':', '-')}.log`
    await writeFile(resolve(reportDir, logName), `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}\n` : ''}`)
    const passed = result.status === 0 && !result.signal && !result.error
    report.checks.push({ name, status: passed ? 'passed' : 'failed', exitCode: result.status, signal: result.signal, log: logName })
    if (!passed) {
      report.status = 'failed'
      process.exitCode = 1
      break
    }
  }
  if (report.status === 'running') report.status = 'passed'
}

await writeFile(resolve(reportDir, 'release-validation.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
