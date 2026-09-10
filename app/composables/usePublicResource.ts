import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { PublicSiteLocale } from '~~/shared/contracts/public-site'

function queryString(locale: PublicSiteLocale, query: Readonly<Record<string, unknown>>): string {
  const parameters = new URLSearchParams({ locale })
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) for (const item of value) parameters.append(key, String(item))
    else parameters.set(key, String(value))
  }
  return parameters.toString()
}

export function usePublicListResource<T>(module: string, locale: PublicSiteLocale) {
  const route = useRoute()
  const endpoint = computed(() => `/api/v1/public/${module}?${queryString(locale, route.query)}`)
  const key = computed(() => `public-list:v1:${module}:${locale}:${endpoint.value}`)
  return useFetch<T>(endpoint, { key, server: true, lazy: false, dedupe: 'cancel', retry: 0, watch: [endpoint] })
}

export function usePublicDetailResource<T>(module: string, identifierInput: MaybeRefOrGetter<string>, locale: PublicSiteLocale) {
  const identifier = computed(() => toValue(identifierInput))
  const endpoint = computed(() => `/api/v1/public/${module}/${encodeURIComponent(identifier.value)}?locale=${locale}`)
  const key = computed(() => `public-detail:v1:${module}:${locale}:${identifier.value}`)
  return useFetch<T>(endpoint, {
    key,
    server: true,
    lazy: false,
    dedupe: 'cancel', retry: 0,
    watch: [endpoint],
  })
}

export function usePublicResearchResource<T>(locale: PublicSiteLocale) {
  return usePublicListResource<T>('research', locale)
}

type PublicAsyncValue<T> = { value: T | null | undefined }
type PublicAsyncError = { value: unknown }

function publicPageValue<T>(data: PublicAsyncValue<T>, error: PublicAsyncError): T {
  if (error.value) {
    const statusCode = typeof error.value === 'object' && error.value && 'statusCode' in error.value
      ? Number((error.value as { statusCode?: unknown }).statusCode) || 503
      : 503
    throw createError({
      statusCode: [400, 404, 429].includes(statusCode) ? statusCode : 503,
      message: statusCode === 404 ? 'Public content was not found' : statusCode === 400 ? 'Invalid public request' : 'Public site data is temporarily unavailable',
    })
  }
  if (!data.value) throw createError({ statusCode: 503, message: 'Public site data is temporarily unavailable' })
  return data.value
}

export function useRequiredPublicPage<T>(data: PublicAsyncValue<T>, error: PublicAsyncError) {
  return computed<T>(() => publicPageValue(data, error))
}
