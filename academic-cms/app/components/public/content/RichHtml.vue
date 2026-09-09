<script lang="ts">
import { defineComponent, h, type PropType, type VNodeChild } from 'vue'

import PdfDocument from './PdfDocument.vue'

const TAGS = new Set(['div', 'span', 'small', 'p', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'strong', 'em', 'u', 's', 'a', 'br', 'hr', 'figure', 'img'])
const VOID_TAGS = new Set(['br', 'hr', 'img'])
const CLASS_VALUES = /^(?:rich-align-(?:center|right|justify)|rich-image-(?:none|left|right|center|wide))$/u
const MAX_HTML_LENGTH = 1_024_000
const MAX_NODES = 5_000

interface RichElement {
  tag: string
  attributes: Record<string, string>
  children: RichNode[]
}
type RichNode = string | RichElement

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp);/giu, (token, name: string) => {
    const lower = name.toLowerCase()
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
    if (Object.hasOwn(named, lower)) return named[lower]!
    const point = lower.startsWith('#x') ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10)
    return Number.isSafeInteger(point) && point >= 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : token
  })
}

function attributeValue(source: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'iu').exec(source)
  const value = match?.[1] ?? match?.[2]
  return value === undefined ? null : decodeEntities(value)
}

function safeHref(value: string | null): string | null {
  if (!value || value.length > 2_048) return null
  try {
    const url = new URL(value)
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : null
  } catch { return null }
}

function safeImageSource(value: string | null): string | null {
  if (!value || value.length > 4_096) return null
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : null
  } catch { return null }
}

function safeAttributes(tag: string, source: string): Record<string, string> {
  if (tag === 'a') {
    const href = safeHref(attributeValue(source, 'href'))
    return href ? { href, rel: 'noopener noreferrer nofollow' } : {}
  }
  if (tag === 'img') {
    const src = safeImageSource(attributeValue(source, 'src'))
    return src ? { src, alt: (attributeValue(source, 'alt') ?? '').slice(0, 500), loading: 'lazy', decoding: 'async' } : {}
  }
  if (tag === 'figure') {
    const src = attributeValue(source, 'data-pdf-src')
    if (src && /^\/(?:api\/v1\/public\/news\/[^/]+\/pdf\?key=|api\/v1\/admin\/complete\/media\/[^/]+\/preview(?:\?|$))[^\\]*$/u.test(src)) return { 'data-pdf-src': src, 'data-title': (attributeValue(source, 'data-title') ?? '').slice(0, 500) }
  }
  if (['div', 'span', 'small', 'p'].includes(tag) || /^h[2-4]$/u.test(tag) || tag === 'figure') {
    const className = attributeValue(source, 'class')
    return className && CLASS_VALUES.test(className) ? { class: className } : {}
  }
  return {}
}

function parseRichHtml(value: string): RichNode[] {
  if (!value || value.length > MAX_HTML_LENGTH) return []
  const root: RichElement = { tag: 'div', attributes: {}, children: [] }
  const stack = [root]
  let nodes = 0
  const tokens = value.match(/<\/?[A-Za-z][^>]{0,4096}>|[^<]+|</gu) ?? []
  for (const token of tokens) {
    if (nodes >= MAX_NODES) break
    if (!token.startsWith('<') || token === '<') {
      stack.at(-1)!.children.push(decodeEntities(token)); nodes += 1; continue
    }
    const parsed = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9]*)\b([^>]*)>$/u.exec(token)
    if (!parsed) continue
    const closing = parsed[1] === '/'
    const tag = parsed[2]!.toLowerCase()
    if (!TAGS.has(tag)) continue
    if (closing) {
      const index = stack.map(item => item.tag).lastIndexOf(tag)
      if (index > 0) stack.splice(index)
      continue
    }
    const attributes = safeAttributes(tag, parsed[3] ?? '')
    if ((tag === 'a' && !attributes.href) || (tag === 'img' && !attributes.src)) continue
    const node: RichElement = { tag, attributes, children: [] }
    stack.at(-1)!.children.push(node); nodes += 1
    if (!VOID_TAGS.has(tag)) stack.push(node)
  }
  return root.children
}

function renderNode(node: RichNode, index: number, locale: 'zh' | 'en'): VNodeChild {
  if (typeof node === 'string') return node
  if (node.tag === 'figure' && node.attributes['data-pdf-src']) return h(PdfDocument, { key: `pdf:${index}`, src: node.attributes['data-pdf-src'], title: node.attributes['data-title'] ?? '', locale })
  return h(node.tag, { ...node.attributes, key: `${node.tag}:${index}` }, node.children.map((child, i) => renderNode(child, i, locale)))
}

export default defineComponent({
  name: 'PublicContentRichHtml',
  props: { html: { type: String as PropType<string>, required: true }, locale: { type: String as PropType<'zh' | 'en'>, default: 'zh' } },
  setup(props) {
    return () => h('div', { class: 'public-rich-html' }, parseRichHtml(props.html).map((node, i) => renderNode(node, i, props.locale)))
  },
})
</script>
