const MAX_IF_NONE_MATCH_BYTES = 8_192
const encoder = new TextEncoder()

function opaqueTag(value: string): string | null {
  const selected = value.startsWith('W/') ? value.slice(2) : value
  if (selected.length < 2 || selected[0] !== '"' || selected.at(-1) !== '"') return null
  for (let index = 1; index < selected.length - 1; index += 1) {
    const code = selected.charCodeAt(index)
    // RFC 9110 etagc: %x21 / %x23-7E / obs-text. DQUOTE and controls are excluded.
    if (code !== 0x21 && !(code >= 0x23 && code <= 0x7e) && code < 0x80) return null
  }
  return selected
}

function entityTagList(value: string): string[] | null {
  const output: string[] = []
  let offset = 0
  while (offset < value.length) {
    while (offset < value.length && /[\t ]/u.test(value[offset]!)) offset += 1
    const start = offset
    if (value.startsWith('W/', offset)) offset += 2
    if (value[offset] !== '"') return null
    offset += 1
    while (offset < value.length && value[offset] !== '"') {
      const code = value.charCodeAt(offset)
      if (code !== 0x21 && !(code >= 0x23 && code <= 0x7e) && code < 0x80) return null
      offset += 1
    }
    if (offset >= value.length) return null
    offset += 1
    const token = value.slice(start, offset)
    if (!opaqueTag(token)) return null
    output.push(token)
    while (offset < value.length && /[\t ]/u.test(value[offset]!)) offset += 1
    if (offset === value.length) break
    if (value[offset] !== ',') return null
    offset += 1
  }
  return output.length ? output : null
}

/** Implements weak If-None-Match comparison for safe GET/HEAD revalidation. */
export function ifNoneMatchMatches(header: string | null | undefined, currentEtag: string): boolean {
  if (header === null || header === undefined || typeof header !== 'string') return false
  if (encoder.encode(header).byteLength > MAX_IF_NONE_MATCH_BYTES) return false
  const selected = header.trim()
  if (selected === '*') return true
  const current = opaqueTag(currentEtag)
  if (!current) throw new TypeError('Current ETag is invalid')
  const candidates = entityTagList(selected)
  return candidates?.some(candidate => opaqueTag(candidate) === current) ?? false
}
