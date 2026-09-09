import { generatePublicationCitations } from '../../../shared/admin/publication-tools'
import { PUBLIC_CITATION_LABELS, type PublicCitation, type PublicCitationStyle } from '../../../shared/contracts/public-citation'
import { hasUnpairedSurrogate } from '../../../shared/utils/unicode'
import { PublicSiteError } from './errors'

export type PublicCitationInput = {
  uid: string; title: string; authors: string | null; venue: string | null; year: number | null
  volume: string | null; issue: string | null; pages: string | null; doi: string | null; url: string | null; publicationType: string | null
  text: string | null; highlights: string | null
}
const encoder = new TextEncoder()

/** Commas inside APA/Elsevier names are part of the name, never a Latin-name delimiter. */
export function splitCitationHighlights(value: string | null): string[] {
  const pieces = (value ?? '').split(/[;；|\n、，]/u).flatMap(part => /\p{Script=Han}/u.test(part) && !/\p{Script=Latin}/u.test(part) ? part.split(',') : [part])
  const names = [...new Set(pieces.map(part => part.trim().normalize('NFC')).filter(Boolean))]
  if (names.length > 24 || names.some(name => hasUnpairedSurrogate(name) || /[\u0000-\u001f\u007f]/u.test(name) || encoder.encode(name).byteLength > 256)) throw new PublicSiteError('PUBLIC_LIMIT', 'Citation highlights exceed the supported budget')
  return names
}

/** Saved editorial text wins; fallback uses the same generator as the admin editor and never writes data. */
export function publicCitation(input: PublicCitationInput, style: PublicCitationStyle): PublicCitation {
  let text = input.text ?? ''
  let status: PublicCitation['status'] = text.trim() ? 'saved' : 'missing'
  if (status === 'missing') {
    // The existing generator produces article/conference templates. Do not infer an unknown publication type or missing metadata.
    const sufficient = input.title.trim() && input.authors?.trim() && input.venue?.trim() && input.year
      && /(?:期刊|会议|journal|article|conference|proceedings)/iu.test(input.publicationType ?? '')
    if (sufficient) {
      text = generatePublicationCitations({
        uid: input.uid, title: input.title, authors: input.authors!, venue: input.venue!, year: input.year!,
        volume: input.volume ?? '', issue: input.issue ?? '', pages: input.pages ?? '', doi: input.doi ?? '', url: input.url ?? '', publication_type: input.publicationType!,
      }).fields[`citation_${style}`]
      status = text.trim() ? 'generated' : 'missing'
    }
  }
  if (hasUnpairedSurrogate(text) || encoder.encode(text).byteLength > 32_000) throw new PublicSiteError('PUBLIC_LIMIT', 'Citation text exceeds the supported budget')
  return { style, label: PUBLIC_CITATION_LABELS[style], status, text: status === 'missing' ? '' : text, highlights: status === 'missing' ? [] : splitCitationHighlights(input.highlights) }
}
