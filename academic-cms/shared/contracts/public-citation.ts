import type { PublicMedia } from './public-site'
export const PUBLIC_CITATION_STYLES = ['gbt', 'elsevier', 'apa', 'ieee'] as const
export type PublicCitationStyle = typeof PUBLIC_CITATION_STYLES[number]
export const PUBLIC_CITATION_LABELS: Readonly<Record<PublicCitationStyle, string>> = Object.freeze({ gbt: 'GB/T 7714', elsevier: 'Elsevier', apa: 'APA', ieee: 'IEEE' })
export function isPublicCitationStyle(value: unknown): value is PublicCitationStyle {
  return typeof value === 'string' && (PUBLIC_CITATION_STYLES as readonly string[]).includes(value)
}
export type PublicCitation = {
  style: PublicCitationStyle
  label: string
  status: 'saved' | 'generated' | 'missing'
  text: string
  highlights: string[]
}
export type PublicCitationPage = {
  style: PublicCitationStyle
  revision: string
  entries: Array<{ uid: string; citation: PublicCitation; pdf?: PublicMedia }>
}
