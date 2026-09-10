import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const text = relative => readFile(resolve(root, relative), 'utf8')

async function walk(directory) {
  const base = resolve(root, directory)
  const output = []
  for (const entry of await readdir(base, { withFileTypes: true })) {
    const relative = join(directory, entry.name)
    if (entry.isDirectory()) output.push(...await walk(relative))
    else if (entry.isFile()) output.push(relative)
  }
  return output.sort()
}

test('stage A dependencies are pinned and configured without Nuxt-wide runtime modules', async () => {
  const pkg = JSON.parse(await text('package.json'))
  assert.equal(pkg.dependencies['element-plus'], '2.14.5')
  assert.equal(pkg.dependencies['@tanstack/vue-query'], '5.102.8')
  assert.equal(pkg.dependencies.pinia, '4.0.3')
  assert.equal(pkg.devDependencies['unplugin-element-plus'], '0.11.2')
  assert.equal(pkg.scripts['verify:stage26:offline'], 'node scripts/verify-stage26.mjs')
  const nuxt = await text('nuxt.config.ts')
  assert.match(nuxt, /ElementPlus\(\{ useSource: false \}\)/u)
  assert.doesNotMatch(nuxt, /@pinia\/nuxt|@element-plus\/nuxt|@tanstack\/vue-query-nuxt/u)
})

test('admin runtime is client-only, gated by an exact admin boundary and dynamically loads heavy state libraries', async () => {
  const plugin = await text('app/plugins/admin-runtime.client.ts')
  assert.match(plugin, /window\.location\.pathname === '\/admin' \|\| window\.location\.pathname\.startsWith\('\/admin\/'\)/u)
  assert.match(plugin, /import\('\.\.\/admin\/pinia'\)/u)
  assert.match(plugin, /import\('\.\.\/admin\/query-client'\)/u)
  assert.match(plugin, /vueApp\.use\(getAdminPinia\(\)\)/u)
  assert.match(plugin, /VueQueryPlugin/u)
  assert.match(plugin, /queryClient\.clear\(\)/u)
})

