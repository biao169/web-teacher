export function adminAvatarInitials(value: unknown): string {
  if (typeof value !== 'string') return '?'
  const normalized = value.trim().replace(/\s+/gu, ' ')
  if (!normalized) return '?'
  const words = normalized.split(' ')
  if (words.length > 1) return `${Array.from(words[0]!)[0] ?? ''}${Array.from(words.at(-1)!)[0] ?? ''}`.toLocaleUpperCase()
  return Array.from(normalized).slice(0, 2).join('').toLocaleUpperCase()
}
