import { usePublicCitationStyle } from './usePublicCitationStyle'
import { readPublicSelectedItems } from '~~/shared/utils/public-selection'
import { computed, onBeforeUnmount, ref, toValue, watch, type InjectionKey, type MaybeRefOrGetter } from 'vue'
import {
  emptyPublicSelection, publicSelectableModule, PUBLIC_SELECTION_LIMIT,
  type PublicSelectionBatch, type PublicSelectionEntry,
  type PublicSelectionItem, type PublicSelectionState,
} from '~~/shared/contracts/public-selection'
import type { PublicSiteLocale } from '~~/shared/contracts/public-site'

type SelectionPage = {
  module: string; locale: PublicSiteLocale; revision: string; meta: { path: string }
  items: Array<{ uid: string; name?: string; title?: string | null }>
}
export const PUBLIC_SELECTION_CONTEXT: InjectionKey<ReturnType<typeof usePublicSelection>> = Symbol('public-selection')
export function usePublicSelection(input: MaybeRefOrGetter<SelectionPage>) {
  // Nuxt request-scoped state survives client-side navigation, never persists in a database or browser storage.
  const citationStyle = usePublicCitationStyle()
  const state = useState<PublicSelectionState>('public-selection:v1', emptyPublicSelection)
  const page = computed(() => toValue(input))
  const module = computed(() => publicSelectableModule(page.value.module))
  const enabled = computed(() => module.value !== null)
  const entries = computed(() => module.value ? state.value[module.value] : [])
  const ids = computed(() => new Set(entries.value.map(entry => entry.uid)))
  const currentIds = computed(() => new Set(page.value.items.map(item => item.uid)))
  const count = computed(() => entries.value.length)
  const onPageCount = computed(() => [...currentIds.value].filter(uid => ids.value.has(uid)).length)
  const outsideCount = computed(() => count.value - onPageCount.value)
  const allOnPage = computed(() => currentIds.value.size > 0 && onPageCount.value === currentIds.value.size)
  const someOnPage = computed(() => onPageCount.value > 0 && !allOnPage.value)
  const notice = ref('')
  const phase = ref<'idle' | 'preparing' | 'ready' | 'review' | 'error'>('idle')
  const processed = ref(0)
  const items = ref<PublicSelectionItem[]>([])
  const unavailable = ref<string[]>([])
  const missingCitations = computed(() => module.value === 'publications' ? items.value.filter(item => 'citation' in item && item.citation?.status === 'missing').map(item => item.uid) : [])
  const error = ref('')
  const preparedRevision = ref<string | null>(null)
  let generation = 0
  let controller: AbortController | null = null
  const message = (zh: string, en: string) => page.value.locale === 'zh' ? zh : en

  function invalidate() {
    generation++; controller?.abort(); controller = null
    phase.value = 'idle'; processed.value = 0; items.value = []; unavailable.value = []; error.value = ''; preparedRevision.value = null
  }
  function setEntries(next: PublicSelectionEntry[]) {
    if (!module.value) return
    if (next.length > PUBLIC_SELECTION_LIMIT) { notice.value = message(`最多选择 ${PUBLIC_SELECTION_LIMIT} 条，请先移除部分已选条目。`, `Select up to ${PUBLIC_SELECTION_LIMIT} items. Remove some selections first.`); return }
    notice.value = ''
    state.value[module.value] = next
  }
  function toggle(uid: string, label: string, checked: boolean) {
    if (!enabled.value) return
    setEntries(checked ? (ids.value.has(uid) ? entries.value : [...entries.value, { uid, label }]) : entries.value.filter(entry => entry.uid !== uid))
  }
  function togglePage(checked: boolean) {
    if (!enabled.value) return
    if (!checked) { setEntries(entries.value.filter(entry => !currentIds.value.has(entry.uid))); return }
    const added = page.value.items.filter(item => !ids.value.has(item.uid)).map(item => ({ uid: item.uid, label: item.title ?? item.name ?? item.uid }))
    setEntries([...entries.value, ...added])
  }
  function clear() { setEntries([]) }
  function removeUnavailable() {
    const blocked = new Set(unavailable.value)
    setEntries(entries.value.filter(entry => !blocked.has(entry.uid)))
  }

  async function prepare() {
    invalidate()
    const selectedModule = module.value
    const requested = entries.value.map(entry => entry.uid)
    if (!selectedModule || !requested.length) return
    const locale = page.value.locale
    const requestedStyle = selectedModule === 'publications' ? citationStyle.value : undefined
    const current = generation
    controller = new AbortController()
    const signal = controller.signal
    phase.value = 'preparing'
    try {
      const result = await readPublicSelectedItems({ module: selectedModule, locale, uids: requested, ...(requestedStyle ? { citationStyle: requestedStyle } : {}) },
        chunk => $fetch<PublicSelectionBatch>('/api/v1/public/selection', { query: { module: selectedModule, locale, uid: chunk, ...(requestedStyle ? { citationStyle: requestedStyle } : {}) }, signal, timeout: 15000 }),
        signal, count => { if (current === generation) processed.value = count })
      if (current !== generation) return
      const blocked = result.unavailable
      items.value = result.items; unavailable.value = blocked; preparedRevision.value = result.revision
      phase.value = blocked.length || missingCitations.value.length ? 'review' : 'ready'
    } catch (reason) {
      if (current !== generation) return
      items.value = []; unavailable.value = []; preparedRevision.value = null; phase.value = 'error'
      error.value = reason instanceof Error && reason.message === 'changed'
        ? message('内容在准备期间发生变化，请重新准备，确保条目和编号一致。', 'Content changed during preparation. Prepare again to refresh the items and numbers.')
        : reason instanceof Error && reason.message === 'size'
          ? message('已选内容较大，请减少条目后重新准备。', 'The selected content is too large. Select fewer items and prepare again.')
          : message('已选内容读取失败，本次数据未就绪。请重试。', 'Could not read the selected content. No data is ready; please retry.')
    }
  }

  const contextKey = computed(() => JSON.stringify([module.value, page.value.locale, page.value.revision, page.value.meta.path, module.value === 'publications' ? citationStyle.value : '', entries.value.map(entry => entry.uid)]))
  watch(contextKey, invalidate, { flush: 'sync' })
  // A fresh localized page updates labels without transferring selection to a different UID.
  watch(() => page.value.items, rows => {
    if (!module.value) return
    const labels = new Map(rows.map(item => [item.uid, item.title ?? item.name ?? item.uid]))
    for (const entry of entries.value) if (labels.has(entry.uid)) entry.label = labels.get(entry.uid)!
  }, { immediate: true })
  onBeforeUnmount(invalidate)
  return { contextKey, enabled, module, locale: computed(() => page.value.locale), entries, ids, count, onPageCount, outsideCount, allOnPage, someOnPage, notice, phase, processed, items, unavailable, missingCitations, error, preparedRevision, toggle, togglePage, clear, removeUnavailable, prepare, invalidate }
}
