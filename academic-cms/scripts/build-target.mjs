import { rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { resolveBuildTarget, assertBuildArtifacts, writeBuildMetadata } from './lib/build-output.mjs'
import { assertWorkerDatabaseIsolation } from './lib/database-bundle.mjs'
import { writeCloudflareStaticHeaders } from './lib/cloudflare-assets.mjs'
import { projectRoot, assertLocalBinary } from './lib/run-command.mjs'
import { inspectEnvironment } from './release/environment.mjs'
import { sourceIdentity } from './release/inputs.mjs'
import { withBuildTransaction } from './release/build-transaction.mjs'
import { runProcess } from './release/process.mjs'

const target = resolveBuildTarget(process.argv[2])
// Resolve prerequisites before touching the previous working build.
const environment = await inspectEnvironment(projectRoot)
if (environment.blockers.length) {
  throw new Error(`Build prerequisites failed: ${environment.blockers.map(item => item.code).join(', ')}`)
}
const executable = await assertLocalBinary('nuxt')
const appVersion = process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.1.0'
const generatedRedirect = resolve(projectRoot, '.wrangler', 'deploy', 'config.json')
await withBuildTransaction(projectRoot, async () => {
  const before = await sourceIdentity(projectRoot)
  await rm(generatedRedirect, { force: true })
  const result = await runProcess(executable, ['build'], {
    cwd: projectRoot,
    inherit: true,
    env: {
      APP_VERSION: appVersion,
      NITRO_PRESET: target.nitroPreset,
      NUXT_RUNTIME_KIND: target.runtimeKind,
      NODE_ENV: 'production',
    },
  })
  if (!result.passed) throw new Error(`Nuxt build failed (${result.reason ?? result.signal ?? result.exitCode})`)
  const output = await assertBuildArtifacts(projectRoot)
  if (target.target === 'cloudflare') {
    await assertWorkerDatabaseIsolation(projectRoot)
    await writeCloudflareStaticHeaders(output.publicDir)
  }
  await rm(generatedRedirect, { force: true })
  const after = await sourceIdentity(projectRoot)
  if (before.digest !== after.digest) throw new Error('Source changed while building; output rejected')
  await writeBuildMetadata(target.target, { rootDir: projectRoot, appVersion })
  await writeFile(resolve(output.outputDir, 'source-proof.json'), JSON.stringify({
    schemaVersion: 1,
    sourceDigest: after.digest,
    sourceFiles: after.files,
    node: process.version,
    packageManager: environment.packageManager,
  }, null, 2) + '\n')
})
console.log(`Built ${target.target} with Nitro preset ${target.nitroPreset}.`)
