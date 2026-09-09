import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadNuxtConfig } from 'nuxt/kit'

const root = fileURLToPath(new URL('../..', import.meta.url))
const requireNuxt = createRequire(import.meta.resolve('nuxt/package.json'))
const nitroPackageUrl = pathToFileURL(requireNuxt.resolve('nitropack/package.json'))
const nitroPackage = JSON.parse(await readFile(nitroPackageUrl, 'utf8'))
const requireNitro = createRequire(nitroPackageUrl)
const { createNitro } = await import(new URL(nitroPackage.exports['.'].import, nitroPackageUrl).href)
const { getRollupConfig } = await import(new URL(nitroPackage.exports['./rollup'].import, nitroPackageUrl).href)
const { rollup } = await import(pathToFileURL(requireNitro.resolve('rollup')).href)

test('development bundle embeds shared core and translation provider after relocation', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'cms-dev-shared-'))
  const config = await loadNuxtConfig({ cwd: root, overrides: { dev: true } })
  const output = join(temporary, '项目 with spaces', '.nuxt', 'dev', 'index.mjs')
  // Rollup virtual IDs use forward slashes, including on Windows.
  const entry = join(temporary, 'entry.mjs').replaceAll('\\', '/')
  const provider = resolve(root, 'server/services/complete-admin/translation-provider.ts').replaceAll('\\', '/')
  const nitro = await createNitro({
    rootDir: root,
    srcDir: resolve(root, 'server'),
    buildDir: join(temporary, '.nuxt'),
    dev: true,
    preset: 'nitro-dev',
    compatibilityDate: config.compatibilityDate,
    scanDirs: [],
    imports: false,
    externals: config.nitro.externals,
    alias: { '~~': root.replaceAll('\\', '/') },
    entry,
    virtual: {
      [entry]: [
        "export { RESOURCE_CATALOG, buildTranslationProviderRequest } from '~~/shared/complete-admin/core.mjs'",
        `export { createTranslationClient, parseProviderResponse } from ${JSON.stringify(provider)}`,
      ].join('\n'),
    },
  })
  let bundle
  try {
    const options = getRollupConfig(nitro)
    bundle = await rollup(options)
    await mkdir(resolve(output, '..'), { recursive: true })
    await bundle.write({ ...options.output, dir: undefined, file: output, format: 'esm', sourcemap: false })
    const code = await readFile(output, 'utf8')
    const externalCore = code.match(/(?:from\s*|import\s*\()\s*['"][^'"]*shared[\\/]complete-admin[\\/]core\.mjs/u)
    assert.equal(externalCore?.[0], undefined, 'shared application code must not remain an external runtime import')
    const loaded = await import(pathToFileURL(output).href)
    assert.ok(Object.keys(loaded.RESOURCE_CATALOG).length > 0)
    assert.deepEqual(loaded.parseProviderResponse('mymemory', { responseStatus: 200, responseData: { translatedText: 'Hello' } }, 1), ['Hello'])
    const request = loaded.buildTranslationProviderRequest('mymemory', {}, ['测试'])
    assert.equal(new URL(request.url).searchParams.get('q'), '测试')
    assert.equal(loaded.createTranslationClient({}).requestCount, 0)
  } finally {
    await bundle?.close()
    await nitro.close()
    await rm(temporary, { recursive: true, force: true })
  }
})
