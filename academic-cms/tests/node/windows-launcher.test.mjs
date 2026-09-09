import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const start = await readFile(new URL('../../start_windows.bat', import.meta.url), 'utf8')
const validate = await readFile(new URL('../../validate_backend_windows.bat', import.meta.url), 'utf8')
const initialize = await readFile(new URL('../../initialize_windows.bat', import.meta.url), 'utf8')
const initializer = await readFile(new URL('../../scripts/windows/initialize-local-demo.ts', import.meta.url), 'utf8')
const bootstrapForm = await readFile(new URL('../../app/components/auth/AdminBootstrapForm.vue', import.meta.url), 'utf8')

test('Windows launcher aligns with the Codex runtime and reports environment details', () => {
  assert.match(start, /set "PORT=8005"/u)
  assert.match(start, /set "MIN_NODE_VERSION=24\.19\.0"/u)
  assert.match(start, /set "MIN_PNPM_VERSION=11\.19\.0"/u)
  assert.match(start, /%USERPROFILE%\\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies/u)
  assert.match(start, /node\\bin\\node\.exe/u)
  assert.match(start, /bin\\fallback\\pnpm\.cmd/u)
  assert.match(start, /Environment detection result/u)
  assert.match(start, /Node exe:/u)
  assert.match(start, /pnpm exe:/u)
  assert.match(start, /D:\\Python\\Miniconda\\envs\\py312\\python\.exe/u)
  assert.match(start, /CMS_DATABASE_PATH=" ".env"/u)
  assert.match(start, /set "NODE_ENV=development"/u)
  assert.match(start, /\[MISSING\]/u)
  assert.match(start, /\[INCOMPATIBLE\]/u)
  assert.match(start, /\[READY\] Required tools are complete\. Nothing is missing\./u)
  assert.match(start, /call %PNPM_CMD% %PNPM_PREFIX% install --frozen-lockfile --ignore-scripts/u)
  assert.match(start, /exec nuxt prepare/u)
  assert.match(start, /require\('better-sqlite3'\)/u)
  assert.doesNotMatch(start, /24\.20|11\.24/u)
})

test('Windows validation script accepts the same minimum toolchain', () => {
  assert.match(validate, /v\[0\]===24&&v\[1\]>=19/u)
  assert.match(validate, /v\[0\]===11&&v\[1\]>=19/u)
  assert.match(validate, /D:\\Python\\Miniconda\\envs\\py312\\python\.exe/u)
  assert.match(validate, /call pnpm install --frozen-lockfile --ignore-scripts/u)
  assert.doesNotMatch(validate, /24\.20|11\.24/u)
})

test('one-click Windows initializer rebuilds a backed-up local demo and starts the selected database', () => {
  assert.match(initialize, /D:\\Python\\Miniconda\\envs\\py312\\python\.exe/u)
  assert.match(initialize, /data\\local-demo\.sqlite3/u)
  assert.match(initialize, /--import tsx scripts\\windows\\initialize-local-demo\.ts/u)
  assert.match(initialize, /call start_windows\.bat/u)
  assert.match(initializer, /backupAndRemoveDatabase/u)
  assert.match(initializer, /applyMigrations/u)
  assert.match(initializer, /applySampleSeed/u)
  assert.match(initializer, /verifyDatabase/u)
  assert.match(initializer, /local-demo-login\.txt/u)
})

test('browser bootstrap sends the one-time token only as Bearer authorization', () => {
  assert.match(bootstrapForm, /authorization:`Bearer \$\{form\.bootstrapToken\}`/u)
  assert.doesNotMatch(bootstrapForm, /body:\{bootstrapToken:/u)
})
