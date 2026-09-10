export interface SuggestionPayload {
  readonly values?: readonly string[]
  readonly items?: readonly string[]
  readonly suggestions?: readonly string[]
  readonly data?: readonly string[] | { readonly values?: readonly string[] }
}

export function extractSuggestionValues(payload: SuggestionPayload | null | undefined): readonly string[] {
  if (!payload) return []
  const nested = payload.data && !Array.isArray(payload.data)
    ? (payload.data as { readonly values?: readonly string[] }).values
    : undefined
  const candidates = payload.values ?? payload.items ?? payload.suggestions
    ?? (Array.isArray(payload.data) ? payload.data : nested) ?? []
  const seen = new Set<string>()
  const result: string[] = []
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const value = candidate.trim()
    const key = value.toLocaleLowerCase('und')
    if (!value || seen.has(key)) continue
    seen.add(key); result.push(value)
  }
  return result
}
