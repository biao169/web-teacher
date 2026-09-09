<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
const props = defineProps<{ locale: 'zh' | 'en'; hasMore: boolean; loading: boolean; suspended: boolean; failure: 'network' | 'changed' | 'limit' | null; nextHref: string; count: number }>()
const emit = defineEmits<{ load: [] }>()
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | undefined
const allowed = () => props.hasMore && !props.loading && !props.suspended && !props.failure
function requestVisible() {
  if (!allowed() || !sentinel.value) return
  const rect = sentinel.value.getBoundingClientRect()
  if (rect.top <= window.innerHeight && rect.bottom >= 0) emit('load')
}
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting) && allowed()) emit('load') }, { rootMargin: '0px', threshold: 0 })
  if (sentinel.value) observer.observe(sentinel.value)
})
watch(() => [props.count, props.loading], async () => { await nextTick(); if (observer) requestVisible() })
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <div ref="sentinel" class="public-load-more" :aria-busy="loading">
    <p v-if="loading" role="status">{{ locale === 'zh' ? '正在加载下一页…' : 'Loading the next page…' }}</p>
    <p v-else-if="failure === 'changed'" role="alert">{{ locale === 'zh' ? '内容已更新，请重新加载列表，避免编号和条目混排。' : 'Content has changed. Reload the list to keep items and numbers consistent.' }} <button type="button" @click="reloadNuxtApp()">{{ locale === 'zh' ? '重新加载' : 'Reload' }}</button></p>
    <p v-else-if="failure === 'limit'" role="status">{{ locale === 'zh' ? '结果较多，请使用筛选缩小范围后继续浏览。' : 'There are many results. Narrow the filters to continue browsing.' }}</p>
    <p v-else-if="failure" role="alert">{{ locale === 'zh' ? '下一页加载失败，已显示的内容仍然保留。' : 'The next page could not load. Your current items are still here.' }}</p>
    <button v-if="hasMore && failure !== 'changed' && failure !== 'limit'" type="button" :disabled="loading || suspended" @click="emit('load')">{{ locale === 'zh' ? (failure ? '重试加载' : '加载更多') : (failure ? 'Retry' : 'Load more') }}</button>
    <p v-else-if="!hasMore && count" role="status">{{ locale === 'zh' ? '已加载全部匹配内容' : 'All matching items loaded' }}</p>
    <noscript><a v-if="hasMore" :href="nextHref" rel="next">{{ locale === 'zh' ? '下一页' : 'Next page' }}</a></noscript>
  </div>
</template>
