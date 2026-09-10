import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { PublicShellViewModel, PublicSiteLocale } from '~~/shared/contracts/public-site'

/** Header and footer keep the same data source when navigating between home and modules. */
export function usePublicLayoutModel(
  localeInput: MaybeRefOrGetter<PublicSiteLocale>,
) {
  const locale = computed<PublicSiteLocale>(() => toValue(localeInput) === 'en' ? 'en' : 'zh')
  const endpoint = computed(() => `/api/v1/public/shell?locale=${locale.value}`)
  const key = computed(() => `public-shell:v1:${locale.value}`)
  return useFetch<PublicShellViewModel>(endpoint, {
    key,
    server: true,
    lazy: false,
    dedupe: 'defer',
    watch: [locale],
  })
}
