export function normalizeAdminSuggestionKey(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US')
}

export function splitAdminSuggestionValue(value: unknown, multiple: boolean): string[] {
  const source = String(value ?? '').normalize('NFC')
  const values = multiple ? source.split(/[;；\n]+/u) : [source]
  return values.map(item => item.trim()).filter(Boolean)
}

export function currentAdminSuggestionToken(value: unknown, multiple: boolean): string {
  const source = String(value ?? '')
  if (!multiple) return source.trim()
  return (source.split(/[;；\n]/u).at(-1) ?? '').trim()
}

export function completedAdminSuggestionTokens(value: unknown, multiple: boolean): string[] {
  if (!multiple) return []
  const source = String(value ?? '')
  return source.split(/[;；\n]/u).slice(0, -1).map(item => item.trim()).filter(Boolean)
}

export function replaceCurrentAdminSuggestionToken(value: unknown, selected: unknown, multiple: boolean): string {
  const source = String(value ?? '')
  const replacement = String(selected ?? '').normalize('NFC').trim()
  if (!multiple) return replacement
  const indexes = [source.lastIndexOf('；'), source.lastIndexOf(';'), source.lastIndexOf('\n')]
  const lastDelimiter = Math.max(...indexes)
  return (lastDelimiter >= 0 ? source.slice(0, lastDelimiter + 1) : '') + replacement
}
