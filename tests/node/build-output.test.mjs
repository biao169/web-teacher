import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertBuildArtifacts,
  assertBuildTarget,
  normalizeAppVersion,
  readBuildMetadata,
  resolveBuildTarget,
  writeBuildMetadata,
} from '../../scripts/lib/build-output.mjs'
import {
  CLOUDFLARE_STATIC_HEADERS,
  writeCloudflareStaticHeaders,
} from '../../scripts/lib/cloudflare-assets.mjs'

const roots = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function createOutput() {
  const root = await mkdtemp(join(tmpdir(), 'academic-cms-stage0-'))
  roots.push(root)
  await mkdir(join(root, '.output/server'), { recursive: true })
  await mkdir(join(root, '.output/public'), { recursive: true })
  await writeFile(join(root, '.output/server/index.mjs'), 'export default {}\n')
  return root
}

describe('build target contract', () => {
  it('maps both supported targets to exact Nitro presets', () => {
    assert.deepEqual(resolveBuildTarget('ubuntu'), {
      target: 'ubuntu', nitroPreset: 'node-server', runtimeKind: 'node',
    })
    assert.deepEqual(resolveBuildTarget('cloudflare'), {
      target: 'cloudflare', nitroPreset: 'cloudflare_module', runtimeKind: 'cloudflare',
    })
    assert.throws(() => resolveBuildTarget('node'), /Unknown build target/)
  })

  it('normalizes safe versions and rejects ambiguous metadata versions', () => {
    assert.equal(normalizeAppVersion(' 1.2.3+abc '), '1.2.3+abc')
    assert.throws(() => normalizeAppVersion('version with spaces'), /safe version characters/)
    assert.throws(() => normalizeAppVersion('x'.repeat(65)), /safe version characters/)
  })

  it('writes, reads, and validates matching metadata', async () => {
    const root = await createOutput()
    await assertBuildArtifacts(root)
    await writeBuildMetadata('ubuntu', {
      rootDir: root,
      appVersion: '9.9.9',
      now: () => new Date('2026-08-29T00:00:00.000Z'),
    })
    const metadata = await assertBuildTarget('ubuntu', root)
    assert.equal(metadata.appVersion, '9.9.9')
    assert.equal(metadata.builtAt, '2026-08-29T00:00:00.000Z')
  })

  it('rejects output built for another target', async () => {
    const root = await createOutput()
    await writeBuildMetadata('cloudflare', { rootDir: root })
    await assert.rejects(() => assertBuildTarget('ubuntu', root), /Build target mismatch/)
  })

  it('rejects malformed metadata', async () => {
    const root = await createOutput()
    await writeFile(join(root, '.output/build-meta.json'), '{"target":"ubuntu"}\n')
    await assert.rejects(() => readBuildMetadata(root), /Malformed build metadata/)
  })

  it('rejects metadata whose preset conflicts with its target', async () => {
    const root = await createOutput()
    await writeFile(join(root, '.output/build-meta.json'), JSON.stringify({
      schemaVersion: 1,
      project: 'academic-cms',
      target: 'cloudflare',
      nitroPreset: 'node-server',
      runtimeKind: 'cloudflare',
      appVersion: '1.0.0',
      builtAt: '2026-08-29T00:00:00.000Z',
    }))
    await assert.rejects(() => readBuildMetadata(root), /Malformed build metadata/)
  })

  it('rejects invalid clocks before publishing metadata', async () => {
    const root = await createOutput()
    await assert.rejects(
      () => writeBuildMetadata('ubuntu', { rootDir: root, now: () => new Date('invalid') }),
      /valid Date/,
    )
  })
})

describe('Cloudflare static asset headers', () => {
  it('writes immutable caching only for fingerprinted Nuxt assets', async () => {
    const root = await createOutput()
    const publicDir = join(root, '.output/public')
    await writeCloudflareStaticHeaders(publicDir)
    assert.equal(await readFile(join(publicDir, '_headers'), 'utf8'), CLOUDFLARE_STATIC_HEADERS)
    assert.match(CLOUDFLARE_STATIC_HEADERS, /^\/_nuxt\/\*/)
    assert.match(CLOUDFLARE_STATIC_HEADERS, /max-age=31536000, immutable/)
  })
})
