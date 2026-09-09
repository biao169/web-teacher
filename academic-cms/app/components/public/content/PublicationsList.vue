<script setup lang="ts">
import type { PublicPublicationListViewModel } from '~~/shared/contracts/public-content'
import type { PublicCitationPage } from '~~/shared/contracts/public-citation'
import CitationStyleControl from './CitationStyleControl.vue'
import PublicationRows from './PublicationRows.vue'
defineProps<{ model: PublicPublicationListViewModel; citations?: PublicCitationPage | null | undefined; citationStatus: string; citationError: boolean }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <PublicContentListFrame :model="model" :empty-title="model.locale === 'zh' ? '暂无论文' : 'No publications'">
    <template #before-selection><CitationStyleControl :locale="model.locale" /></template>
    <template #default="{ pages }">
      <PublicationRows v-for="(page, index) in pages" :key="page.meta.path" :model="page" :initial="index === 0" :citations="index === 0 ? citations : undefined" :citation-status="citationStatus" :citation-error="citationError" @retry="$emit('retry')" />
    </template>
  </PublicContentListFrame>
</template>
