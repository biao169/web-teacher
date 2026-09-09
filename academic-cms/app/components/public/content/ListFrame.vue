<script setup lang="ts" generic="T extends { uid: string; title?: string | null; name?: string }">
import type { PublicListViewModel } from '~~/shared/contracts/public-content'
import { provide, computed } from 'vue'
import { PUBLIC_LIST_RETURN_CONTEXT } from '~/composables/usePublicListReturn'
import { PUBLIC_SELECTION_CONTEXT, usePublicSelection } from '~/composables/usePublicSelection'
import SelectionToolbar from './SelectionToolbar.vue'
import LoadMore from './LoadMore.vue'
import { usePublicInfiniteList } from '~/composables/usePublicInfiniteList'
const props = defineProps<{ model: PublicListViewModel<T>; emptyTitle: string; presentation?: 'cards' | 'tags' }>()
const feed = usePublicInfiniteList(() => props.model)
const selection = usePublicSelection(feed.displayModel)
provide(PUBLIC_SELECTION_CONTEXT, selection)
provide(PUBLIC_LIST_RETURN_CONTEXT, computed(() => new Map(feed.pages.value.flatMap(page => page.items.map(item => [item.uid, page.meta.path + '#results'] as const)))))
</script>
<template>
  <div>
    <PublicContentPageHero :meta="model.meta" :locale="model.locale" compact />
    <section class="public-content-section public-content-section--list"><div class="public-container public-list-layout">
      <PublicContentFilterPanel :locale="model.locale" :query="model.query" :filters="model.filters" :page-size="model.pagination.pageSize" />
      <PublicContentResultSummary :model="feed.displayModel.value.pagination" :total-public="model.totalPublic" :locale="model.locale" />
      <slot name="before-selection" />
      <SelectionToolbar v-if="selection.enabled.value" :locale="model.locale" :page-count="feed.items.value.length" loaded />
      <div v-if="feed.items.value.length" id="results" class="public-compact-list" :class="{ 'public-research-tags': presentation === 'tags' }"><slot :items="feed.items.value" :pages="feed.pages.value" /></div>
      <PublicEmptyState v-else :title="emptyTitle" :description="model.locale === 'zh' ? '调整关键词或清除筛选后再试。' : 'Try another keyword or clear the filters.'" />
      <LoadMore :locale="model.locale" :has-more="Boolean(feed.nextPage.value)" :loading="feed.loading.value" :suspended="feed.suspended.value" :failure="feed.failure.value" :next-href="feed.nextHref.value" :count="feed.items.value.length" @load="feed.loadNext" />
    </div></section>
  </div>
</template>
