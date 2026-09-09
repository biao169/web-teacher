<script setup lang="ts">
import ResearchRows from './ResearchRows.vue'
import type { PublicResearchViewModel } from '~~/shared/contracts/public-content'

defineProps<{ model: PublicResearchViewModel }>()
</script>
<template>
  <PublicContentListFrame presentation="tags" :model="model" :empty-title="model.locale === 'zh' ? '暂无研究方向' : 'No research interests'">
    <template #default="{ items }">
    <ResearchRows :items="items" :locale="model.locale" />
    </template>
  </PublicContentListFrame>
</template>
