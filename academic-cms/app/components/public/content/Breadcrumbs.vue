<script setup lang="ts">
import { ChevronRight, Home } from '@lucide/vue'
import type { PublicBreadcrumb } from '~~/shared/contracts/public-content'

defineProps<{ items: PublicBreadcrumb[]; label: string }>()
</script>

<template>
  <nav v-if="items.length" class="public-breadcrumbs" :aria-label="label">
    <ol>
      <li v-for="(item, index) in items" :key="`${item.href}:${index}`">
        <Home v-if="index === 0" :size="14" aria-hidden="true" />
        <ChevronRight v-else :size="14" aria-hidden="true" />
        <NuxtLink v-if="index < items.length - 1" :to="item.href">{{ item.label }}</NuxtLink>
        <span v-else aria-current="page">{{ item.label }}</span>
      </li>
    </ol>
  </nav>
</template>
