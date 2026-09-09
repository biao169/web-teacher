<script setup lang="ts">
import { computed, useRoute, useRuntimeConfig } from '#imports'
const props = defineProps<{ locale: 'zh' | 'en'; navigation: readonly { href: string; external: boolean }[] }>()
const route = useRoute()
const show = computed(() => {
  const settings = useRuntimeConfig().public.fileTransfer as { navigation?: boolean } | undefined
  return settings?.navigation !== false && !props.navigation.some((item: { href: string; external: boolean }) => !item.external && /^\/(?:zh|en)\/transfer\/?(?:[?#]|$)/u.test(item.href))
})
const current = computed(() => /^\/(?:zh|en)\/transfer\/?$/u.test(route.path))
</script>
<template><NuxtLink v-if="show" class="public-navigation-link public-navigation-link--default" :class="{ 'is-current': current }" :to="`/${locale}/transfer`" :aria-current="current ? 'page' : undefined">{{ locale === 'zh' ? '文件快传' : 'File transfer' }}</NuxtLink></template>
