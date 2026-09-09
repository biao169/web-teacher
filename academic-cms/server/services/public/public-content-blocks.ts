import type { PublicContentBlock } from '../../../shared/contracts/public-content'
import { hasUnpairedSurrogate } from '../../../shared/utils/unicode'
import { PublicSiteError } from './errors'

const encoder = new TextEncoder()
const MAX_SOURCE_BYTES = 512_000
const MAX_BLOCKS = 240
const MAX_BLOCK_TEXT_BYTES = 32_000
const MAX_LIST_ITEMS = 120

function cleanText(value: string): string {
  const normalized = value.normalize('NFC').replace(/\r\n?/gu, '\n').trim()
  if (hasUnpairedSurrogate(normalized) || encoder.encode(normalized).byteLength > MAX_BLOCK_TEXT_BYTES) {
    throw new PublicSiteError('PUBLIC_LIMIT', 'Public content block exceeds its text budget')
  }
  return normalized
}

function push(blocks: PublicContentBlock[], block: PublicContentBlock): void {
  if ('text' in block && !block.text) return
  if (block.type === 'list' && block.items.length === 0) return
  if (blocks.length >= MAX_BLOCKS) throw new PublicSiteError('PUBLIC_LIMIT', 'Public content contains too many blocks')
  blocks.push(block)
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp);/giu, (token, name: string) => {
    const lower = name.toLowerCase()
    if (lower === 'amp') return '&'
    if (lower === 'lt') return '<'
    if (lower === 'gt') return '>'
    if (lower === 'quot') return '"'
    if (lower === 'apos') return "'"
    if (lower === 'nbsp') return ' '
    const point = lower.startsWith('#x') ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10)
    if (!Number.isSafeInteger(point) || point < 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) return '�'
    return String.fromCodePoint(point)
  })
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function attributeValue(source: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`, 'iu').exec(source)
  const value = match?.[1] ?? match?.[2] ?? match?.[3]
  return value === undefined ? null : decodeEntities(value)
}

function safeMediaKey(value: string | null): string | null {
  if (!value || value.length > 512 || value.includes('//') || value.includes('\\') || value.startsWith('.') || /(?:^|\/)\.\.(?:\/|$)/u.test(value)) return null
  return /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,511}$/u.test(value) ? value : null
}

export function richTextMediaKeysFromHtml(source: string | null): string[] {
  return [...new Set(richTextMediaReferencesFromHtml(source).map(item => item.objectKey))]
}

export function richTextMediaReferencesFromHtml(source: string | null): Array<{ objectKey: string; kind: 'image' | 'pdf' }> {
  if (!source) return []
  const refs = new Map<string, { objectKey: string; kind: 'image' | 'pdf' }>()
  const visibleSource = source.replace(/<!--[\s\S]*?-->/gu, '').replace(/<(script|style|template|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, '').replace(/<(?:script|style|template|iframe|object|svg|math)\b[^>]*(?:>|$)[\s\S]*$/giu, '')
  for (const match of visibleSource.matchAll(/<(img|figure)\b([^>]{0,4096})>/giu)) {
    const attributes = match[2] ?? ''
    const kind = match[1]?.toLowerCase() === 'img' ? 'image' : attributeValue(attributes, 'data-type') === 'pdf' ? 'pdf' : null
    const key = safeMediaKey(attributeValue(attributes, 'data-object-key'))
    if (key && kind) refs.set(`${kind}:${key}`, { objectKey: key, kind })
    if (refs.size > 200) throw new PublicSiteError('PUBLIC_LIMIT', 'Public rich text contains too many media references')
  }
  return [...refs.values()]
}

function safeLink(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : null
  } catch { return null }
}

function sanitizeRichHtml(source: string, mediaUrls: ReadonlyMap<string, string>, pdfUrls: ReadonlyMap<string, string>): string {
  const allowed = new Set(['div','span','small','p','h2','h3','h4','blockquote','ul','ol','li','pre','code','strong','em','u','s','a','br','hr','figure','img'])
  const blocked = new Set(['script','style','template','iframe','object','svg','math'])
  const stack: string[] = []
  const blockedStack: string[] = []
  const output: string[] = []
  const tokens = source.match(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]{0,4096}>|[^<]+|</gu) ?? []
  for (const token of tokens) {
    if (token.startsWith('<!--')) continue
    if (!token.startsWith('<') || token === '<') {
      if (blockedStack.length === 0) output.push(escapeHtml(decodeEntities(token)))
      continue
    }
    const parsed = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9]*)\b([^>]*)>$/u.exec(token)
    if (!parsed) { if (blockedStack.length === 0) output.push('&lt;'); continue }
    const closing = parsed[1] === '/'
    const tag = parsed[2]!.toLowerCase()
    const attributes = parsed[3] ?? ''
    if (blocked.has(tag)) {
      if (!closing) blockedStack.push(tag)
      else {
        const index = blockedStack.lastIndexOf(tag)
        if (index >= 0) blockedStack.splice(index)
      }
      continue
    }
    if (blockedStack.length > 0 || !allowed.has(tag)) continue
    if (closing) {
      const index = stack.lastIndexOf(tag)
      if (index < 0) continue
      while (stack.length > index) output.push(`</${stack.pop()!}>`)
      continue
    }
    if (tag === 'br' || tag === 'hr') { output.push(`<${tag}>`); continue }
    if (tag === 'img') {
      const key = safeMediaKey(attributeValue(attributes, 'data-object-key'))
      const url = key ? mediaUrls.get(key) : null
      if (!key || !url) continue
      const alt = (attributeValue(attributes, 'alt') ?? '').normalize('NFC').slice(0, 500)
      output.push(`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`)
      continue
    }
    let safeAttributes = ''
    if (tag === 'figure' && attributeValue(attributes, 'data-type') === 'pdf') {
      const key = safeMediaKey(attributeValue(attributes, 'data-object-key'))
      const url = key ? pdfUrls.get(key) : null
      if (!url) continue
      const title = (attributeValue(attributes, 'data-title') ?? '').slice(0, 500)
      safeAttributes = ` data-pdf-src="${escapeHtml(url)}" data-title="${escapeHtml(title)}"`
    } else if (tag === 'a') {
      const href = safeLink(attributeValue(attributes, 'href'))
      if (!href) continue
      safeAttributes = ` href="${escapeHtml(href)}" rel="noopener noreferrer nofollow"`
    } else if (['div', 'span', 'small', 'p'].includes(tag) || /^h[2-4]$/u.test(tag)) {
      const align = /(?:^|;)\s*text-align\s*:\s*(center|right|justify)\s*(?:;|$)/iu.exec(attributeValue(attributes, 'style') ?? '')?.[1]?.toLowerCase()
      const className = align ? `rich-align-${align}` : attributeValue(attributes, 'class')
      if (className && /^rich-align-(?:center|right|justify)$/u.test(className)) safeAttributes = ` class="${className}"`
    } else if (tag === 'figure') {
      const className = attributeValue(attributes, 'class')
      if (className && /^rich-image-(?:none|left|right|center|wide)$/u.test(className)) safeAttributes = ` class="${className}"`
    }
    output.push(`<${tag}${safeAttributes}>`)
    stack.push(tag)
  }
  while (stack.length) output.push(`</${stack.pop()!}>`)
  const html = output.join('')
  if (encoder.encode(html).byteLength > MAX_SOURCE_BYTES * 2) throw new PublicSiteError('PUBLIC_LIMIT', 'Sanitized rich text exceeds its output budget')
  return html
}

function paragraphs(value: string): PublicContentBlock[] {
  const blocks: PublicContentBlock[] = []
  for (const part of value.split(/\n{2,}/u)) {
    const text = cleanText(part.replace(/[ \t]+/gu, ' ').replace(/\n/gu, ' '))
    if (text) push(blocks, { type: 'paragraph', text })
  }
  return blocks
}

function plainTextFromHtml(source: string): string {
  const value = source
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<(script|style|template|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, ' ')
    .replace(/<\s*br\s*\/?>/giu, '\n')
    .replace(/<\s*\/\s*(?:p|div|section|article|header|footer|h[1-6]|blockquote|pre|li|ul|ol|table|tr)\s*>/giu, '\n\n')
    .replace(/<\s*li\b[^>]*>/giu, '\n• ')
    .replace(/<[^>]{0,4096}>/gu, ' ')
    .replace(/[ \t]+/gu, ' ')
  return cleanText(Array.from(value).slice(0, 7_000).join(''))
}

function fromHtml(source: string, mediaUrls: ReadonlyMap<string, string>, pdfUrls: ReadonlyMap<string, string>): PublicContentBlock[] {
  const html = sanitizeRichHtml(source, mediaUrls, pdfUrls)
  if (!html) return []
  return [{ type: 'rich', html, text: plainTextFromHtml(html) }]
}

function sanitizedMarkdownLines(source: string): string[] {
  const lines = source.replace(/\r\n?/gu, '\n').split('\n')
  const output: string[] = []
  let fenced = false
  let pending: string[] = []
  const flush = () => {
    if (pending.length === 0) return
    const safe = pending.join('\n')
      .replace(/<!--[\s\S]*?-->/gu, ' ')
      .replace(/<(script|style|template|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, ' ')
      .replace(/<(?:script|style|template|iframe|object|svg|math)\b[^>]*(?:>|$)[\s\S]*$/giu, ' ')
      .replace(/<[^>\n]{0,4096}>/gu, ' ')
    output.push(...safe.split('\n'))
    pending = []
  }
  for (const line of lines) {
    if (/^\s*```/u.test(line)) {
      if (!fenced) flush()
      output.push(line)
      fenced = !fenced
      continue
    }
    if (fenced) output.push(line)
    else pending.push(line)
  }
  flush()
  return output
}

