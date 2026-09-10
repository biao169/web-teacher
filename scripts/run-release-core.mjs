import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { projectRoot } from './lib/run-command.mjs'
import { findCompiler, commonJsResolution } from './lib/typescript-compiler.mjs'
const root = projectRoot
await mkdir(resolve(root, '.tmp'), { recursive: true })
const output = await mkdtemp(resolve(root, '.tmp/release-native-'))
try {
  const compiler = await findCompiler(root)
  console.log(`Compiler ${compiler.version}; source=${compiler.source}; database=node:sqlite; password=real-WebCrypto`)
  await writeFile(resolve(output, 'package.json'), '{"type":"commonjs"}\n')
  const compile = spawnSync(compiler.command, [...compiler.prefix, '-p', 'tsconfig.release-core.json', '--noEmit', 'false', '--module', 'commonjs', '--moduleResolution', commonJsResolution(compiler.version), '--outDir', output, '--rootDir', root], { cwd: root, stdio: 'inherit', timeout: 120000 })
  if (compile.status !== 0 || compile.error || compile.signal) throw new Error('Core compilation failed')
  const tests = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/release/native-services.spec.mjs'], { cwd: root, stdio: 'inherit', timeout: 120000, env: { ...process.env, CMS_RELEASE_CORE_OUTPUT: output } })
  process.exitCode = tests.status === 0 && !tests.error && !tests.signal ? 0 : 1
} finally { await rm(output, { recursive: true, force: true }) }
