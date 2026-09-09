<script setup lang="ts">
import type { PublicNewsSummary, PublicNumberedRecord } from '~~/shared/contracts/public-content'
import { mediaCategoryFallback } from '~/utils/media-fallback'
import { splitPublicCategories } from '~~/shared/utils/public-categories'
defineProps<{ items: Array<PublicNewsSummary & PublicNumberedRecord>; locale: 'zh' | 'en'; revision?: string }>()
</script>
<template>
    <PublicContentRecordRow v-for="item in items" :key="item.uid" class="public-news-card" :uid="item.uid" :display-number="item.displayNumber" :title="item.title" :href="item.href" :metadata="[item.publishedLabel]" :tags="splitPublicCategories(item.category)" v-bind="item.cover.available ? { media: item.cover } : {}" :media-fallback="mediaCategoryFallback(item.category) || (locale === 'zh' ? '动态' : 'News')" />
</template>
