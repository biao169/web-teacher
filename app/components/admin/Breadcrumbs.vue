<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import type { AdminBreadcrumbItem } from '~~/shared/admin/registry'
defineProps<{ items: readonly AdminBreadcrumbItem[] }>()
</script>
<template><nav class="admin-breadcrumbs" aria-label="面包屑"><ol><li v-for="(item,index) in items" :key="`${item.label}:${index}`"><ChevronRight v-if="index" :size="13" aria-hidden="true" /><NuxtLink v-if="item.to" :to="item.to">{{ item.label }}</NuxtLink><span v-else aria-current="page">{{ item.label }}</span></li></ol></nav></template>
