import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { PublicHomeViewModel, PublicSiteLocale } from '~~/shared/contracts/public-site'

export function usePublicHome(localeInput: MaybeRefOrGetter<PublicSiteLocale>) {
  const locale = computed<PublicSiteLocale>(() => {
    const value = toValue(localeInput)
    return value === 'en' ? 'en' : 'zh'
  })
  const endpoint = computed(() => `/api/v1/public/home?locale=${locale.value}`)
  const key = computed(() => `public-home:v1:${locale.value}`)
  return useFetch<PublicHomeViewModel>(endpoint, {
    key,
    server: true,
    lazy: false,
    dedupe: 'defer',
    watch: [locale],
  })
}
