import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { PublicHomeViewModel } from '~~/shared/contracts/public-site'

import { configuredPublicOrigin, publicAbsoluteUrl, publicSeoLinks } from '~~/shared/utils/public-seo'

export function usePublicSeo(modelInput: MaybeRefOrGetter<PublicHomeViewModel>): void {
  const model = computed(() => toValue(modelInput))
  const runtime = useRuntimeConfig()
  const origin = configuredPublicOrigin(runtime.public.siteUrl)
  const canonical = computed(() => publicAbsoluteUrl(origin, model.value.homePath))
  const image = computed(() => model.value.site.openGraphImage.available
    ? publicAbsoluteUrl(origin, model.value.site.openGraphImage.url) : null)
  const favicon = computed(() => model.value.site.favicon.available ? model.value.site.favicon.url : null)

  useSeoMeta({
    title: () => model.value.site.seoTitle,
    description: () => model.value.site.seoDescription,
    robots: 'index,follow,max-image-preview:large',
    ogType: 'website',
    ogTitle: () => model.value.site.seoTitle,
    ogDescription: () => model.value.site.seoDescription,
    ogSiteName: () => model.value.site.name,
    ogLocale: () => model.value.locale === 'zh' ? 'zh_CN' : 'en_US',
    ogLocaleAlternate: () => model.value.locale === 'zh' ? ['en_US'] : ['zh_CN'],
    ogUrl: () => canonical.value || undefined,
    ogImage: () => image.value || undefined,
    ogImageAlt: () => image.value ? model.value.site.openGraphImage.alt || model.value.site.name : undefined,
    twitterCard: () => image.value ? 'summary_large_image' : 'summary',
    twitterTitle: () => model.value.site.seoTitle,
    twitterDescription: () => model.value.site.seoDescription,
    twitterImage: () => image.value || undefined,
  })

  // useHeadSafe deliberately drops canonical links. These links are generated
  // from the validated deployment origin and application-owned public routes.
  useHead(() => ({ link: publicSeoLinks(origin, model.value.homePath, model.value.alternatePath) }))
  useHeadSafe(() => ({
    meta: model.value.site.keywords.length
      ? [{ name: 'keywords', content: model.value.site.keywords.join(', ') }] : [],
    link: [
      ...(favicon.value ? [{ rel: 'icon', href: favicon.value }] : []),
    ],
  }))
}
