import { computed, onBeforeUnmount, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { PublicListViewModel } from '~~/shared/contracts/public-content'
import { publicListDefinition } from '~~/shared/utils/public-list-link'

type Row = { uid: string; title?: string | null; name?: string }
export function usePublicInfiniteList<T extends Row>(input: MaybeRefOrGetter<PublicListViewModel<T>>) {
  const initial = computed(() => toValue(input))
  const route = useRoute()
  const pages = shallowRef<PublicListViewModel<T>[]>([initial.value])
  const loading = ref(false)
  const failure = ref<'network' | 'changed' | 'limit' | null>(null)
  const suspended = ref(false)
  let generation = 0
  let controller: AbortController | null = null
  const last = computed(() => pages.value.at(-1)!)
  const nextPage = computed(() => last.value.pagination.nextPage)
  const items = computed(() => pages.value.flatMap(page => page.items))
  const displayModel = computed(() => ({ ...initial.value, items: items.value, pagination: { ...initial.value.pagination, to: last.value.pagination.to } }))
  const nextHref = computed(() => {
    if (!nextPage.value) return ''
    const url = new URL(initial.value.meta.path, 'https://public.invalid')
    url.searchParams.set('page', String(nextPage.value))
    return url.pathname + url.search
  })
  function cancel() { generation++; controller?.abort(); controller = null; loading.value = false }
  function reset() { cancel(); pages.value = [initial.value]; failure.value = null; suspended.value = false }
  async function loadNext() {
    if (loading.value || suspended.value || failure.value === 'changed' || !nextPage.value) return
    const base = initial.value
    const previous = last.value
    const target = nextPage.value
    if ((target - 1) * base.pagination.pageSize > 10000) { failure.value = 'limit'; return }
    const url = new URL(nextHref.value, 'https://public.invalid')
    const definition = publicListDefinition(url.pathname)
    if (!definition) { failure.value = 'changed'; return }
    const current = generation
    controller = new AbortController()
    loading.value = true; failure.value = null
    try {
      const query: Record<string, string> = Object.fromEntries(url.searchParams)
      const page: PublicListViewModel<T> = await $fetch<PublicListViewModel<T>>(`/api/v1/public/${definition.module}`, { query: { ...query, locale: base.locale }, signal: controller.signal, timeout: 15000, retry: 0 })
      if (current !== generation) return
      if (page.schemaVersion !== 1 || page.locale !== base.locale || page.module !== base.module || page.revision !== base.revision || page.totalPublic !== base.totalPublic
        || page.pagination.totalItems !== base.pagination.totalItems || page.pagination.totalPages !== base.pagination.totalPages
        || page.pagination.pageSize !== base.pagination.pageSize || page.pagination.page !== target
        || page.pagination.from !== previous.pagination.to + 1 || page.pagination.to !== Math.min(target * base.pagination.pageSize, page.pagination.totalItems)
        || page.pagination.nextPage !== (target < page.pagination.totalPages ? target + 1 : null)
        || JSON.stringify(page.query.scope ?? null) !== JSON.stringify(base.query.scope ?? null)
        || page.query.search !== base.query.search || JSON.stringify(Object.entries(page.query.filters).sort()) !== JSON.stringify(Object.entries(base.query.filters).sort())
        || !Array.isArray(page.items) || page.items.length !== page.pagination.to - page.pagination.from + 1) throw new Error('changed')
      const seen = new Set(items.value.map(item => item.uid))
      let number = previous.items.at(-1)?.displayNumber ?? (base.module === 'team' ? 0 : base.totalPublic + 1)
      for (const item of page.items) {
        if (typeof item.uid !== 'string' || seen.has(item.uid) || !Number.isSafeInteger(item.displayNumber) || item.displayNumber < 1 || item.displayNumber > base.totalPublic
          || (base.module === 'team' ? item.displayNumber <= number : item.displayNumber >= number)) throw new Error('changed')
        seen.add(item.uid); number = item.displayNumber
      }
      pages.value = [...pages.value, page]
    } catch (error) {
      if (current === generation) failure.value = error instanceof Error && error.message === 'changed' ? 'changed' : 'network'
    } finally { if (current === generation) { loading.value = false; controller = null } }
  }
  watch(initial, reset)
  // A route may change before its new SSR/list model arrives. Never append to the old query in that interval.
  watch(() => [route.path, JSON.stringify(route.query)], () => { cancel(); failure.value = null; suspended.value = true }, { flush: 'sync' })
  onBeforeUnmount(cancel)
  return { pages, items, displayModel, nextPage, nextHref, loading, failure, suspended, loadNext }
}
