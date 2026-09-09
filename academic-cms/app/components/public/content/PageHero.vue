<script setup lang="ts">
import { publicDetailList } from '~~/shared/utils/public-detail-link'
import DetailReturn from './DetailReturn.vue'
import type { PublicPageMeta } from '~~/shared/contracts/public-content'

defineProps<{ meta: PublicPageMeta; locale: 'zh' | 'en'; eyebrow?: string; hideDescription?: boolean; compact?: boolean }>()
</script>

<template>
  <header class="public-page-hero" :class="{ 'public-page-hero--compact': compact }">
    <div class="public-container public-page-hero__inner">
      <DetailReturn v-if="publicDetailList(meta.path)" :path="meta.path" :locale="locale" />
      <PublicContentBreadcrumbs :items="meta.breadcrumbs" :label="locale === 'zh' ? '面包屑导航' : 'Breadcrumbs'" />
      <p v-if="eyebrow && !compact" class="public-eyebrow">{{ eyebrow }}</p>
      <h1 :class="{ 'public-sr-only': compact }">{{ meta.title }}</h1>
      <p v-if="meta.description && !hideDescription && !compact" class="public-page-hero__description">{{ meta.description }}</p>
      <div v-if="$slots.actions" class="public-actions"><slot name="actions" /></div>
    </div>
  </header>
</template>
