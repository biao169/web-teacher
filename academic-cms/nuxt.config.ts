import tailwindcss from '@tailwindcss/vite'
import ElementPlus from 'unplugin-element-plus/vite'
import { fileURLToPath } from 'node:url'
import { PUBLIC_LOCALE_DEFAULTS } from './shared/utils/public-locale'

type RuntimeKind = 'node' | 'cloudflare' | 'unknown'

const explicitPreset = process.env.NITRO_PRESET?.trim()

function runtimeKindForPreset(preset: string | undefined): RuntimeKind {
  if (preset === 'node-server') return 'node'
  if (preset === 'cloudflare_module') return 'cloudflare'
  return 'unknown'
}

const runtimeKind = (process.env.NUXT_RUNTIME_KIND?.trim() || runtimeKindForPreset(explicitPreset)) as RuntimeKind

const noIndexDocumentHeaders = { 'cache-control': 'private, no-store, max-age=0', vary: 'Cookie', 'x-robots-tag': 'noindex, nofollow' }
const privateDocumentHeaders = { 'cache-control': 'private, no-store, max-age=0', vary: 'Cookie' }
export default defineNuxtConfig({
  compatibilityDate: '2026-08-27',
  srcDir: 'app/',
  ssr: true,
  devtools: { enabled: process.env.NODE_ENV !== 'production' },

  modules: ['@nuxt/eslint', 'nuxt-security',
    // File transfer is optional; when disabled the sibling module is not imported.
    ...(process.env.FT_TEACHER_MODULE_ENABLED === 'true'
      ? [[new URL('../file-transfer/integration/teacher-site/module.mjs', import.meta.url).href, { enabled: true }] as [string, { enabled: boolean }]] : []),
  ],

  security: {
    rateLimiter: false,
    // One strict nonce-based policy applies to public and admin documents.
    // JSON APIs additionally receive a default-src 'none' policy in middleware.
    nonce: true,
    headers: {
      xFrameOptions: 'DENY',
      referrerPolicy: 'strict-origin-when-cross-origin',
      strictTransportSecurity: process.env.NODE_ENV === 'production'
        ? { maxAge: 63_072_000, includeSubdomains: true }
        : false,
    },
  },

  alias: {
    '#database-platform': fileURLToPath(new URL(runtimeKind === 'cloudflare'
      ? './server/adapters/database-cloudflare.ts'
      : './server/adapters/database-node.ts', import.meta.url)),
    '#media-platform': fileURLToPath(new URL(runtimeKind === 'cloudflare'
      ? './server/adapters/media-cloudflare.ts'
      : './server/adapters/media-node.ts', import.meta.url)),
    '#cache-platform': fileURLToPath(new URL(runtimeKind === 'cloudflare'
      ? './server/adapters/cache-cloudflare.ts'
      : './server/adapters/cache-node.ts', import.meta.url)),
  },

  app: {
    head: {
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      meta: [
        { name: 'color-scheme', content: 'light' },
        { name: 'format-detection', content: 'telephone=no' },
      ],
    },
  },

  routeRules: {
    '/api/**': { security: { rateLimiter: { tokensPerInterval: 240, interval: 60_000, headers: true } } },
    '/api/v1/public/**': { security: { rateLimiter: { tokensPerInterval: 480, interval: 60_000, headers: true } } },
    '/api/v1/public/contact': { security: { rateLimiter: { tokensPerInterval: 60, interval: 60_000, headers: true } } },
    '/api/v1/public/news/*/pdf': { security: { rateLimiter: { tokensPerInterval: 900, interval: 60_000, headers: true } } },
    // News accepts literal text and structured rich-text nodes. The generic
    // XSS filter rejects even text-node angle brackets before our handlers run.
    // These authenticated handlers enforce bounded JSON, news schema validation,
    // and the rich-text node/link/media allowlist; plain text is output as text.
    '/api/v1/admin/complete/resource/site-settings': { security: { xssValidator: false } },
    '/api/v1/admin/complete/resource/site-settings/**': { security: { xssValidator: false } },
    '/api/v1/admin/complete/resource/news': { security: { xssValidator: false } },
    '/api/v1/admin/complete/resource/news/**': { security: { xssValidator: false } },
    '/api/v1/admin/complete/news/**': { security: { xssValidator: false } },
    // These SSR payloads may contain per-user session state. Never share them.
    '/zh/account': { headers: noIndexDocumentHeaders },
    '/zh/account/**': { headers: noIndexDocumentHeaders },
    '/zh/login': { headers: noIndexDocumentHeaders },
    '/zh/register': { headers: noIndexDocumentHeaders },
    '/zh/setup': { headers: noIndexDocumentHeaders },
    '/zh/contact': { headers: privateDocumentHeaders },
    '/en/account': { headers: noIndexDocumentHeaders },
    '/en/account/**': { headers: noIndexDocumentHeaders },
    '/en/login': { headers: noIndexDocumentHeaders },
    '/en/register': { headers: noIndexDocumentHeaders },
    '/en/setup': { headers: noIndexDocumentHeaders },
    '/en/contact': { headers: privateDocumentHeaders },
    '/': {
      // The server route negotiates a locale; never share an IP/cookie-based redirect.
      headers: { 'cache-control': 'private, no-store, max-age=0', vary: 'Cookie, Accept-Language' },
    },
    '/_nuxt/**': {
      headers: {
        'cache-control': 'public, max-age=31536000, immutable',
      },
    },
    '/api/v1/auth/**': {
      security: { rateLimiter: { tokensPerInterval: 120, interval: 60_000, headers: true } },
      headers: {
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    },
    '/api/v1/admin/**': {
      security: { rateLimiter: { tokensPerInterval: 600, interval: 60_000, headers: true } },
      headers: {
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
        'x-robots-tag': 'noindex, nofollow',
      },
    },
    '/api/v1/admin/complete/media/upload': {
      security: {
    rateLimiter: false,
        // This route accepts a raw binary body. Text-oriented XSS parsing would
        // consume/corrupt PDFs and archives before the media signature checks.
        xssValidator: false,
        // The media service applies the authoritative runtime/settings limit.
        // Keep the outer middleware just above its hard 20 MiB ceiling.
        requestSizeLimiter: { maxRequestSizeInBytes: (20 * 1024 * 1024) + 1 },
      },
    },
    '/api/v1/admin/complete/import-export/**': {
      security: {
    rateLimiter: false,
        // A 32 MiB encrypted backup expands under base64; the service applies
        // the tighter decoded-size, row-count, table and field boundaries.
        requestSizeLimiter: { maxRequestSizeInBytes: 48 * 1024 * 1024 },
      },
    },
    '/health': {
      headers: {
        'x-robots-tag': 'noindex, nofollow',
        'cache-control': 'no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    },
    // SSR documents are deliberately not cached while CSP uses a per-response
    // nonce. A nonce-compatible public HTML cache is introduced with page data.
    '/admin': {
      ssr: false,
      headers: {
        'cache-control': 'private, no-store, max-age=0',
        'x-robots-tag': 'noindex, nofollow',
      },
    },
    '/admin/**': {
      ssr: false,
      headers: {
        'cache-control': 'private, no-store, max-age=0',
        'x-robots-tag': 'noindex, nofollow',
      },
    },
  },

  runtimeConfig: {
    appVersion: process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.1.0',
    runtimeKind,
    // Nuxt runtime overrides use NUXT_AUTH_* names. Defaults contain no
    // secrets, so a production build artifact is safe to promote between
    // environments without rebuilding credentials into the bundle.
    authSecret: '',
    authBootstrapToken: '',
    authTrustedOrigins: '',
    authSecureCookies: '',
    authSessionIdleSeconds: '',
    authSessionAbsoluteSeconds: '',
    authSessionTouchSeconds: '',
    authLoginWindowSeconds: '',
    authLoginBlockSeconds: '',
    authLoginAccountFailures: '',
    authLoginNetworkFailures: '',
    authTrustedProxyHops: '',
    localeChineseRegions: PUBLIC_LOCALE_DEFAULTS.chineseRegions,
    localeFallback: PUBLIC_LOCALE_DEFAULTS.fallback,
    localeGeoIpEnabled: 'true',
    localeGeoIpUrl: PUBLIC_LOCALE_DEFAULTS.geoIpUrl,
    localeGeoIpTimeoutMs: String(PUBLIC_LOCALE_DEFAULTS.geoIpTimeoutMs),
    mediaGrantSecret: '',
    mediaPublicGrantSeconds: '',
    mediaPrivateGrantSeconds: '',
    mediaRouteBase: '/media',
    mediaRoot: '',
    staticMediaRoot: '',
    mediaMaxObjectBytes: '',
    cacheMaxEntries: '',
    cacheMaxBytes: '',
    cacheMaxEntryBytes: '',
    cacheOrigin: '',
    public: {
      siteName: process.env.NUXT_PUBLIC_SITE_NAME ?? 'Academic CMS',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL ?? '',
    },
  },

  nitro: {
    publicAssets: ['cmaps', 'standard_fonts', 'wasm'].map(directory => ({
      dir: fileURLToPath(new URL(`./node_modules/pdfjs-dist/${directory}/`, import.meta.url)),
      baseURL: `/pdfjs/6.3.289/${directory}/`, maxAge: 31536000,
    })),
    ...(explicitPreset ? { preset: explicitPreset } : {}),
    // Shared application .mjs files must be bundled in development as well.
    // Otherwise Nitro can externalize the same file through an alias and a
    // relative import, leaving a path that Node resolves from .nuxt/dev.
    externals: {
      inline: [fileURLToPath(new URL('./shared/', import.meta.url))],
    },
    compressPublicAssets: true,
    minify: true,
    sourceMap: false,
  },

  experimental: {
    payloadExtraction: 'client',
  },

  typescript: {
    strict: true,
    typeCheck: false,
    // Offline declaration substitutes never participate in production checking.
    tsConfig: {
      compilerOptions: { noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true },
    },
  },

  vite: {
    plugins: [tailwindcss(), ElementPlus({ useSource: false })],
    build: {
      target: 'es2022',
      sourcemap: false,
      cssCodeSplit: true,
      reportCompressedSize: false,
    },
  },
})
