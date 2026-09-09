import { test, expect, type Page, type Response as BrowserResponse, type TestInfo } from '@playwright/test'
import Database from 'better-sqlite3'
import { randomBytes } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { lstatSync, realpathSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const databasePath = process.env.CMS_E2E_DATABASE
const password = process.env.CMS_E2E_PASSWORD
const baseURL = process.env.CMS_E2E_BASE_URL
const root = resolve(import.meta.dirname, '../..')
if (!databasePath || !password || !baseURL) throw new Error('Use the isolated production browser runner')
const rel = relative(resolve(root, '.tmp'), databasePath)
if (!/^production-e2e-[^/\\]+[/\\]demo\.sqlite3$/u.test(rel) || realpathSync(databasePath) !== databasePath || lstatSync(databasePath).isSymbolicLink()) throw new Error('Never test against a real database')

function one(sql: string, parameters: string[] = []): Record<string, unknown> {
  const db = new Database(databasePath!, { readonly: true, fileMustExist: true })
  try { return (db.prepare(sql).get(...parameters) as Record<string, unknown> | undefined) ?? {} }
  finally { db.close() }
}
const unique = () => randomBytes(6).toString('hex')
const notices = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []
  notices.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (/hydration.*(?:mismatch|error)|(?:mismatch|error).*hydration/iu.test(message.text())) errors.push(message.text())
  })
})
test.afterEach(({ page }) => { expect(notices.get(page), 'No runtime exceptions or hydration mismatches').toEqual([]) })

async function signIn(page: Page, username = 'demo_admin', secret = password!): Promise<void> {
  await page.goto('/zh/login')
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.locator('input[autocomplete="current-password"]').fill(secret)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/zh\/account$/u)
  await expect(page.locator('.public-account-summary')).toContainText(username)
}

async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as Element & { __vue_app__?: unknown } | null)?.__vue_app__))
}

