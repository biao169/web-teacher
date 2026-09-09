import { PUBLIC_SELECTION_BATCH_SIZE, PUBLIC_SELECTION_TOTAL_BYTES, type PublicSelectionBatch } from '../contracts/public-selection'
import type { PublicCitation, PublicCitationPage, PublicCitationStyle } from '../contracts/public-citation'
import type { PublicSiteLocale } from '../contracts/public-site'
import { splitHighlightedText } from './text-highlight'

/** Display and the next step's clipboard serializer consume this exact segment sequence. */
export function publicCitationSegments(citation: PublicCitation) {
  return citation.status === 'missing' ? [] : splitHighlightedText(citation.text, citation.highlights)
}
export function validPublicCitation(value: unknown, style: PublicCitationStyle): value is PublicCitation {
  if (!value || typeof value !== 'object') return false
  const citation = value as PublicCitation
  return citation.style === style && typeof citation.label === 'string' && typeof citation.text === 'string'
    && ['saved', 'generated', 'missing'].includes(citation.status)
    && (citation.status === 'missing' ? citation.text === '' : Boolean(citation.text.trim()))
    && Array.isArray(citation.highlights) && citation.highlights.length <= 24 && citation.highlights.every(name => typeof name === 'string')
}
export type PublicCitationPageRequest = {
  locale: PublicSiteLocale; style: PublicCitationStyle; revision: string; totalPublic: number
  items: readonly { uid: string; displayNumber: number }[]
}
/** Only one format per bounded batch. No partial page is published on error or version mismatch. */
export async function readPublicCitationPage(
  request: PublicCitationPageRequest,
  load: (uids: string[]) => Promise<PublicSelectionBatch>,
  signal: AbortSignal,
): Promise<PublicCitationPage> {
  const entries: PublicCitationPage['entries'] = []
  let bytes = 0
  if (request.items.length > 36 || new Set(request.items.map(item => item.uid)).size !== request.items.length) throw new Error('citation-protocol')
  for (let offset = 0; offset < request.items.length; offset += PUBLIC_SELECTION_BATCH_SIZE) {
    if (signal.aborted) throw signal.reason ?? new Error('aborted')
    const page = request.items.slice(offset, offset + PUBLIC_SELECTION_BATCH_SIZE)
    const uids = page.map(item => item.uid)
    const batch = await load(uids)
    if (signal.aborted) throw signal.reason ?? new Error('aborted')
    if (batch.schemaVersion !== 1 || batch.module !== 'publications' || batch.locale !== request.locale || batch.citationStyle !== request.style
      || !Array.isArray(batch.items) || !Array.isArray(batch.unavailableUids) || !Array.isArray(batch.uids)
      || batch.uids.length !== uids.length || new Set(batch.uids).size !== uids.length || batch.uids.some(uid => !uids.includes(uid))) throw new Error('citation-protocol')
    if (batch.revision !== request.revision || batch.totalPublic !== request.totalPublic || batch.unavailableUids.length) throw new Error('citation-changed')
    if (batch.items.length !== page.length || new Set(batch.items.map(item => item.uid)).size !== page.length) throw new Error('citation-protocol')
    for (const item of batch.items) {
      const expected = page.find(row => row.uid === item.uid)
      if (!expected || expected.displayNumber !== item.displayNumber || !('citation' in item) || !validPublicCitation(item.citation, request.style)) throw new Error('citation-protocol')
      entries.push({ uid: item.uid, citation: item.citation, ...('pdf' in item && item.pdf ? { pdf: item.pdf } : {}) })
    }
    bytes += new TextEncoder().encode(JSON.stringify(batch)).byteLength
    if (bytes > PUBLIC_SELECTION_TOTAL_BYTES) throw new Error('citation-size')
  }
  return { style: request.style, revision: request.revision, entries }
}
