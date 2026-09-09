import type { PublicCitationStyle } from './public-citation'
import type {
  PublicCourseSummary, PublicNumberedRecord, PublicPatentSummary, PublicProjectSummary,
  PublicPublicationSummary, PublicResearchItem, PublicStudentSummary,
} from './public-content'
import type { PublicSiteLocale } from './public-site'

export const PUBLIC_SELECTABLE_MODULES = ['publications', 'projects', 'patents', 'students', 'research', 'courses'] as const
export type PublicSelectableModule = typeof PUBLIC_SELECTABLE_MODULES[number]
export const PUBLIC_SELECTION_LIMIT = 200
export const PUBLIC_SELECTION_BATCH_SIZE = 12
export const PUBLIC_SELECTION_BATCH_BYTES = 1_000_000
export const PUBLIC_SELECTION_TOTAL_BYTES = 4_000_000
export type PublicSelectionEntry = { uid: string; label: string }
export type PublicSelectionState = Record<PublicSelectableModule, PublicSelectionEntry[]>
export type PublicSelectionItem = (PublicPublicationSummary | PublicProjectSummary | PublicPatentSummary | PublicStudentSummary | PublicResearchItem | PublicCourseSummary) & PublicNumberedRecord
export type PublicSelectionRequest = { module: PublicSelectableModule; locale: PublicSiteLocale; uids: readonly string[]; citationStyle?: PublicCitationStyle }
export type PublicSelectionBatch = PublicSelectionRequest & {
  schemaVersion: 1
  generatedAt: string
  revision: string
  totalPublic: number
  items: PublicSelectionItem[]
  unavailableUids: string[]
}

export function publicSelectableModule(module: string): PublicSelectableModule | null {
  const canonical = module === 'publications/featured' ? 'publications' : module
  return (PUBLIC_SELECTABLE_MODULES as readonly string[]).includes(canonical) ? canonical as PublicSelectableModule : null
}

export function emptyPublicSelection(): PublicSelectionState {
  return { publications: [], projects: [], patents: [], students: [], research: [], courses: [] }
}
