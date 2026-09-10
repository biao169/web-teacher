import { spawnSync } from 'node:child_process'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findCompiler, commonJsResolution } from './lib/typescript-compiler.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const output = resolve(root, '.tmp/security-core')
const compiler = await findCompiler(root)

await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
await mkdir(output, { recursive: true })
await writeFile(resolve(output, 'package.json'), '{"type":"commonjs"}\n')

const compile = spawnSync(compiler.command, [
  ...compiler.prefix,
  '-p', 'tsconfig.security.json',
  '--noEmit', 'false',
  '--module', 'commonjs',
  '--moduleResolution', commonJsResolution(compiler.version),
  '--outDir', output,
  '--rootDir', root,
], { cwd: root, stdio: 'inherit', timeout: 90_000 })

if (compile.error) throw compile.error
if (compile.status !== 0 || compile.signal) process.exit(compile.status ?? 1)

const testDirectory = resolve(root, 'tests/security')
const testFiles = (await readdir(testDirectory, { withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith('.spec.mjs'))
  .map(entry => `tests/security/${entry.name}`)
  .sort()

if (testFiles.length === 0) throw new Error('No security tests were discovered')

const tests = spawnSync(process.execPath, [
  '--experimental-sqlite',
  '--test',
  '--test-reporter=tap',
  ...testFiles,
], { cwd: root, stdio: 'inherit', timeout: 90_000 })

if (tests.error) throw tests.error
if (tests.signal) throw new Error(`Security test process terminated by ${tests.signal}`)
process.exit(tests.status ?? 1)
