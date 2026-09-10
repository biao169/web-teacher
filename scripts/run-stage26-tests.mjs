import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { commonJsResolution, findCompiler } from './lib/typescript-compiler.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tempRoot = resolve(root, '.tmp')
await mkdir(tempRoot, { recursive: true })
const output = await mkdtemp(resolve(tempRoot, 'stage26-core-'))
const compiler = await findCompiler(root)
let exitCode = 1
try {
  await writeFile(resolve(output, 'package.json'), '{"type":"commonjs"}\n')
  const compile = spawnSync(compiler.command, [
    ...compiler.prefix, '-p', 'tsconfig.stage26.json', '--noEmit', 'false', '--module', 'commonjs',
    '--moduleResolution', commonJsResolution(compiler.version), '--outDir', output, '--rootDir', root,
  ], { cwd: root, stdio: 'inherit', timeout: 120_000, env: { ...process.env, NO_COLOR: '1' } })
  if (compile.error) throw compile.error
  if (compile.signal) throw new Error(`Stage-26 compilation terminated by ${compile.signal}`)
  if (compile.status !== 0) exitCode = compile.status ?? 1
  else {
    const files = (await readdir(resolve(root, 'tests/stage26'), { withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.endsWith('.spec.mjs'))
      .map(entry => `tests/stage26/${entry.name}`).sort()
    if (files.length < 3) throw new Error('Stage-26 test suite is incomplete')
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
      cwd: root, stdio: 'inherit', timeout: 120_000,
      env: { ...process.env, NO_COLOR: '1', STAGE26_CORE_OUTPUT: output },
    })
    if (result.error) throw result.error
    if (result.signal) throw new Error(`Stage-26 tests terminated by ${result.signal}`)
    exitCode = result.status ?? 1
  }
}
catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  exitCode = 1
}
finally {
  await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
}
process.exitCode = exitCode
