<script setup lang="ts">
import { ArrowUpRight } from '@lucide/vue'

withDefaults(defineProps<{
  href: string
  external?: boolean
  showExternalIcon?: boolean
}>(), {
  external: false,
  showExternalIcon: false,
})

defineOptions({ inheritAttrs: false })
const route = useRoute()
const newWindowLabel = computed(() => route.path.startsWith('/en')
  ? '(opens in a new window)'
  : '（在新窗口打开）')
</script>

<template>
  <a
    v-if="external"
    v-bind="$attrs"
    :href="href"
    target="_blank"
    rel="noopener noreferrer external"
  >
    <slot />
    <ArrowUpRight v-if="showExternalIcon" class="public-inline-icon" :size="15" aria-hidden="true" />
    <span class="public-sr-only">{{ newWindowLabel }}</span>
  </a>
  <NuxtLink v-else v-bind="$attrs" :to="href">
    <slot />
  </NuxtLink>
</template>
