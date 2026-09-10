import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findCompiler, commonJsResolution } from './lib/typescript-compiler.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tempRoot = resolve(root, '.tmp')
await mkdir(tempRoot, { recursive: true })
const output = await mkdtemp(resolve(tempRoot, 'stage4-core-'))
const compiler = await findCompiler(root)
let exitCode = 1

try {
  await writeFile(resolve(output, 'package.json'), '{"type":"commonjs"}\n')
  const compile = spawnSync(compiler.command, [
    ...compiler.prefix, '-p', 'tsconfig.stage4.json', '--noEmit', 'false',
    '--module', 'commonjs', '--moduleResolution', commonJsResolution(compiler.version),
    '--outDir', output, '--rootDir', root,
  ], { cwd: root, stdio: 'inherit', timeout: 120_000, env: { ...process.env, NO_COLOR: '1' } })
  if (compile.error) throw compile.error
  if (compile.signal) throw new Error(`Stage-4 compilation terminated by ${compile.signal}`)
  if (compile.status !== 0) exitCode = compile.status ?? 1
  else {
    const files = (await readdir(resolve(root, 'tests/stage4'), { withFileTypes: true }))
      .filter(item => item.isFile() && item.name.endsWith('.spec.mjs'))
      .map(item => `tests/stage4/${item.name}`).sort()
    if (!files.length) throw new Error('No stage-4 tests found')
    const result = spawnSync(process.execPath, [
      '--experimental-sqlite', '--test', '--test-reporter=tap', ...files,
    ], {
      cwd: root,
      stdio: 'inherit',
      timeout: 120_000,
      env: { ...process.env, NO_COLOR: '1', STAGE4_CORE_OUTPUT: output },
    })
    if (result.error) throw result.error
    if (result.signal) throw new Error(`Stage-4 tests terminated by ${result.signal}`)
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
