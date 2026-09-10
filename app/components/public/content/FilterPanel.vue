<script setup lang="ts">
import { RotateCcw, Search } from '@lucide/vue'
import type { PublicFilterGroup, PublicListQueryView, PublicPageSize } from '~~/shared/contracts/public-content'
import { publicListHref } from '~~/shared/utils/public-list-link'

const props = defineProps<{
  locale: 'zh' | 'en'
  query: PublicListQueryView
  filters: PublicFilterGroup[]
  pageSize: PublicPageSize
}>()
const route = useRoute()
const router = useRouter()
const search = ref(props.query.search ?? '')
const searchError = ref('')
const activeFilter = ref<string | null>(null)
function toggleFilter(key: string, value: boolean) {
  if (value) activeFilter.value = key
  else if (activeFilter.value === key) activeFilter.value = null
}
watch(() => route.fullPath, () => { activeFilter.value = null })
watch(() => [props.query.search, props.query.filters, props.filters], () => {
  search.value = props.query.search ?? ''; searchError.value = ''
}, { immediate: true })
const resetTarget = computed(() => publicListHref(route.path, { ...props.query.scope?.filters, nav: props.query.scope?.uid, pageSize: props.pageSize }, {}, route.hash))
const visibleFilters = computed(() => props.filters.filter(group => !Object.hasOwn(props.query.scope?.filters ?? {}, group.key)))
const changed = computed(() => Boolean(props.query.search) || Object.keys(props.query.filters).some(key => !Object.hasOwn(props.query.scope?.filters ?? {}, key)))

function target(key: string, value: string | null): string {
  return publicListHref(route.path, route.query, { [key]: value, page: null }, route.hash)
}
async function submit(): Promise<void> {
  searchError.value = ''
  try { await router.push(target('q', search.value.trim() || null)) }
  catch { searchError.value = props.locale === 'zh' ? '关键词过长或含无效字符，请缩短后重试。' : 'The search is too long or contains invalid characters. Please shorten it.' }
}
async function changePageSize(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value
  await router.push(target('pageSize', value === '12' ? null : value))
}
</script>

<template>
  <section class="public-filter-panel public-filter-toolbar" :aria-label="locale === 'zh' ? '搜索与筛选' : 'Search and filters'">
    <form class="public-search" role="search" @submit.prevent="submit">
      <label class="public-sr-only" for="public-list-search">{{ locale === 'zh' ? '搜索内容' : 'Search content' }}</label>
      <Search :size="18" aria-hidden="true" />
      <input id="public-list-search" v-model="search" type="search" maxlength="256" :aria-invalid="!!searchError" :aria-describedby="searchError ? 'public-search-error' : undefined" :placeholder="query.scope ? (locale === 'zh' ? '在当前范围内搜索' : 'Search within this collection') : (locale === 'zh' ? '输入关键词' : 'Enter keywords')">
      <button type="submit">{{ locale === 'zh' ? '搜索' : 'Search' }}</button>
    </form>
    <p v-if="searchError" id="public-search-error" role="alert">{{ searchError }}</p>

    <PublicContentFilterGroup v-for="group in visibleFilters" :key="group.key" :group="group" :locale="locale"
      :open="activeFilter === group.key" @update:open="toggleFilter(group.key, $event)" />
    <button type="button" class="public-filter-reset" :disabled="!changed" @click="router.push(resetTarget)">
      <RotateCcw :size="15" aria-hidden="true" />{{ locale === 'zh' ? '重置' : 'Reset' }}
    </button>
    <label class="public-page-size">
      <span>{{ locale === 'zh' ? '每页' : 'Per page' }}</span>
      <select :value="pageSize" @change="changePageSize">
        <option value="12">12</option><option value="24">24</option><option value="36">36</option>
      </select>
    </label>
  </section>
</template>
