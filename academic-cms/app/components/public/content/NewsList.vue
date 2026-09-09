<script setup lang="ts">
import NewsRows from './NewsRows.vue'
import type { PublicNewsListViewModel } from '~~/shared/contracts/public-content'
defineProps<{ model: PublicNewsListViewModel }>()
</script>
<template>
  <PublicContentListFrame :model="model" :empty-title="model.locale === 'zh' ? '暂无动态' : 'No news'">
    <template #default="{ items }">
    <NewsRows :items="items" :locale="model.locale" :revision="model.generatedAt" />
    </template>
  </PublicContentListFrame>
</template>
