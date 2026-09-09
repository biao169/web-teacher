/** Only return to the news workspace; preserve its filters and selected record. */
export function newsEditorReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/admin/news') || /[\\\u0000-\u001f]/u.test(value)) return '/admin/news'
  try {
    const url = new URL(value, 'https://cms.invalid')
    return url.origin === 'https://cms.invalid' && url.pathname === '/admin/news'
      ? `${url.pathname}${url.search}${url.hash}` : '/admin/news'
  } catch { return '/admin/news' }
}

export function newsListReturnPath(value: unknown): string {
  const url = new URL(newsEditorReturnPath(value), 'https://cms.invalid')
  url.searchParams.delete('edit')
  return `${url.pathname}${url.search}${url.hash}`
}

/** Non-HTML source must enter Tiptap as text nodes, never as an HTML fragment. */
export function newsEditorInitialContent(source: string, format: string) {
  if (format === 'html') return source || '<p></p>'
  return {
    type: 'doc',
    content: source.replace(/\r\n?/gu, '\n').split('\n').map(line => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  }
}
