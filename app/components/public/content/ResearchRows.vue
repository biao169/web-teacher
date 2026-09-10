<script setup lang="ts">
import ResearchTag from './ResearchTag.vue'
import type { PublicResearchItem, PublicNumberedRecord } from '~~/shared/contracts/public-content'
defineProps<{ items: Array<PublicResearchItem & PublicNumberedRecord>; locale: 'zh' | 'en' }>()
</script>
<template>
  <ResearchTag v-for="item in items" :key="item.uid" :item="item" :locale="locale" />
</template>
