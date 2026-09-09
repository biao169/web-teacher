import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { PublicPageMeta } from '~~/shared/contracts/public-content'
import type { PublicShellViewModel } from '~~/shared/contracts/public-site'

import { configuredPublicOrigin, publicAbsoluteUrl, publicPageRobots, publicSeoLinks } from '~~/shared/utils/public-seo'

function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</gu, '\\u003c')
    .replace(/>/gu, '\\u003e')
    .replace(/&/gu, '\\u0026')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029')
}

export function usePublicContentSeo(
  metaInput: MaybeRefOrGetter<PublicPageMeta>,
  shellInput?: MaybeRefOrGetter<PublicShellViewModel | null | undefined>,
): void {
  const runtime = useRuntimeConfig()
  const origin = configuredPublicOrigin(runtime.public.siteUrl)
  const meta = computed(() => toValue(metaInput))
  const { data: zhShell } = useNuxtData<PublicShellViewModel>('public-shell:v1:zh')
  const { data: enShell } = useNuxtData<PublicShellViewModel>('public-shell:v1:en')
  const shell = computed(() => toValue(shellInput) ?? (meta.value.path.startsWith('/en') ? enShell.value : zhShell.value) ?? null)
  const siteName = computed(() => shell.value?.site.name ?? runtime.public.siteName)
  const title = computed(() => siteName.value && meta.value.title !== siteName.value ? `${meta.value.title} · ${siteName.value}` : meta.value.title)
  const image = computed(() => meta.value.image?.available ? meta.value.image : shell.value?.site.openGraphImage.available ? shell.value.site.openGraphImage : null)
  const imageUrl = computed(() => {
    const selected = image.value
    if (!selected?.available) return null
    if (selected.url.startsWith('https://')) return selected.url
    return origin ? publicAbsoluteUrl(origin, selected.url) : null
  })

  useSeoMeta({
    title: () => title.value,
    description: () => meta.value.description,
    robots: () => publicPageRobots(meta.value.path),
    ogLocale: () => meta.value.path.startsWith('/en') ? 'en_US' : 'zh_CN',
    ogLocaleAlternate: () => meta.value.path.startsWith('/en') ? ['zh_CN'] : ['en_US'],
    ogType: () => meta.value.type,
    ogTitle: () => title.value,
    ogDescription: () => meta.value.description,
    ogSiteName: () => siteName.value,
    ogUrl: () => origin ? publicAbsoluteUrl(origin, meta.value.path) || undefined : undefined,
    ogImage: () => imageUrl.value || undefined,
    ogImageAlt: () => imageUrl.value && image.value?.available ? image.value.alt || meta.value.title : undefined,
    twitterCard: () => imageUrl.value ? 'summary_large_image' : 'summary',
    twitterTitle: () => title.value,
    twitterDescription: () => meta.value.description,
    twitterImage: () => imageUrl.value || undefined,
  })

  const breadcrumbJson = computed(() => safeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: meta.value.breadcrumbs.map((item, index) => ({
      '@type': 'ListItem', position: index + 1, name: item.label, item: publicAbsoluteUrl(origin, item.href),
    })),
  }))

  // Canonical is blocked by useHeadSafe; only validated, generated links use useHead.
  useHead(() => ({ link: publicSeoLinks(origin, meta.value.path, meta.value.alternatePath) }))
  useHeadSafe(() => {
    const value = meta.value
    return {
      script: origin && value.breadcrumbs.length > 1 ? [{ type: 'application/ld+json', textContent: breadcrumbJson.value }] : [],
    }
  })
}
