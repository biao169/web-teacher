import { PUBLIC_SELECTION_LIMIT, PUBLIC_SELECTION_BATCH_SIZE, PUBLIC_SELECTION_TOTAL_BYTES, type PublicSelectionRequest, type PublicSelectionBatch, type PublicSelectionItem } from '../contracts/public-selection'
import { validPublicCitation } from './public-citation'

// Single and bulk copy revalidate the same public projection, never a cached detail or private field.
export async function readPublicSelectedItems(request: PublicSelectionRequest, load: (uids: string[]) => Promise<PublicSelectionBatch>, signal: AbortSignal, onProgress?: (count: number) => void) {
  const { module: selectedModule, locale, citationStyle: requestedStyle } = request
  const requested = [...request.uids]
  if (!requested.length || requested.length > PUBLIC_SELECTION_LIMIT || new Set(requested).size !== requested.length) throw new Error('selection')
  const ready: PublicSelectionItem[] = [], blocked: string[] = []
  const numbers = new Set<number>()
  let revision: string | null = null, totalPublic: number | null = null, bytes = 0
      for (let offset = 0; offset < requested.length; offset += PUBLIC_SELECTION_BATCH_SIZE) {
        const chunk = requested.slice(offset, offset + PUBLIC_SELECTION_BATCH_SIZE)
        if (signal.aborted) throw signal.reason ?? new Error('aborted')
        const result = await load(chunk)
        if (signal.aborted) throw signal.reason ?? new Error('aborted')
        const expected = new Set(chunk)
        if (result.schemaVersion !== 1 || result.module !== selectedModule || result.locale !== locale
          || !/^[a-f0-9]{64}$/u.test(result.revision) || !Number.isSafeInteger(result.totalPublic) || result.totalPublic < 0
          || !Array.isArray(result.items) || !Array.isArray(result.unavailableUids) || !Array.isArray(result.uids)
          || result.uids.length !== chunk.length || result.uids.some(uid => !expected.has(uid)) || new Set(result.uids).size !== chunk.length) throw new Error('protocol')
        if (requestedStyle && (result.citationStyle !== requestedStyle || result.items.some(item => !('citation' in item) || !validPublicCitation(item.citation, requestedStyle)))) throw new Error('protocol')
        const received = [...result.items.map(item => item.uid), ...result.unavailableUids]
        if (received.length !== chunk.length || new Set(received).size !== chunk.length || received.some(uid => !expected.has(uid))
          || result.items.some(item => !Number.isInteger(item.displayNumber) || item.displayNumber < 1 || item.displayNumber > result.totalPublic)) throw new Error('protocol')
        if (revision !== null && (revision !== result.revision || totalPublic !== result.totalPublic)) throw new Error('changed')
        for (const item of result.items) {
          if (numbers.has(item.displayNumber)) throw new Error('protocol')
          numbers.add(item.displayNumber)
        }
        revision = result.revision; totalPublic = result.totalPublic
        bytes += new TextEncoder().encode(JSON.stringify(result.items)).byteLength
        if (bytes > PUBLIC_SELECTION_TOTAL_BYTES) throw new Error('size')
        ready.push(...result.items); blocked.push(...result.unavailableUids)
        onProgress?.(offset + chunk.length)
      }

  return { items: ready.sort((a, b) => b.displayNumber - a.displayNumber || a.uid.localeCompare(b.uid)), unavailable: blocked, revision }
}
