import type { PublicCopyPayload } from '~~/shared/utils/public-copy'

/** Invoke during the click, before awaiting the fresh public data. */
export async function writePublicClipboard(source: PublicCopyPayload | Promise<PublicCopyPayload>, signal?: AbortSignal): Promise<'rich' | 'plain'> {
  const check = () => { if (signal?.aborted) throw new Error('aborted') }
  const payload = Promise.resolve(source).then(value => { check(); return value })
  // Browsers may reject write() without consuming either promised representation.
  void payload.catch(() => {})
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (clipboard?.write && typeof ClipboardItem !== 'undefined') {
    const plain = payload.then(value => { check(); return new Blob([value.text], { type: 'text/plain' }) })
    const html = payload.then(value => { check(); return new Blob([value.html], { type: 'text/html' }) })
    void plain.catch(() => {}); void html.catch(() => {})
    try {
      check()
      // Keep this call synchronous with the original user gesture (including Safari).
      await clipboard.write([new ClipboardItem({ 'text/html': html, 'text/plain': plain })])
      await payload; check()
      return 'rich'
    } catch { /* Retry plain text only after validating the complete payload below. */ }
  }
  const value = await payload
  check()
  if (!clipboard?.writeText) throw new Error('clipboard-unavailable')
  await clipboard.writeText(value.text)
  check()
  return 'plain'
}
