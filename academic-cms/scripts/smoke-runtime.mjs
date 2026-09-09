import { spawn } from 'node:child_process'
import { assertBuildTarget, outputPaths, resolveBuildTarget } from './lib/build-output.mjs'
import { assertLocalBinary, projectRoot } from './lib/run-command.mjs'

const target = resolveBuildTarget(process.argv[2])
await assertBuildTarget(target.target, projectRoot)

const host = '127.0.0.1'
const port = target.target === 'ubuntu' ? 4173 : 8787
const origin = `http://${host}:${port}`
const requestId = 'stage0-smoke-request'

const command = target.target === 'ubuntu'
  ? process.execPath
  : await assertLocalBinary('wrangler')
const args = target.target === 'ubuntu'
  ? [outputPaths(projectRoot).serverEntry]
  : ['dev', '--config', 'wrangler.jsonc', '--ip', host, '--port', String(port)]

const child = spawn(command, args, {
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    NITRO_HOST: host,
    NITRO_PORT: String(port),
  },
  stdio: ['ignore', 'inherit', 'inherit'],
  detached: process.platform !== 'win32',
  shell: process.platform === 'win32',
})

let smokeFinished = false
let childFailure
const childExited = new Promise(resolve => {
  child.once('error', (error) => {
    childFailure = error
    resolve()
  })
  child.once('exit', (code, signal) => {
    if (!smokeFinished) {
      const detail = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`
      childFailure = new Error(`Runtime exited before smoke completion with ${detail}`)
    }
    resolve()
  })
})

async function stopChild() {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      shell: true,
    })
    await new Promise(resolve => killer.once('exit', resolve))
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await Promise.race([
    childExited,
    new Promise(resolve => setTimeout(resolve, 3_000)),
  ])
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
    await Promise.race([
      childExited,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('Runtime did not exit after SIGKILL')),
        2_000,
      )),
    ])
  }
}

async function request(path, options = {}) {
  return fetch(`${origin}${path}`, {
    cache: 'no-store',
    redirect: options.redirect ?? 'follow',
    headers: options.headers,
    signal: AbortSignal.timeout(4_000),
  })
}

async function waitForHealth() {
  const deadline = Date.now() + 45_000
  let lastError
  while (Date.now() < deadline) {
    if (childFailure) throw childFailure
    try {
      const response = await request('/health', {
        headers: { 'x-request-id': requestId },
      })
      if (!response.ok) throw new Error(`Health returned HTTP ${response.status}`)
      const body = await response.json()
      const responseRequestId = response.headers.get('x-request-id')
      if (body.status !== 'ok' || body.service !== 'academic-cms') throw new Error('Unexpected health payload')
      if (body.runtime !== target.runtimeKind) throw new Error(`Expected runtime ${target.runtimeKind}, received ${body.runtime}`)
      if (!responseRequestId || body.requestId !== responseRequestId) throw new Error('Request ID mismatch')
      if (!response.headers.get('cache-control')?.includes('no-store')) throw new Error('Health response is cacheable')
      if (Number.isNaN(Date.parse(body.timestamp))) throw new Error('Health timestamp is invalid')
      return body
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }
  if (childFailure) throw childFailure
  throw new Error(`Timed out waiting for ${origin}/health`, { cause: lastError })
}

async function verifyRootRedirect() {
  const response = await request('/', { redirect: 'manual', headers: { cookie: 'academic-cms-locale=zh' } })
  if (response.status !== 302) throw new Error(`Expected root HTTP 302, received ${response.status}`)
  if (!response.headers.get('cache-control')?.includes('no-store')) throw new Error('Root redirect is cacheable')
  const location = response.headers.get('location')
  if (location !== '/zh' && location !== `${origin}/zh`) {
    throw new Error(`Expected root redirect to /zh, received ${location ?? 'no location'}`)
  }
}

async function verifyPublicSsr() {
  const dataResponse = await request('/api/v1/public/home?locale=zh')
  if (!dataResponse.ok) throw new Error(`Public home API returned HTTP ${dataResponse.status}`)
  const model = await dataResponse.json()
  const siteName = typeof model?.site?.name === 'string' ? model.site.name.trim() : ''
  const heroTitle = typeof model?.site?.heroTitle === 'string' ? model.site.heroTitle.trim() : ''
  if (model?.schemaVersion !== 1 || model?.locale !== 'zh' || !siteName || !heroTitle) {
    throw new Error('Public home API did not return a complete current view model')
  }
  const response = await request('/zh')
  if (!response.ok) throw new Error(`Public route returned HTTP ${response.status}`)
  const html = await response.text()
  if (!html.includes(siteName) || !html.includes(heroTitle)) throw new Error('Public route did not contain its current API-backed SSR content')
  if (html.includes('页面暂时不可用')) throw new Error('Public route rendered the fallback error page')
  if (html.includes('管理后台工程入口')) throw new Error('Public route leaked admin page content')
  return html
}

async function verifyImmutableNuxtAsset(html) {
  const match = html.match(/(?:src|href)=["']([^"']*\/_nuxt\/[^"']+)["']/)
  if (!match?.[1]) throw new Error('Public SSR did not reference a Nuxt build asset')

  const assetUrl = new URL(match[1], origin)
  const response = await fetch(assetUrl, {
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(4_000),
  })
  if (!response.ok) throw new Error(`Nuxt asset returned HTTP ${response.status}`)
  const cacheControl = response.headers.get('cache-control') ?? ''
  if (!cacheControl.includes('max-age=31536000') || !cacheControl.includes('immutable')) {
    throw new Error(`Nuxt asset cache policy is not immutable: ${cacheControl || 'missing'}`)
  }
}

async function verifyAdminShell() {
  const response = await request('/admin')
  if (!response.ok) throw new Error(`Admin route returned HTTP ${response.status}`)
  if (!response.headers.get('cache-control')?.includes('no-store')) throw new Error('Admin shell is publicly cacheable')
  if (!response.headers.get('x-robots-tag')?.includes('noindex')) throw new Error('Admin shell is indexable')
  const html = await response.text()
  if (html.includes('管理后台工程入口')) throw new Error('Admin route unexpectedly rendered private CSR content on the server')
}

try {
  const health = await waitForHealth()
  await verifyRootRedirect()
  const publicHtml = await verifyPublicSsr()
  await verifyImmutableNuxtAsset(publicHtml)
  await verifyAdminShell()
  smokeFinished = true
  console.log(`Smoke test passed: ${health.runtime} ${health.version} ${health.requestId}`)
} finally {
  smokeFinished = true
  await stopChild()
}