test('public routes and public UI do not statically import admin UI/state dependencies', async () => {
  const files = [
    ...(await walk('app/components/public')),
    ...(await walk('app/pages/zh')),
    ...(await walk('app/pages/en')),
    'app/layouts/public.vue',
  ].filter(file => /\.(?:ts|vue)$/u.test(file))
  for (const file of files) {
    const source = await text(file)
    assert.doesNotMatch(source, /from ['"](?:element-plus|@tanstack\/vue-query|pinia)['"]/u, file)
    assert.doesNotMatch(source, /~\/admin\//u, file)
  }
})

test('Element Plus styles are loaded on demand rather than duplicated by a full CSS bundle', async () => {
  const layout = await text('app/layouts/admin.vue')
  const nuxt = await text('nuxt.config.ts')
  assert.match(nuxt, /unplugin-element-plus\/vite/u)
  assert.doesNotMatch(layout, /element-plus\/dist\/index\.css/u)
})

test('admin middleware rejects anonymous, forced-password, unknown and forbidden routes before page data', async () => {
  const middleware = await text('app/middleware/admin-auth.global.ts')
  const authIndex = middleware.indexOf('await auth.load()')
  const moduleIndex = middleware.indexOf('adminModuleForPath(to.path)')
  assert.ok(authIndex >= 0 && moduleIndex > authIndex)
  assert.match(middleware, /AUTH|authenticated/u)
  assert.match(middleware, /mustChangePassword/u)
  assert.match(middleware, /\/admin\/not-found/u)
  assert.match(middleware, /\/admin\/forbidden/u)
  assert.match(middleware, /safeAdminReturnPath/u)
  assert.match(middleware, /external: true/u)
})

test('admin read and write handlers preserve different request-protection boundaries', async () => {
  const readHandler = await text('server/utils/admin-read-handler.ts')
  const writeHandler = await text('server/utils/admin-write-handler.ts')
  assert.match(readHandler, /requireEventPermission/u)
  assert.doesNotMatch(readHandler, /protectJsonWrite|readBoundedJsonBody/u)
  const protection = writeHandler.indexOf('await protectJsonWrite')
  const body = writeHandler.indexOf('await readBoundedJsonBody')
  const permission = writeHandler.indexOf('await requireEventPermission')
  assert.ok(protection >= 0 && body > protection && permission > body)
  assert.match(writeHandler, /maximumBytes/u)
})

test('dashboard route uses the read handler and a permission-aware bounded store', async () => {
  const route = await text('server/routes/api/v1/admin/dashboard.get.ts')
  const store = await text('server/services/admin/dashboard-store.ts')
  assert.match(route, /defineAdminReadHandler\(\{ module: 'dashboard', action: 'view' \}/u)
  assert.match(store, /hasPermission\(principal,'messages','view'\)/u)
  assert.match(store, /hasPermission\(principal,'operation_logs','view'\)/u)
  assert.match(store, /ADMIN_RECENT_OPERATION_LIMIT = 8/u)
  assert.match(store, /adapter\.batch\(commands\)/u)
  assert.doesNotMatch(store, /SELECT \*/u)
})

test('layout contains one scrolling workspace, responsive navigation and no full-page public dependencies', async () => {
  const layout = await text('app/layouts/admin.vue')
  assert.match(layout, /AdminSidebar/u)
  assert.match(layout, /ElDrawer/u)
  assert.match(layout, /AdminTopbar/u)
  assert.match(layout, /admin-skip-link/u)
  assert.match(layout, /id="admin-main"/u)
  assert.doesNotMatch(layout, /components\/public|assets\/public/u)
})

test('account actions preserve a safe current admin return path and use full-document transitions', async () => {
  const topbar = await text('app/components/admin/Topbar.vue')
  const login = await text('app/components/public/auth/LoginForm.vue')
  const password = await text('app/components/public/auth/PasswordChangeForm.vue')
  assert.match(topbar, /safeAdminReturnPath/u)
  assert.match(topbar, /route\.fullPath/u)
  assert.match(topbar, /window\.location\.assign|window\.location\.replace/u)
  assert.match(login, /window\.location\.replace\(target\)/u)
  assert.match(password, /window\.location\.replace\(target\)/u)
})

test('admin UI persistence handles unavailable localStorage and has one store source', async () => {
  const store = await text('app/stores/admin-ui.ts')
  assert.match(store, /try \{/u)
  assert.match(store, /window\.localStorage\.getItem/u)
  assert.match(store, /window\.localStorage\.setItem/u)
  const stores = await walk('app/stores')
  assert.deepEqual(stores.filter(file => /admin-ui.*\.ts$/iu.test(file)), ['app/stores/admin-ui.ts'])
})

test('special status pages and module placeholder exist without v-html', async () => {
  for (const page of ['app/pages/admin/forbidden.vue', 'app/pages/admin/not-found.vue', 'app/pages/admin/unavailable.vue', 'app/pages/admin/[...path].vue']) {
    const source = await text(page)
    assert.match(source, /layout: 'admin'/u, page)
    assert.doesNotMatch(source, /v-html/u, page)
  }
  for (const file of (await walk('app/components/admin')).filter(file => file.endsWith('.vue'))) {
    assert.doesNotMatch(await text(file), /v-html/u, file)
  }
})

test('migration adds the dashboard log index and manifest records it', async () => {
  const migration = await text('migrations/0006_admin_shell.sql')
  const manifest = JSON.parse(await text('migrations/manifest.json'))
  assert.match(migration, /idx_operation_logs_created_desc/u)
  assert.match(migration, /["']created_at["'] DESC, ["']id["'] DESC/u)
  const recorded = manifest.migrations?.find(item => item.name === '0006_admin_shell.sql')
  assert.equal(recorded?.name, '0006_admin_shell.sql')
  assert.match(recorded?.sha256 ?? '', /^[a-f0-9]{64}$/u)
})

test('public entry points force a fresh document when entering the admin runtime', async () => {
  const header = await text('app/components/public/SiteHeader.vue')
  const account = await text('app/components/public/auth/AccountPanel.vue')
  assert.match(header, /<a class="public-icon-link" href="\/admin">/u)
  assert.doesNotMatch(header, /<NuxtLink[^>]+to="\/admin"/u)
  assert.match(account, /<a[^>]+href="\/admin"/u)
})

test('admin UI preferences hydrate before the first client paint', async () => {
  const composable = await text('app/composables/useAdminUi.ts')
  assert.match(composable, /if \(import\.meta\.client\) store\.hydrate\(\)/u)
  assert.doesNotMatch(composable, /onMounted/u)
})

test('internal security protocol/configuration failures remain observable in server logs', async () => {
  const source = await text('server/utils/admin-http.ts')
  assert.match(source, /AUTH_PROTOCOL/u)
  assert.match(source, /AUTH_CONFIG/u)
  assert.match(source, /expected: false/u)
})

test('dashboard module cards omit the dashboard self-link', async () => {
  const page = await text('app/pages/admin/index.vue')
  assert.match(page, /item\.module !== 'dashboard'/u)
})

test('browser acceptance covers anonymous and authenticated administration shell flows', async () => {
  const smoke = await text('tests/e2e/smoke.spec.ts')
  const production = await text('tests/production/workflows.spec.ts')
  assert.match(smoke, /anonymous access enters the login flow/u)
  assert.match(smoke, /zh\\\/login\\\?next=%2Fadmin/u)
  assert.match(production, /permission-aware bounded dashboard/u)
  assert.match(production, /\/api\/v1\/admin\/dashboard/u)
  assert.match(production, /admin-module-card\[href="\/admin"\]/u)
})

test('release gate executes the isolated production browser workflow after the Ubuntu build', async () => {
  const release = await text('scripts/verify-stage26-release.mjs')
  const ubuntu = release.indexOf("'build:ubuntu'")
  const production = release.indexOf("'test:e2e:production'")
  const cloudflare = release.indexOf("'build:cloudflare'")
  assert.ok(ubuntu >= 0 && production > ubuntu && cloudflare > production)
})