test('news rich-text step1: draft, edit handoff, save and reopen', async ({ page }, testInfo) => {
  await signIn(page)
  const slug = `step1-${unique()}`
  const title = `富文本验收 ${slug}`
  await page.goto('/admin/news?page=2&pageSize=20&q=step1&edit=new')
  const field = (name: string) => page.locator(`[data-complete-field="${name}"]`).locator('input,textarea').first()
  await field('title').fill(title)
  await field('slug').fill(slug)
  await field('content').fill('标题 <test>\n列表条目\n末尾文字')
  const creation = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/admin/complete/resource/news' && response.request().method() === 'POST')
  await page.getByRole('button', { name: '保存草稿并打开富文本', exact: true }).click()
  const created = await creation
  expect(created.status(), await created.text()).toBe(200)
  await expect(page).toHaveURL(/\/admin\/news\/editor\//u)
  const uid = decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1)!)
  const readRecord = async () => {
    const response = await page.request.get(`/api/v1/admin/complete/resource/news/${encodeURIComponent(uid)}`)
    expect(response.status()).toBe(200)
    return (await response.json() as { record: Record<string, unknown> }).record
  }
  const draft = await readRecord()
  expect(draft).toMatchObject({ visibility: 'hidden', content_format: 'plain', content: '标题 <test>\n列表条目\n末尾文字' })
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === '__Host-academic-cms-csrf')!.value
  const writeHeaders = { Origin: baseURL!, 'Sec-Fetch-Site': 'same-origin', 'x-csrf-token': csrf }
  const rawHtml = await page.request.patch(`/api/v1/admin/complete/resource/news/${encodeURIComponent(uid)}`, {
    headers: writeHeaders, data: { content_format: 'html', content: '<script>alert(1)</script>', expectedUpdatedAt: draft.updated_at },
  })
  expect(rawHtml.status()).toBe(422)
  const dangerousLink = await page.request.patch(`/api/v1/admin/complete/news/${encodeURIComponent(uid)}/rich-text`, {
    headers: writeHeaders, data: { expectedUpdatedAt: draft.updated_at, document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '链接', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] } },
  })
  expect(dangerousLink.status()).toBe(422)
  const document = page.locator('.rich-content .tiptap')
  await expect(document).toContainText('标题 <test>')
  await document.locator('p').first().click()
  await page.getByRole('button', { name: 'H2', exact: true }).click()
  await page.getByRole('button', { name: '中', exact: true }).click()
  await document.locator('p').first().click()
  await page.getByRole('button', { name: '有序列表', exact: true }).click()
  await expect(document.locator('ol')).toHaveCSS('list-style-type', 'decimal')
  await expect(document.locator('h2')).toHaveCSS('text-align', 'center')
  const footer = page.locator('.admin-editor-footer')
  await footer.getByRole('button', { name: '保存并返回', exact: true }).click()
  await expect(page).toHaveURL(url => url.pathname === '/admin/news')
  const returned = new URL(page.url())
  expect(returned.searchParams.get('edit')).toBe(uid)
  expect(returned.searchParams.get('page')).toBe('2')
  expect(returned.searchParams.get('q')).toBe('step1')
  expect(await readRecord()).toMatchObject({ content_format: 'html', content: expect.stringContaining('rich-align-center') })
  await expect(page.getByRole('button', { name: '打开富文本设计器', exact: true })).toBeVisible()
  // The existing record is saved before the handoff; its HTML stays on the specialist path.
  await field('title').fill(`${title} 已更新`)
  await page.getByRole('button', { name: '保存并打开富文本', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/news\/editor\//u)
  await expect(document.locator('h2')).toHaveCSS('text-align', 'center')
  await expect(document.locator('ol')).toHaveCSS('list-style-type', 'decimal')
  await expect(footer.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  expect((await readRecord()).title).toBe(`${title} 已更新`)
  await page.screenshot({ path: testInfo.outputPath('news-rich-text-reopened.png'), fullPage: true })
  await page.reload()
  await expect(document.locator('h2')).toHaveCSS('text-align', 'center')
  await expect(footer.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  await footer.getByRole('button', { name: '返回新闻信息', exact: true }).click()
  await expect(page).toHaveURL(url => url.pathname === '/admin/news')
})

test('media upload step3: crop handoff, immediate selection and library visibility', async ({ page }) => {
  await signIn(page)
  const suffix = unique()
  const title = `即时媒体 ${suffix}.png`
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

  await page.goto('/admin/profiles/new', { waitUntil: 'networkidle' })
  const field = page.locator('.admin-field-renderer__media').first()
  await field.getByRole('button', { name: '选择媒体', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '媒体选择器' })
  await expect(picker).toBeVisible()
  const uploadResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/admin/complete/media/upload' && response.request().method() === 'POST')
  await picker.locator('input[type="file"]').setInputFiles({ name: title, mimeType: 'image/png', buffer: png })
  const cropper = page.getByRole('dialog', { name: '裁剪与缩放图片' })
  await expect(cropper).toBeVisible()
  await cropper.getByRole('button', { name: '使用原图', exact: true }).click()
  const uploaded = await uploadResponse
  const payload = await uploaded.json() as { media: { uid: string; objectKey: string } }
  expect(uploaded.status(), JSON.stringify(payload)).toBe(200)

  await expect(picker.getByText('刚刚上传 · 已选中', { exact: true })).toBeVisible()
  await expect(picker.locator('.admin-media-card.is-just-uploaded img')).toBeVisible()
  await picker.getByRole('button', { name: '完成选择', exact: true }).click()
  await expect(field.locator('input')).toHaveValue(payload.media.objectKey)

  await page.goto('/admin/media', { waitUntil: 'networkidle' })
  const search = page.getByPlaceholder('搜索标题、Object key、分类或 MIME')
  await search.fill(title)
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  const row = page.locator('.el-table__row').filter({ hasText: title })
  await expect(row).toHaveCount(1)
  await expect(row.locator('.admin-media-preview img')).toBeVisible()
  expect(one('SELECT status FROM media_assets WHERE uid = ?', [payload.media.uid])).toMatchObject({ status: 'active' })
})

async function assertFormLabels(page: Page): Promise<void> {
  const issues = await page.locator('.admin-form-item').evaluateAll(items => items.flatMap(item => {
    const label = item.querySelector('.admin-field-label')
    const marker = item.querySelector('.admin-field-label__required')
    const text = item.querySelector('.admin-field-label__text')
    if (!label || !marker || !text || !label.getBoundingClientRect().height) return []
    const markerRect = marker.getBoundingClientRect()
    const textRect = text.getBoundingClientRect()
    const required = item.classList.contains('is-required')
    const nativeLabel = item.querySelector('.el-form-item__label')!
    const nativeStars = ['::before', '::after'].some(pseudo => getComputedStyle(nativeLabel, pseudo).content.includes('*'))
    const title = text.textContent ?? ''
    if (nativeStars) return [`${title}: duplicate native star`]
    if (!required) return markerRect.height ? [`${title}: optional field marked required`] : []
    if (!markerRect.height || Math.abs(markerRect.y - textRect.y) > 2 || markerRect.right > textRect.left + 1) return [`${title}: star and title not on the same line`]
    return []
  }))
  expect(issues, 'required markers share the title line without duplicates').toEqual([])
}

async function captureEditorContract(
  page: Page,
  testInfo: TestInfo,
  screenshotName: string,
  options: { readonly?: boolean } = {},
): Promise<void> {
  const shell = page.locator('.admin-unified-editor-shell')
  const nav = shell.locator('.admin-form-nav')
  const footer = shell.locator('.admin-editor-footer')
  await expect(shell, screenshotName).toBeVisible()
  await assertFormLabels(page)
  await expect(nav, `${screenshotName}: editor section navigation`).toBeVisible()
  await expect(nav.getByRole('button').first(), `${screenshotName}: at least one section`).toBeVisible()
  await expect(footer, `${screenshotName}: persistent editor actions`).toBeVisible()
  await expect(footer.getByRole('button', { name: '返回列表', exact: true })).toBeVisible()
  if (options.readonly) {
    await expect(footer.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
    await expect(footer.getByRole('button', { name: '保存并返回', exact: true })).toHaveCount(0)
  }
  else {
    await expect(footer.getByRole('button', { name: '保存', exact: true })).toBeVisible()
    await expect(footer.getByRole('button', { name: '保存并返回', exact: true })).toBeVisible()
  }
  const lastSection = nav.getByRole('button').last()
  await lastSection.click()
  await expect(lastSection, `${screenshotName}: section jump updates active state`).toHaveAttribute('aria-current', 'location')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${screenshotName}: no page-level horizontal overflow`).toBe(true)
  await footer.scrollIntoViewIfNeeded()
  const path = testInfo.outputPath(`${screenshotName}.png`)
  await page.screenshot({ path, animations: 'disabled' })
  await testInfo.attach(screenshotName, { path, contentType: 'image/png' })
}

test('homepage comes from real SSR data, reuses its payload, and displays real media', async ({ page, request }, testInfo) => {
  const raw = await request.get('/zh')
  expect(raw.status()).toBe(200)
  const html = await raw.text()
  expect(html).toContain('面向真实世界的智能与可信计算')
  expect(html).toContain('__NUXT_DATA__')
  expect(html).not.toContain('node_modules/better-sqlite3')
  const scriptResponses = new Map<string, BrowserResponse>()
  page.on('response', response => { if (response.ok() && response.request().resourceType() === 'script') scriptResponses.set(response.url(), response) })
  const fetches: string[] = []
  page.on('request', req => { if (new URL(req.url()).pathname === '/api/v1/public/home') fetches.push(req.url()) })
  await page.goto('/zh')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('面向真实世界的智能与可信计算')
  // Hydration completion is a state, not an arbitrary sleep or a disabled-JS test.
  await page.waitForFunction(() => (document.querySelector('#__nuxt') as Element & { __vue_app__?: unknown } | null)?.__vue_app__)
  expect(fetches, 'Initial hydration must not refetch the SSR home payload').toEqual([])
  const initialScripts = [...scriptResponses.values()]
  const scriptSizes = await Promise.all(initialScripts.map(async response => ({ path: new URL(response.url()).pathname, gzipBytes: gzipSync(await response.body()).byteLength })))
  const initialJsGzipBytes = scriptSizes.reduce((total, item) => total + item.gzipBytes, 0)
  await testInfo.attach('initial-js-budget', { body: JSON.stringify({ metric: 'gzip-equivalent of scripts observed through initial hydration; not Core Web Vitals', initialJsGzipBytes, budgetBytes: 180 * 1024, scripts: scriptSizes }, null, 2), contentType: 'application/json' })
  expect(initialScripts.length).toBeGreaterThan(0)
  expect(initialJsGzipBytes, 'Investigate initial JavaScript beyond the planned 180 KiB gzip budget').toBeLessThanOrEqual(180 * 1024)
  const image = page.locator('main img').first()
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate(node => { const image = node as HTMLImageElement; return image.complete && image.naturalWidth > 0 })).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await page.goto('/en')
  await expect(page.locator('body')).toContainText('Laboratory for Intelligent and Trustworthy Systems')
  expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`${baseURL}/en`)
})

test('real secure cookies survive SSR navigation and permit CSRF-protected logout', async ({ page, context }) => {
  await signIn(page)
  const cookies = await context.cookies()
  const session = cookies.find(cookie => cookie.name === '__Host-academic-cms-session')
  const csrf = cookies.find(cookie => cookie.name === '__Host-academic-cms-csrf')
  expect(session).toMatchObject({ httpOnly: true, secure: true, path: '/', sameSite: 'Lax' })
  expect(csrf).toMatchObject({ httpOnly: false, secure: true, path: '/', sameSite: 'Strict' })
  expect(session?.value).not.toBe(csrf?.value)
  // Force the server-side account request to reissue the CSRF cookie.
  await context.clearCookies({ name: '__Host-academic-cms-csrf' })
  const document = await page.goto('/zh/account')
  expect(document?.headers()['cache-control']).toContain('no-store')
  await expect(page.locator('.public-account-summary')).toContainText('demo_admin')
  expect((await context.cookies()).some(cookie => cookie.name === '__Host-academic-cms-csrf')).toBe(true)
  const request = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/auth/logout')
  await page.getByRole('button', { name: '退出当前设备', exact: true }).click()
  expect((await request).status()).toBe(200)
  await expect(page).toHaveURL(/\/zh\/login$/u)
  expect((await context.cookies()).some(cookie => cookie.name === '__Host-academic-cms-session')).toBe(false)
})

test('administration shell requires authentication and loads a permission-aware bounded dashboard', async ({ page, request }) => {
  const anonymousShell = await request.get('/admin')
  expect(anonymousShell.ok()).toBeTruthy()
  expect(anonymousShell.headers()['cache-control']).toContain('no-store')
  expect(anonymousShell.headers()['x-robots-tag']).toContain('noindex')

  await page.goto('/admin')
  await expect(page).toHaveURL(/\/zh\/login\?next=%2Fadmin/u)

  await signIn(page)
  const dashboardResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/admin/dashboard')
  await page.goto('/admin')
  const response = await dashboardResponse
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toContain('no-store')
  await expect(page.getByRole('heading', { name: '控制台', exact: true })).toBeVisible()
  await expect(page.locator('.admin-sidebar').getByRole('navigation', { name: '后台模块导航' })).toBeVisible()
  await expect(page.getByText('待处理留言', { exact: true })).toBeVisible()
  await expect(page.locator('.admin-module-card[href="/admin"]')).toHaveCount(0)
})

test('administration breadcrumbs link every ancestor and identify specialist child pages', async ({ page }) => {
  await signIn(page)
  const response = await page.goto('/admin/patents/metadata', { waitUntil: 'networkidle' })
  expect(response?.status()).toBe(200)

  const breadcrumbs = page.getByRole('navigation', { name: '面包屑' })
  await expect(breadcrumbs.getByRole('link', { name: '管理后台', exact: true })).toHaveAttribute('href', '/admin')
  await expect(breadcrumbs.getByRole('link', { name: '科研成果', exact: true })).toHaveAttribute('href', '/admin/publications')
  await expect(breadcrumbs.getByRole('link', { name: '专利与软件著作', exact: true })).toHaveAttribute('href', '/admin/patents')
  await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText('元数据工具')
  await expect(breadcrumbs.locator('[aria-current="page"]')).not.toHaveAttribute('href')

  await breadcrumbs.getByRole('link', { name: '专利与软件著作', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/patents$/u)
  await expect(page.getByRole('navigation', { name: '面包屑' }).locator('[aria-current="page"]')).toHaveText('专利与软件著作')
})

test('boolean quick fields use colored buttons while multi-value fields retain colored selects', async ({ page }) => {
  await signIn(page)
  await page.goto('/admin/profiles', { waitUntil: 'networkidle' })

  const toggle = page.getByRole('button', { name: /快速修改(?:启用|精选)：当前/u }).first()
  await expect(toggle).toBeVisible()
  const originalPressed = await toggle.getAttribute('aria-pressed')
  expect(['true', 'false']).toContain(originalPressed)
  const changed = page.waitForResponse(response => response.request().method() === 'PATCH' && /\/api\/v1\/admin\/content\/profiles\//u.test(new URL(response.url()).pathname))
  await toggle.click()
  expect((await changed).status()).toBe(200)
  await expect(toggle).toHaveAttribute('aria-pressed', originalPressed === 'true' ? 'false' : 'true')

  const restored = page.waitForResponse(response => response.request().method() === 'PATCH' && /\/api\/v1\/admin\/content\/profiles\//u.test(new URL(response.url()).pathname))
  await toggle.click()
  expect((await restored).status()).toBe(200)
  await expect(toggle).toHaveAttribute('aria-pressed', originalPressed!)

  await page.goto('/admin/auth', { waitUntil: 'networkidle' })
  const statusSelect = page.locator('.admin-quick-field.el-select').first()
  await expect(statusSelect).toBeVisible()
  await expect(statusSelect.locator('.admin-option-label__dot')).toBeVisible()
})

test('every administration overview renders and the unified list contract supports real filters and quick edits', async ({ page, context }) => {
  test.setTimeout(120_000)
  await signIn(page)

  const overviewPaths = [
    { path: '/admin/settings/site' }, { path: '/admin/settings/global' }, { path: '/admin/navigation' },
    { path: '/admin/profiles' }, { path: '/admin/research' }, { path: '/admin/students' }, { path: '/admin/student-categories' },
    { path: '/admin/publications' }, { path: '/admin/projects' }, { path: '/admin/patents' },
    { path: '/admin/news' }, { path: '/admin/courses' }, { path: '/admin/messages' },
    { path: '/admin/media' }, { path: '/admin/media/trash' }, { path: '/admin/translation', selector: '.translation-page' }, { path: '/admin/auth', selector: '.auth-page' }, { path: '/admin/logs' },
  ]
  for (const { path, selector = '.admin-unified-list-shell' } of overviewPaths) {
    const response = await page.goto(path, { waitUntil: 'networkidle' })
    expect(response?.status(), path).toBe(200)
    await expect(page.locator(selector), path).toBeVisible()
    await expect(page.getByRole('heading', { name: '页面暂时不可用' }), path).toHaveCount(0)
  }

  await page.goto('/admin/auth', { waitUntil: 'networkidle' })
  const userActionButtons = page.locator('.admin-actions-cell .admin-row-actions').first().getByRole('button')
  await expect(userActionButtons).toHaveCount(3)
  const userActionLines = await userActionButtons.evaluateAll(buttons => new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top))).size)
  expect(userActionLines).toBe(1)

  await page.goto('/admin/news', { waitUntil: 'networkidle' })
  const newsActionButtons = page.locator('.admin-actions-cell .admin-row-actions').first().getByRole('button')
  const newsActionLines = await newsActionButtons.evaluateAll(buttons => new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top))).size)
  expect(newsActionLines).toBeLessThanOrEqual(2)

  await page.goto('/admin/profiles', { waitUntil: 'networkidle' })
  const profileActions = page.locator('.admin-actions-cell .admin-row-actions').first()
  await expect(profileActions.getByRole('button', { name: '编辑', exact: true })).toBeVisible()
  await expect(profileActions.getByRole('button', { name: '删除', exact: true })).toBeVisible()

  await page.goto('/admin/media', { waitUntil: 'networkidle' })
  await expect(page.getByRole('button', { name: /^(?:移入回收站|已被引用（\d+）)$/u }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /回收站（\d+）/u })).toBeVisible()
  await page.goto('/admin/media/trash', { waitUntil: 'networkidle' })
  await expect(page.getByRole('button', { name: '返回媒体库', exact: true })).toBeVisible()

  const apiChecks = [
    '/api/v1/admin/content/publications?page=1&pageSize=10&sort=authors&direction=asc&f_authors=%E6%9E%97%E7%9F%A5%E8%BF%9C',
    '/api/v1/admin/complete/resource/site-settings?page=1&pageSize=10&sort=site_name&direction=asc&f_site_name=%E5%AE%9E%E9%AA%8C%E5%AE%A4',
    '/api/v1/admin/complete/media?page=1&pageSize=10&sort=mime_type&direction=asc&f_status=trash&f_mime_type=image%2F*',
    '/api/v1/admin/complete/media/trash?page=1&pageSize=10&f_status=active',
    '/api/v1/admin/complete/resource/translation?page=1&pageSize=10&sort=source_text&direction=asc&f_is_current=true',
    '/api/v1/admin/complete/logs?page=1&pageSize=10&sort=summary&direction=asc&f_summary=%E6%BC%94%E7%A4%BA',
    '/api/v1/admin/complete/auth/overview',
  ]
  for (const path of apiChecks) {
    const response = await page.request.get(path)
    expect(response.status(), path).toBe(200)
  }

  const listResponse = await page.request.get('/api/v1/admin/content/profiles?page=1&pageSize=10&sort=name&direction=asc')
  expect(listResponse.status()).toBe(200)
  const list = await listResponse.json() as { items: Array<{ uid: string; updatedAt: string; values: { is_featured?: boolean | number } }> }
  expect(list.items.length).toBeGreaterThan(0)
  const original = list.items[0]!
  const csrf = (await context.cookies()).find(cookie => cookie.name === '__Host-academic-cms-csrf')
  expect(csrf?.value).toBeTruthy()
  const updateUrl = `/api/v1/admin/content/profiles/${encodeURIComponent(original.uid)}`
  const changed = await page.request.patch(updateUrl, {
    headers: { Origin: baseURL!, 'Sec-Fetch-Site': 'same-origin', 'x-csrf-token': csrf!.value },
    data: { expectedUpdatedAt: original.updatedAt, values: { is_featured: !original.values.is_featured } },
  })
  expect(changed.status()).toBe(200)
  const changedRecord = (await changed.json() as { record: { updatedAt: string } }).record
  const restored = await page.request.patch(updateUrl, {
    headers: { Origin: baseURL!, 'Sec-Fetch-Site': 'same-origin', 'x-csrf-token': csrf!.value },
    data: { expectedUpdatedAt: changedRecord.updatedAt, values: { is_featured: Boolean(original.values.is_featured) } },
  })
  expect(restored.status()).toBe(200)
})

test('every administration editor contract opens against seeded production data', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await signIn(page)

  const contentCreatePaths = [
    { path: '/admin/profiles/new', screenshot: '04-profiles-new' },
    { path: '/admin/research/new', screenshot: '05-research-new' },
    { path: '/admin/publications/new', screenshot: '06-publications-new' },
    { path: '/admin/projects/new', screenshot: '07-projects-new' },
    { path: '/admin/patents/new', screenshot: '08-patents-new' },
    { path: '/admin/students/new', screenshot: '09-students-new' },
    { path: '/admin/student-categories/new', screenshot: '10-student-categories-new' },
    { path: '/admin/courses/new', screenshot: '13-courses-new' },
  ]
  for (const { path, screenshot } of contentCreatePaths) {
    const response = await page.goto(path, { waitUntil: 'networkidle' })
    expect(response?.status(), path).toBe(200)
    await waitForHydration(page)
    if (path === '/admin/profiles/new' || path === '/admin/patents/new' || path === '/admin/courses/new') {
      await expect(page.locator('.admin-field-renderer__media .admin-media-preview').first(), `${path}: adjacent media preview`).toBeVisible()
    }
    if (path === '/admin/publications/new') {
      await expect(page.getByRole('button', { name: '提取主页教师姓名', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '生成全部引用格式', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '解析引文', exact: true })).toBeVisible()
      await expect(page.getByRole('combobox', { name: '论文查新来源', exact: true })).toBeVisible()
      await expect(page.locator('[data-admin-field="corresponding_authors"] .admin-field-label__mark')).toHaveText('*')
      const keywords = page.locator('[data-admin-field="keywords"] textarea').first()
      await keywords.fill('机器学习；可信计算;Systems, Journal')
      await expect(keywords).toHaveValue('机器学习；可信计算;Systems, Journal')
      await keywords.fill('')
    }
    await captureEditorContract(page, testInfo, screenshot)
  }

  const seededEditors = [
    { path: '/admin/settings/site', button: '编辑', screenshot: '01-site-settings' },
    { path: '/admin/settings/global', button: '编辑', screenshot: '02-global-settings' },
    { path: '/admin/navigation', button: '编辑', screenshot: '03-navigation' },
    { path: '/admin/news', button: '编辑', screenshot: '11-news-edit' },
    { path: '/admin/messages', button: '处理', screenshot: '14-messages-handle' },
    { path: '/admin/media', button: '编辑信息', screenshot: '15-media-edit' },
    { path: '/admin/translation', button: '人工修订', screenshot: '16-translation-edit' },
    { path: '/admin/auth', button: '编辑', screenshot: '17-auth-user-edit' },
    { path: '/admin/logs', button: '查看', screenshot: '18-log-detail', readonly: true },
  ]
  for (const { path, button, screenshot, readonly } of seededEditors) {
    const response = await page.goto(path, { waitUntil: 'networkidle' })
    expect(response?.status(), path).toBe(200)
    await waitForHydration(page)
    const trigger = path === '/admin/media'
      ? page.locator('[data-media-edit-uid]').first()
      : page.getByRole('button', { name: button, exact: true }).first()
    await expect(trigger, `${path} must expose its object editor`).toBeVisible()
    pageErrors.length = 0
    if (path === '/admin/media') {
      const href = await trigger.getAttribute('href')
      expect(href, 'media edit control must expose a durable deep link').toMatch(/^\/admin\/media\?edit=/u)
      await page.goto(href!, { waitUntil: 'networkidle' })
      await waitForHydration(page)
      expect(page.url(), 'media edit button must persist the selected uid in the route').toContain('edit=')
      expect(pageErrors, `media editor client errors at ${page.url()}`).toEqual([])
      await expect(page.locator('.media-editor-layout .admin-media-preview'), 'media metadata editor preview').toBeVisible()
    }
    else await trigger.click()
    if (path === '/admin/translation') await expect(page.getByLabel('英文译文', { exact: true }), 'manual translation text').toBeVisible()
    await captureEditorContract(page, testInfo, screenshot, readonly ? { readonly: true } : {})
  }

  const news = one('SELECT uid FROM news ORDER BY updated_at DESC,id DESC LIMIT 1')
  const richTextPath = `/admin/news/editor/${encodeURIComponent(String(news.uid))}`
  const richTextResponse = await page.goto(richTextPath, { waitUntil: 'domcontentloaded' })
  expect(richTextResponse?.status(), richTextPath).toBe(200)
  await captureEditorContract(page, testInfo, '12-news-richtext')

  const transfer = await page.goto('/admin/import-export', { waitUntil: 'domcontentloaded' })
  expect(transfer?.status()).toBe(200)
  await expect(page.locator('.transfer-page')).toBeVisible()
  await expect(page.getByRole('tab', { name: '导出与加密备份' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '预检与恢复' })).toBeVisible()
})

test('translation scan posts with CSRF and manual revisions save through the canonical deep link', async ({ page }) => {
  await signIn(page)
  await page.goto('/admin/translation', { waitUntil: 'networkidle' })

  let releaseScan: (() => void) | undefined
  const scanGate = new Promise<void>(resolve => { releaseScan = resolve })
  await page.route('**/api/v1/admin/complete/translation/scan', async route => {
    await scanGate
    await route.continue()
  })
  const scanRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/v1/admin/complete/translation/scan')
  const scanResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/admin/complete/translation/scan')
  const scanButton = page.getByRole('button', { name: '扫描与校准', exact: true })
  await scanButton.click()
  const posted = await scanRequest
  expect(posted.method()).toBe('POST')
  expect(posted.headers()['x-csrf-token']).toBeTruthy()
  await expect(scanButton).toBeDisabled()
  await expect(page.getByRole('button', { name: '执行下一批', exact: true })).toBeDisabled()
  releaseScan?.()
  expect((await scanResponse).status()).toBe(200)
  await page.unroute('**/api/v1/admin/complete/translation/scan')
  await expect(page.getByRole('alert').filter({ hasText: /^扫描 \d+ 个字段/u })).toBeVisible()

  const editButton = page.locator('button:not([disabled])').filter({ hasText: /^人工修订$/u }).first()
  await expect(editButton).toBeVisible()
  await editButton.click()
  await expect(page).toHaveURL(/\/admin\/translation\?.*edit=/u)
  const editUrl = page.url()
  const textarea = page.getByLabel('英文译文', { exact: true })
  const original = await textarea.inputValue()
  const revised = `${original || 'Browser reviewed translation'} [${unique()}]`
  await textarea.fill(revised)
  const saveResponse = page.waitForResponse(response => response.request().method() === 'PATCH' && /\/api\/v1\/admin\/complete\/translation\//u.test(new URL(response.url()).pathname))
  await page.getByRole('button', { name: '保存', exact: true }).click()
  expect((await saveResponse).status()).toBe(200)
  await expect(page).toHaveURL(editUrl)
  await expect(textarea).toHaveValue(revised)

  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.locator('.admin-unified-editor-shell')).toBeVisible()
  await expect(page.getByLabel('英文译文', { exact: true })).toHaveValue(revised)
  await page.getByLabel('英文译文', { exact: true }).fill(original || 'Browser reviewed translation')
  const returnResponse = page.waitForResponse(response => response.request().method() === 'PATCH' && /\/api\/v1\/admin\/complete\/translation\//u.test(new URL(response.url()).pathname))
  await page.getByRole('button', { name: '保存并返回', exact: true }).click()
  expect((await returnResponse).status()).toBe(200)
  await expect(page).toHaveURL(url => url.pathname === '/admin/translation' && !url.searchParams.has('edit'))
  await expect(page.getByRole('heading', { name: '翻译缓存与任务', exact: true })).toBeVisible()
})

test('registration form persists a low-privilege account and the real login works', async ({ page }) => {
  const username = `reader_${unique()}`
  const secret = `Willow!${randomBytes(20).toString('hex')}!Creek`
  await page.goto('/zh/register')
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('显示名称', { exact: true }).fill('Browser Reader')
  await page.getByLabel('邮箱（可选）', { exact: true }).fill(`${username}@example.invalid`)
  await page.locator('input[autocomplete="new-password"]').fill(secret)
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  await expect(page.getByText('账号已创建，现在可以登录。', { exact: true })).toBeVisible()
  const row = one('SELECT role_uid,status,password_hash FROM auth_users WHERE username=?', [username])
  expect(row.role_uid).toBe('role:registered-user')
  expect(row.status).toBe('active')
  expect(String(row.password_hash).startsWith('pbkdf2-sha256$600000$')).toBe(true)
  expect(row.password_hash === secret).toBe(false)
  expect(one('SELECT count(*) n FROM auth_permissions WHERE role_uid=? AND can_edit=1', [String(row.role_uid)]).n).toBe(0)
  await signIn(page, username, secret)

  await page.goto('/admin/settings/site')
  const denied = page.getByRole('alertdialog', { name: '权限不足' })
  await expect(denied).toBeVisible()
  await expect(denied).toContainText('当前账号没有“网站设置”的访问权限。')
  await denied.getByRole('button', { name: '我知道了', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/forbidden\?module=site_settings&action=view$/u)
  await expect(page.getByText('没有访问权限', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '页面暂时不可用' })).toHaveCount(0)
})

test('contact form persists original text while the honeypot does not create a row', async ({ page, request }) => {
  const key = unique()
  const subject = `Production browser contact ${key}`
  const content = 'This original message checks actual form submission, persistence, and safe public output.'
  await page.goto('/zh/contact')
  await page.getByLabel('姓名', { exact: true }).fill('Browser Visitor')
  await page.getByLabel('邮箱', { exact: true }).fill(`contact_${key}@example.invalid`)
  await page.getByLabel('主题', { exact: true }).fill(subject)
  await page.getByLabel('留言内容', { exact: true }).fill(content)
  await page.getByRole('button', { name: '提交留言', exact: true }).click()
  await expect(page.getByText('留言已提交。请保存下面的查询编号。', { exact: true })).toBeVisible()
  expect(one('SELECT content,status,visibility FROM messages WHERE subject=?', [subject])).toEqual({ content, status: 'new', visibility: 'hidden' })
  const botSubject = `Honeypot ${key}`
  const bot = await request.post('/api/v1/public/contact', { headers: { Origin: baseURL!, 'Sec-Fetch-Site': 'same-origin' }, data: { name: 'Bot', email: `bot_${key}@example.invalid`, subject: botSubject, content, messageType: 'other', website: 'automated.example.invalid' } })
  expect(bot.ok()).toBe(true)
  expect(one('SELECT count(*) n FROM messages WHERE subject=?', [botSubject]).n).toBe(0)
})

test('API enforces CSRF after login and anonymous responses never contain a private identity', async ({ page, request }) => {
  await signIn(page)
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    return response.status
  })
  expect(result).toBe(403)
  const anonymous = await request.get('/zh/account')
  expect(anonymous.headers()['cache-control']).toContain('no-store')
  expect(await anonymous.text()).not.toContain('@demo_admin')
  const after = await page.request.get('/api/v1/auth/session')
  expect((await after.json()).authenticated).toBe(true)
})


test('password form updates the current account and revokes its other browser session', async ({ page, browser, request }) => {
  const username = `pass_${unique()}`
  const original = `Rowan!${randomBytes(20).toString('hex')}!Shore`
  const replacement = `Alder!${randomBytes(20).toString('hex')}!Trail`
  const registration = await request.post('/api/v1/auth/register', { headers: { Origin: baseURL!, 'Sec-Fetch-Site': 'same-origin' }, data: { username, password: original, displayName: 'Password Reader', email: `${username}@example.invalid` } })
  expect(registration.ok()).toBe(true)
  const other = await browser.newContext({ baseURL: baseURL!, ignoreHTTPSErrors: true })
  try {
    const second = await other.request.post('/api/v1/auth/login', { headers: { Origin: baseURL!, 'Sec-Fetch-Site': 'same-origin' }, data: { username, password: original } })
    expect(second.ok()).toBe(true)
    await signIn(page, username, original)
    await page.goto('/zh/account/password')
    await page.getByLabel('当前密码', { exact: true }).fill(original)
    await page.getByLabel('新密码', { exact: true }).fill(replacement)
    await page.getByLabel('确认新密码', { exact: true }).fill(replacement)
    await page.getByRole('button', { name: '修改密码', exact: true }).click()
    await expect(page.getByText('密码已修改，其他设备上的登录状态已撤销。', { exact: true })).toBeVisible()
    expect((await (await other.request.get('/api/v1/auth/session')).json()).authenticated).toBe(false)
    expect((await (await page.request.get('/api/v1/auth/session')).json()).authenticated).toBe(true)
    expect(one('SELECT count(*) n FROM auth_sessions s JOIN auth_users u ON u.uid=s.user_uid WHERE u.username=? AND s.revoked_at IS NULL', [username]).n).toBe(1)
  } finally { await other.close() }
})
