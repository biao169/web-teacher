import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { root } from '../helpers/offline-stage4.mjs'

const read = path => readFile(join(root, path), 'utf8')

async function filesUnder(directory) {
  const output = []
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = join(current, entry.name)
      if (entry.isDirectory()) await walk(target)
      else if (entry.isFile()) output.push(relative(root, target))
    }
  }
  if ((await stat(join(root, directory))).isDirectory()) await walk(join(root, directory))
  return output.sort()
}

test('Tailwind v4 is namespaced, has no Preflight and is wired through Vite', async () => {
  const css = await read('app/assets/public/base.css')
  assert.match(css, /tailwindcss\/theme\.css[^;]+prefix\(pub\)/u)
  assert.match(css, /tailwindcss\/utilities\.css[^;]+prefix\(pub\)/u)
  assert.doesNotMatch(css, /preflight\.css/u)
  assert.match(css, /\.public-body/u)
  assert.match(css, /prefers-reduced-motion/u)
  assert.match(css, /forced-colors/u)
  const nuxt = await read('nuxt.config.ts')
  assert.match(nuxt, /from '@tailwindcss\/vite'/u)
  assert.match(nuxt, /tailwindcss\(\)/u)
  const pkg = JSON.parse(await read('package.json'))
  assert.equal(pkg.devDependencies.tailwindcss, '4.3.3')
  assert.equal(pkg.devDependencies['@tailwindcss/vite'], '4.3.3')
  assert.equal(pkg.dependencies['@lucide/vue'], '1.35.0')
})

test('public and admin UI source trees remain dependency-isolated', async () => {
  const publicFiles = await filesUnder('app/components/public')
  const adminFiles = await filesUnder('app/components/admin')
  for (const file of publicFiles) {
    const source = await read(file)
    assert.doesNotMatch(source, /components\/admin|assets\/admin|element-plus|tiptap|echarts|pdfjs/iu, file)
    assert.doesNotMatch(source, /v-html/u, file)
  }
  for (const file of adminFiles) {
    const source = await read(file)
    assert.doesNotMatch(source, /components\/public|assets\/public/u, file)
  }
  const publicLayout = await read('app/layouts/public.vue')
  const adminLayout = await read('app/layouts/admin.vue')
  assert.match(publicLayout, /assets\/public\/base\.css/u)
  assert.doesNotMatch(adminLayout, /assets\/public/u)
  assert.doesNotMatch(publicLayout, /assets\/admin/u)
})

test('SSR home data uses one stable useFetch key and no raw client fetch', async () => {
  const composable = await read('app/composables/usePublicHome.ts')
  assert.match(composable, /useFetch<PublicHomeViewModel>/u)
  assert.match(composable, /public-home:v1:/u)
  assert.match(composable, /server:\s*true/u)
  assert.match(composable, /dedupe:\s*'defer'/u)
  assert.doesNotMatch(composable, /\$fetch|useAsyncData/u)
  for (const page of ['app/pages/zh/index.vue', 'app/pages/en/index.vue']) {
    const source = await read(page)
    assert.match(source, /usePublicHome/u)
    assert.doesNotMatch(source, /\$fetch/u)
  }
  const layout = await read('app/layouts/public.vue')
  assert.match(layout, /usePublicLayoutModel/u)
  const layoutComposable = await read('app/composables/usePublicLayoutModel.ts')
  assert.match(layoutComposable, /public-shell:v1:/u)
  assert.doesNotMatch(layoutComposable, /homeInput|public-home:v1:/u)
})

test('SEO is derived from trusted configured origin with canonical and hreflang', async () => {
  const source = await read('app/composables/usePublicSeo.ts')
  assert.match(source, /siteUrl/u)
  const shared = await read('shared/utils/public-seo.ts')
  assert.match(source, /publicSeoLinks/u)
  assert.match(source, /useHead\(/u)
  assert.match(shared, /canonical/u)
  assert.match(shared, /hreflang/u)
  assert.match(source, /ogTitle/u)
  assert.match(source, /twitterCard/u)
  assert.doesNotMatch(source + shared, /getRequestURL|getHeaders|useRequestURL|x-forwarded-host/iu)
  const env = await read('.env.example')
  assert.match(env, /NUXT_PUBLIC_SITE_URL=/u)
})

test('public error page is independent of database, media and cached home data', async () => {
  const source = await read('app/error.vue')
  assert.doesNotMatch(source, /usePublicHome|database|repository|mediaService|publicRuntime|cache/iu)
  assert.match(source, /clearError/u)
})

test('public layout and components expose accessibility and resilient media affordances', async () => {
  const layout = await read('app/layouts/public.vue')
  const header = await read('app/components/public/SiteHeader.vue')
  const media = await read('app/components/public/MediaImage.vue')
  assert.match(layout, /skip-link/u)
  assert.match(layout, /id="main-content"/u)
  assert.match(header, /aria-expanded/u)
  assert.match(header, /aria-controls/u)
  assert.match(header, /Escape/u)
  assert.match(media, /:alt=/u)
  assert.match(media, /loading=/u)
  assert.match(media, /decoding="async"/u)
})

test('public API validates locale, emits cache metadata and supports ETag revalidation', async () => {
  const route = await read('server/routes/api/v1/public/home.get.ts')
  const boundary = await read('server/utils/public-http.ts')
  const parser = await read('server/services/public/public-query.ts')
  assert.match(route, /parsePublicLocaleQuery/u)
  assert.match(route, /handlePublicResult/u)
  assert.match(parser, /locale/u)
  assert.match(boundary, /If-None-Match|if-none-match/iu)
  assert.match(boundary, /304/u)
  assert.match(boundary, /x-cms-cache/u)
  assert.match(boundary, /max-age=0, must-revalidate/u)
  assert.match(boundary, /503/u)
})

test('the global error page is presentation-isolated from both public and admin layouts', async () => {
  const app = await read('app/app.vue')
  const error = await read('app/error.vue')
  assert.match(app, /NuxtLayout/u)
  assert.match(app, /NuxtPage/u)
  assert.doesNotMatch(error, /assets\/(?:public|admin)/u)
  assert.match(error, /<style scoped>/u)
})
