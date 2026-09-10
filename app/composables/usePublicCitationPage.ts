import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { PublicPublicationListViewModel } from '~~/shared/contracts/public-content'
import type { PublicCitationPage } from '~~/shared/contracts/public-citation'
import type { PublicSelectionBatch } from '~~/shared/contracts/public-selection'
import { readPublicCitationPage } from '~~/shared/utils/public-citation'
import { usePublicCitationStyle } from './usePublicCitationStyle'

export function usePublicCitationPage(input: MaybeRefOrGetter<PublicPublicationListViewModel>) {
  const model = computed(() => toValue(input))
  const style = usePublicCitationStyle()
  const key = computed(() => `public-citation-page:v1:${JSON.stringify([model.value.locale, model.value.meta.path, model.value.revision, style.value, model.value.items.map(item => item.uid)])}`)
  return useAsyncData<PublicCitationPage>(key, async (_app, { signal }) => {
    const page = model.value
    const requestedStyle = style.value
    return readPublicCitationPage({ locale: page.locale, style: requestedStyle, revision: page.revision, totalPublic: page.totalPublic, items: page.items },
      uids => $fetch<PublicSelectionBatch>('/api/v1/public/selection', { query: { module: 'publications', locale: page.locale, citationStyle: requestedStyle, uid: uids }, signal, timeout: 15000 }), signal)
  }, { server: true, lazy: false, dedupe: 'cancel', deep: false,
    getCachedData: (key, app) => app.isHydrating ? app.payload.data[key] : undefined,
  })
}
