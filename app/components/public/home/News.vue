<script setup lang="ts">
import type { PublicHomeViewModel } from '~~/shared/contracts/public-site'
import RecordGroup from './RecordGroup.vue'
import NewsRows from '../content/NewsRows.vue'
defineProps<{ model: PublicHomeViewModel }>()
</script>
<template><section v-if="model.news.length" id="news" class="public-section public-home-section" aria-labelledby="home-news-title"><div class="public-container">
  <PublicSectionHeading id="home-news-title" :title="model.locale === 'zh' ? '最新动态' : 'Latest news'"><template #action><NuxtLink class="public-text-link" :to="`/${model.locale}/news`">{{ model.locale === 'zh' ? '查看全部' : 'View all' }}</NuxtLink></template></PublicSectionHeading>
  <RecordGroup module="news" :locale="model.locale" :revision="model.generatedAt" :items="model.news"><NewsRows :items="model.news" :locale="model.locale" :revision="model.generatedAt" /></RecordGroup>
</div></section></template>
