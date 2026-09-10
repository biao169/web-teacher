export interface TextHighlightSegment {
  text: string
  highlighted: boolean
}

function normalizedCandidates(values: readonly string[]): string[] {
  return [...new Set(values.map(value => String(value ?? '').normalize('NFC').trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
}
function isLatinWord(value: string): boolean {
  return /^[\p{Script=Latin}\p{M}\s.,'’ʼ\-‐‑]+$/u.test(value) && /\p{Script=Latin}/u.test(value)
}
function wordCharacter(value: string | undefined): boolean {
  return Boolean(value && /[\p{L}\p{M}\p{N}_'’ʼ\-‐‑]/u.test(value))
}
function validBoundary(source: string, index: number, length: number, candidate: string): boolean {
  if (!isLatinWord(candidate)) return true
  const before = Array.from(source.slice(Math.max(0, index - 2), index)).at(-1)
  const after = Array.from(source.slice(index + length, index + length + 2))[0]
  return !wordCharacter(before) && !wordCharacter(after)
}
function escaped(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') }

/** Canonical matching retains the exact original string (including decomposed accents and punctuation). */
export function splitHighlightedText(value: unknown, highlights: readonly string[]): TextHighlightSegment[] {
  const original = String(value ?? '')
  const candidates = normalizedCandidates(highlights)
  if (!original || !candidates.length) return original ? [{ text: original, highlighted: false }] : []
  const source = original.normalize('NFC')
  let offsets: number[] | null = null
  if (source !== original) {
    offsets = [0]
    let normalizedOffset = 0
    for (const part of new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(original)) {
      const normalized = part.segment.normalize('NFC')
      for (let i = 0; i < normalized.length; i++) offsets[normalizedOffset + i] = part.index
      normalizedOffset += normalized.length
      offsets[normalizedOffset] = part.index + part.segment.length
    }
  }
  const slice = (start: number, end: number) => original.slice(offsets?.[start] ?? start, offsets?.[end] ?? end)
  // Unicode regex matching avoids lowercasing offsets changing under characters such as İ.
  const matchers = candidates.map(text => ({ text, expression: new RegExp(escaped(text), 'iyu') }))
  const segments: TextHighlightSegment[] = []
  let plainStart = 0
  let cursor = 0
  while (cursor < source.length) {
    let length = 0
    for (const candidate of matchers) {
      candidate.expression.lastIndex = cursor
      const match = candidate.expression.exec(source)
      if (match && validBoundary(source, cursor, match[0].length, candidate.text)) { length = match[0].length; break }
    }
    if (!length) { cursor += (source.codePointAt(cursor) ?? 0) > 0xffff ? 2 : 1; continue }
    if (cursor > plainStart) segments.push({ text: slice(plainStart, cursor), highlighted: false })
    const previous = segments.at(-1)
    if (previous?.highlighted) previous.text += slice(cursor, cursor + length)
    else segments.push({ text: slice(cursor, cursor + length), highlighted: true })
    cursor += length
    plainStart = cursor
  }
  if (plainStart < source.length) segments.push({ text: slice(plainStart, source.length), highlighted: false })
  return segments.length ? segments : [{ text: original, highlighted: false }]
}
