import { outputPaths, assertBuildTarget } from './lib/build-output.mjs'
import { projectRoot, runCommand, runLocalBinary } from './lib/run-command.mjs'

import { assertCurrentBuildSource } from './release/assert-current-source.mjs'

const mode = process.argv[2]

if (mode === 'start-ubuntu') {
  await assertBuildTarget('ubuntu', projectRoot)
  await assertCurrentBuildSource(projectRoot)
  await runCommand(process.execPath, [outputPaths(projectRoot).serverEntry], {
    env: {
      NODE_ENV: 'production',
      NITRO_HOST: process.env.NITRO_HOST ?? '127.0.0.1',
      NITRO_PORT: process.env.NITRO_PORT ?? '3000',
    },
  })
} else if (mode === 'preview-cloudflare') {
  await assertBuildTarget('cloudflare', projectRoot)
  await assertCurrentBuildSource(projectRoot)
  await runLocalBinary('wrangler', ['dev', '--config', 'wrangler.jsonc', '--ip', '127.0.0.1', '--port', '8787'])
} else if (mode === 'deploy-cloudflare') {
  await assertBuildTarget('cloudflare', projectRoot)
  await assertCurrentBuildSource(projectRoot)
  await runLocalBinary('wrangler', ['deploy', '--config', 'wrangler.jsonc'])
} else {
  throw new TypeError('Expected mode: start-ubuntu, preview-cloudflare, or deploy-cloudflare')
}
