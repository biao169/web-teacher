<script setup lang="ts">
import type { PublicSiteLink } from '~~/shared/contracts/public-site'
import { normalizePublicListHref } from '~~/shared/utils/public-list-link'
import { safePublicReturn } from '~~/shared/utils/public-detail-link'
import SmartLink from './SmartLink.vue'

const props = defineProps<{ link: PublicSiteLink }>()
const route = useRoute()
// A header contact entry follows the same resting/current states as its peers.
const displayStyle = computed(() => {
  if (props.link.location === 'header' && !props.link.external) {
    try {
      if (/^\/(?:zh|en)\/contact\/?$/u.test(new URL(props.link.href, 'https://public.invalid').pathname)) return 'default'
    } catch { /* Invalid links are handled by SmartLink. */ }
  }
  return props.link.style
})
const current = computed(() => {
  if (props.link.external) return false
  try {
    const target = new URL(props.link.href, 'https://public.invalid')
    const from = safePublicReturn(route.path, route.query?.from)
    const origin = from ? new URL(from, 'https://public.invalid') : null
    const nav = route.query?.nav ?? origin?.searchParams.get('nav')
    if (nav) return nav === props.link.uid && (origin?.pathname ?? route.path) === target.pathname
    if (target.search || target.hash) return normalizePublicListHref(route.fullPath) === normalizePublicListHref(props.link.href)
    const pathname = target.pathname.replace(/\/$/u, '') || '/'
    const currentPath = route.path.replace(/\/$/u, '') || '/'
    return currentPath === pathname || (!['/', '/zh', '/en'].includes(pathname) && currentPath.startsWith(`${pathname}/`))
  } catch {
    // Invalid visitor query parameters must not prevent the shared header from rendering.
    return false
  }
})
</script>

<template>
  <SmartLink class="public-navigation-link" :class="[`public-navigation-link--${displayStyle}`, { 'is-current': current }]" :href="link.href" :external="link.external" :show-external-icon="link.external" :aria-current="current ? 'page' : undefined">
    {{ link.label }}
  </SmartLink>
</template>
