import { describe, expect, it, vi } from 'vitest'
import { computed, effectScope, reactive, ref, toValue } from 'vue'
import { usePublicLayoutModel } from '../../app/composables/usePublicLayoutModel'

const state = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('#app/composables/fetch', () => ({ useFetch: (...args: unknown[]) => state.fetch(...args) }))

describe('public shell route lifetime', () => {
  it('keeps the shell request and data through home, list, filter and detail transitions; locale owns the cache key', () => {
    const scope = effectScope()
    const route = reactive({ path: '/zh' })
    const response = { data: ref({ locale: 'zh', navigation: { header: ['patents'] } }) }
    state.fetch.mockReturnValue(response)
    try {
      scope.run(() => {
        const locale = computed(() => route.path.startsWith('/en') ? 'en' as const : 'zh' as const)
        const result = usePublicLayoutModel(locale)
        const [endpoint, options] = state.fetch.mock.calls.at(-1)!
        for (const path of ['/zh', '/zh/patents', '/zh/patents?year=2026', '/zh/patents/example', '/zh']) {
          route.path = path
          expect(toValue(endpoint)).toBe('/api/v1/public/shell?locale=zh')
          expect(toValue(options.key)).toBe('public-shell:v1:zh')
          expect(result.data).toBe(response.data)
          expect(result.data.value?.navigation.header).toEqual(['patents'])
        }
        route.path = '/en/patents'
        expect(toValue(endpoint)).toBe('/api/v1/public/shell?locale=en')
        expect(toValue(options.key)).toBe('public-shell:v1:en')
      })
    } finally { scope.stop() }
  })
})
