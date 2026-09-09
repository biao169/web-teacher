<script setup lang="ts">
import type { PublicPagination } from '~~/shared/contracts/public-content'
defineProps<{ model: PublicPagination; totalPublic?: number; locale: 'zh' | 'en' }>()
</script>
<template>
  <p class="public-result-summary" aria-live="polite">
    <span v-if="totalPublic !== undefined">{{ locale === 'zh' ? `全部公开 ${totalPublic} 项 · 符合筛选 ${model.totalItems} 项 · ` : `${totalPublic} public · ${model.totalItems} matches · ` }}</span>
    <template v-if="model.totalItems">{{ locale === 'zh' ? `当前显示第 ${model.from}–${model.to} 项` : `Showing ${model.from}–${model.to}` }}</template>
    <template v-else>{{ locale === 'zh' ? '没有匹配内容' : 'No matching content' }}</template>
  </p>
</template>
