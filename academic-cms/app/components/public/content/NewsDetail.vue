<script setup lang="ts">
import NewsMessages from '../contact/NewsMessages.vue'
import ContentBlocks from './ContentBlocks.vue'
import { CalendarDays, Link2 } from '@lucide/vue'
import type { PublicNewsDetailViewModel } from '~~/shared/contracts/public-content'
import { mediaCategoryFallback } from '~/utils/media-fallback'
defineProps<{ model: PublicNewsDetailViewModel }>()
</script>
<template><div><PublicContentPageHero :meta="model.meta" :locale="model.locale" hide-description /><article class="public-content-section"><div class="public-container public-article-layout"><header class="public-article-meta"><PublicUiBadge v-if="model.item.category" tone="accent">{{ model.item.category }}</PublicUiBadge><time :datetime="model.item.publishedAt"><CalendarDays :size="16" aria-hidden="true" />{{ model.item.publishedLabel }}</time></header><PublicMediaImage v-if="model.item.cover.available" class="public-article-cover" :media="model.item.cover" :initials="model.item.title" :fallback-text="mediaCategoryFallback(model.item.category) || (model.locale === 'zh' ? '动态' : 'News')" aspect="landscape" eager priority /><ContentBlocks :blocks="model.item.blocks" :locale="model.locale" /><aside v-if="model.item.related.length" class="public-related-links"><h2><Link2 :size="19" aria-hidden="true" />{{ model.locale === 'zh' ? '相关内容' : 'Related content' }}</h2><NuxtLink v-for="link in model.item.related" :key="`${link.kind}:${link.href}`" :to="link.href">{{ link.label }}</NuxtLink></aside><NewsMessages v-if="model.item.commentsEnabled" :key="`${model.locale}:${model.item.uid}`" :locale="model.locale" :news="model.item" /></div></article></div></template>
