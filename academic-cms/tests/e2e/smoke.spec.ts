import { expect, test } from '@playwright/test'

test('health endpoint is uncacheable and correlates request IDs', async ({ request }) => {
  const response = await request.get('/health', {
    headers: { 'x-request-id': 'test-request-0001' },
  })

  expect(response.ok()).toBeTruthy()
  expect(response.headers()['cache-control']).toContain('no-store')
  expect(response.headers()['x-content-type-options']).toBe('nosniff')

  const body = await response.json()
  expect(body).toMatchObject({ status: 'ok', service: 'academic-cms' })
  expect(['node', 'cloudflare', 'unknown']).toContain(body.runtime)
  expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(body.requestId).toBe(response.headers()['x-request-id'])
})

test('non-Cloudflare runtime does not trust a spoofed CF Ray header', async ({ request }) => {
  const response = await request.get('/health', {
    headers: {
      'cf-ray': 'spoofed-cloudflare-ray',
      'x-request-id': 'trusted-request-0002',
    },
  })

  const body = await response.json()
  expect(body.runtime).not.toBe('cloudflare')
  expect(body.requestId).toBe('trusted-request-0002')
})

test('root redirects temporarily without caching the language decision', async ({ request, page }) => {
  const response = await request.get('/', { maxRedirects: 0, headers: { cookie: 'academic-cms-locale=zh' } })
  expect(response.status()).toBe(302)
  expect(response.headers()['cache-control']).toContain('no-store')
  expect(response.headers().location).toMatch(/\/zh$/)

  await page.goto('/zh')
  await page.getByRole('link', { name: 'Switch to English', exact: true }).click()
  await expect(page).toHaveURL(/\/en$/)
  expect((await page.context().cookies()).find(cookie => cookie.name === 'academic-cms-locale')?.value).toBe('en')
  await page.goto('/')
  await expect(page).toHaveURL(/\/en$/)
  await page.getByRole('link', { name: '切换到中文', exact: true }).click()
  await page.goto('/')
  await expect(page).toHaveURL(/\/zh$/)
})

test('Chinese public route is rendered with the public layout', async ({ request, page }) => {
  const serverResponse = await request.get('/zh')
  expect(serverResponse.ok()).toBeTruthy()
  expect(await serverResponse.text()).toContain('学术内容，从稳定架构开始')

  await page.goto('/zh')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('学术内容')
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await expect(page.getByRole('link', { name: '返回网站首页' })).toBeVisible()
})

test('English public route exposes matching locale and labels', async ({ page }) => {
  await page.goto('/en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Academic content')
  await expect(page.getByRole('link', { name: 'Back to the website home page' })).toBeVisible()
})

test('admin route is private, client-rendered, and anonymous access enters the login flow', async ({ request, page }) => {
  const shellResponse = await request.get('/admin')
  expect(shellResponse.ok()).toBeTruthy()
  expect(shellResponse.headers()['cache-control']).toContain('no-store')
  expect(shellResponse.headers()['x-robots-tag']).toContain('noindex')
  expect(await shellResponse.text()).not.toContain('待处理留言')

  await page.goto('/admin')
  await expect(page).toHaveURL(/\/zh\/login\?next=%2Fadmin/u)
  await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})