function fromMarkdown(source: string): PublicContentBlock[] {
  const blocks: PublicContentBlock[] = []
  const lines = sanitizedMarkdownLines(source)
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let quote: string[] = []
  let code: string[] | null = null

  const flushParagraph = () => {
    const text = cleanText(paragraph.join(' ').replace(/[ \t]+/gu, ' '))
    paragraph = []
    if (text) push(blocks, { type: 'paragraph', text })
  }
  const flushList = () => {
    if (list) push(blocks, { type: 'list', ordered: list.ordered, items: list.items })
    list = null
  }
  const flushQuote = () => {
    const text = cleanText(quote.join(' ').replace(/[ \t]+/gu, ' '))
    quote = []
    if (text) push(blocks, { type: 'quote', text })
  }
  const flushAll = () => { flushParagraph(); flushList(); flushQuote() }

  for (const rawLine of lines) {
    if (encoder.encode(rawLine).byteLength > MAX_BLOCK_TEXT_BYTES) throw new PublicSiteError('PUBLIC_LIMIT', 'Public content line exceeds its budget')
    if (code !== null) {
      if (/^\s*```/u.test(rawLine)) {
        const text = cleanText(code.join('\n'))
        if (text) push(blocks, { type: 'code', text })
        code = null
      }
      else code.push(rawLine)
      continue
    }
    if (/^\s*```/u.test(rawLine)) { flushAll(); code = []; continue }
    const line = rawLine.trim()
    if (!line) { flushAll(); continue }
    const heading = /^(#{1,3})\s+(.+)$/u.exec(line)
    if (heading) {
      flushAll()
      const level = heading[1]!.length <= 2 ? 2 : 3
      push(blocks, { type: 'heading', level, text: cleanText(heading[2]!) })
      continue
    }
    const quoted = /^>\s?(.*)$/u.exec(line)
    if (quoted) { flushParagraph(); flushList(); quote.push(quoted[1]!); continue }
    const unordered = /^[-*+]\s+(.+)$/u.exec(line)
    const ordered = /^\d{1,4}[.)]\s+(.+)$/u.exec(line)
    if (unordered || ordered) {
      flushParagraph(); flushQuote()
      const isOrdered = Boolean(ordered)
      if (list && list.ordered !== isOrdered) flushList()
      list ??= { ordered: isOrdered, items: [] }
      if (list.items.length >= MAX_LIST_ITEMS) throw new PublicSiteError('PUBLIC_LIMIT', 'Public content list has too many items')
      list.items.push(cleanText((ordered ?? unordered)![1]!))
      continue
    }
    flushList(); flushQuote(); paragraph.push(line)
  }
  if (code !== null) {
    const text = cleanText(code.join('\n'))
    if (text) push(blocks, { type: 'code', text })
  }
  flushAll()
  return blocks
}

export function publicContentBlocks(source: string | null, format: 'plain' | 'html' | 'markdown', mediaUrls: ReadonlyMap<string, string> = new Map(), pdfUrls: ReadonlyMap<string, string> = new Map()): PublicContentBlock[] {
  if (source === null || source === '') return []
  if (typeof source !== 'string' || hasUnpairedSurrogate(source) || encoder.encode(source).byteLength > MAX_SOURCE_BYTES) {
    throw new PublicSiteError('PUBLIC_LIMIT', 'Public content exceeds its source budget')
  }
  if (format === 'html') return fromHtml(source, mediaUrls, pdfUrls)
  if (format === 'markdown') return fromMarkdown(source)
  if (format !== 'plain') throw new PublicSiteError('PUBLIC_PROTOCOL', 'Unsupported public content format')
  return paragraphs(source)
}

/** Website settings own the complete footer body; plain text retains its line breaks. */
export function publicFooterHtml(source: string | null): string | null {
  if (!source?.trim()) return null
  if (hasUnpairedSurrogate(source) || encoder.encode(source).byteLength > 64_000) return null
  const html = sanitizeRichHtml(/<[A-Za-z][^>]*>/u.test(source) ? source : escapeHtml(source).replace(/\r?\n/gu, '<br>'), new Map(), new Map())
  return html.trim() || null
}
