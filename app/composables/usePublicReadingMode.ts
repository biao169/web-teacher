import { computed } from 'vue'

export type PublicReadingMode = 'standard' | 'comfortable' | 'large'
export const PUBLIC_READING_COOKIE = 'academic-cms-reading'

export function normalizePublicReadingMode(value: unknown): PublicReadingMode {
  return value === 'comfortable' || value === 'large' ? value : 'standard'
}

/** One SSR-readable preference, owned by the layout and passed to its controls. */
export function usePublicReadingMode() {
  const preference = useCookie<unknown>(PUBLIC_READING_COOKIE, {
    path: '/', sameSite: 'lax', maxAge: 365 * 24 * 60 * 60,
    secure: useRequestURL().protocol === 'https:',
  })
  return computed<PublicReadingMode>({
    get: () => normalizePublicReadingMode(preference.value),
    set: value => { preference.value = normalizePublicReadingMode(value) },
  })
}
