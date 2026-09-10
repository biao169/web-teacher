<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { PublicNewsDetailViewModel } from '~~/shared/contracts/public-content'
import ContentBlocks from './ContentBlocks.vue'
const props = defineProps<{ slug: string; locale: 'zh' | 'en'; revision?: string | undefined }>()
const root = ref<HTMLElement | null>(null)
const model = shallowRef<PublicNewsDetailViewModel | null>(null)
const loading = ref(false), failed = ref(false)
let observer: IntersectionObserver | null = null, controller: AbortController | null = null, generation = 0
let mounted = false
function cancel() { generation++; controller?.abort(); controller = null; loading.value = false }
async function load() {
  if (loading.value || model.value) return
  const current = generation
  controller = new AbortController(); loading.value = true; failed.value = false
  try {
    const value = await $fetch<PublicNewsDetailViewModel>(`/api/v1/public/news/${encodeURIComponent(props.slug)}`, {
      query: { locale: props.locale }, signal: controller.signal, timeout: 15000,
    })
    if (current !== generation) return
    if (value.module !== 'news' || value.locale !== props.locale || value.item.slug !== props.slug || !Array.isArray(value.item.blocks)) throw new Error('Invalid news body')
    model.value = value
    observer?.disconnect()
  } catch { if (current === generation) failed.value = true }
  finally { if (current === generation) { loading.value = false; controller = null } }
}
function observe() {
  observer?.disconnect()
  if (!root.value) return
  if (typeof IntersectionObserver === 'undefined') { void load(); return }
  observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting) && !failed.value) void load() }, { rootMargin: '240px' })
  observer.observe(root.value)
}
onMounted(() => { mounted = true; observe() })
watch(() => [props.slug, props.locale, props.revision], () => { cancel(); model.value = null; failed.value = false; if (mounted) observe() })
onBeforeUnmount(() => { mounted = false; cancel(); observer?.disconnect() })
</script>
<template>
  <div ref="root" class="public-news-body" :aria-busy="loading">
    <ContentBlocks v-if="model" :blocks="model.item.blocks" />
    <p v-else-if="failed" role="alert">{{ locale === 'zh' ? '正文暂未加载。' : 'The article could not be loaded.' }} <button type="button" @click="load">{{ locale === 'zh' ? '重试' : 'Retry' }}</button></p>
    <p v-else class="public-news-body__status" role="status">{{ locale === 'zh' ? '正在准备正文…' : 'Preparing the article…' }}</p>
  </div>
</template>
<style scoped>
.public-news-body{min-height:2rem;padding-top:.7rem}.public-news-body__status{font-size:.85em;color:var(--public-muted)}
.public-news-body button{padding:.3rem .6rem;color:var(--public-accent-strong);background:var(--public-accent-soft);border-radius:.4rem}
</style>
