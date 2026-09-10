import { getResponseHeader, setHeader } from 'h3'

/** Reading preferences personalize SSR HTML; shared public JSON caches stay intact. */
export default defineEventHandler(event => {
  const path = event.path.split('?', 1)[0] ?? ''
  if (!/^\/(?:zh|en)(?:\/|$)/u.test(path)) return
  setHeader(event, 'cache-control', 'private, no-store, max-age=0')
  const vary = String(getResponseHeader(event, 'vary') ?? '').split(',').map(value => value.trim()).filter(Boolean)
  if (!vary.some(value => value.toLowerCase() === 'cookie')) vary.push('Cookie')
  setHeader(event, 'vary', vary.join(', '))
})
