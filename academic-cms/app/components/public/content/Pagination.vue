<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import type { PublicPagination } from '~~/shared/contracts/public-content'
import { publicListHref } from '~~/shared/utils/public-list-link'

const props = defineProps<{ model: PublicPagination; locale: 'zh' | 'en' }>()
const route = useRoute()
function pageTarget(page: number | null) {
  return publicListHref(route.path, route.query, { page: page && page > 1 ? page : null }, route.hash)
}
const pages = computed(() => {
  const total = props.model.totalPages
  const current = props.model.page
  const values = new Set<number>([1, total, current - 2, current - 1, current, current + 1, current + 2])
  return [...values].filter(value => value >= 1 && value <= total).sort((a, b) => a - b)
})
</script>

<template>
  <nav v-if="model.totalPages > 1" class="public-pagination" :aria-label="locale === 'zh' ? '分页导航' : 'Pagination'">
    <NuxtLink v-if="model.previousPage" class="public-pagination__direction" :to="pageTarget(model.previousPage)" rel="prev">
      <ChevronLeft :size="17" aria-hidden="true" />{{ locale === 'zh' ? '上一页' : 'Previous' }}
    </NuxtLink><span v-else class="public-pagination__direction is-disabled" aria-disabled="true"><ChevronLeft :size="17" aria-hidden="true" />{{ locale === 'zh' ? '上一页' : 'Previous' }}</span>
    <ol class="public-pagination__pages">
      <li v-for="(page, index) in pages" :key="page">
        <span v-if="index > 0 && page - pages[index - 1]! > 1" class="public-pagination__ellipsis" aria-hidden="true">…</span>
        <NuxtLink :to="pageTarget(page)" :aria-current="page === model.page ? 'page' : undefined" :class="{ 'is-current': page === model.page }">{{ page }}</NuxtLink>
      </li>
    </ol>
    <NuxtLink v-if="model.nextPage" class="public-pagination__direction" :to="pageTarget(model.nextPage)" rel="next">
      {{ locale === 'zh' ? '下一页' : 'Next' }}<ChevronRight :size="17" aria-hidden="true" />
    </NuxtLink><span v-else class="public-pagination__direction is-disabled" aria-disabled="true">{{ locale === 'zh' ? '下一页' : 'Next' }}<ChevronRight :size="17" aria-hidden="true" /></span>
  </nav>
</template>
