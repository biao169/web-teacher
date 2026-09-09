import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const CLOUDFLARE_STATIC_HEADERS = `/_nuxt/*
  Cache-Control: public, max-age=31536000, immutable
`

export async function writeCloudflareStaticHeaders(publicDir) {
  await writeFile(
    resolve(publicDir, '_headers'),
    CLOUDFLARE_STATIC_HEADERS,
    'utf8',
  )
}
