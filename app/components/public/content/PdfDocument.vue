<script setup lang="ts">
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from '~/utils/pdf-document'
import { openPdfDocument } from '~/utils/pdf-document'
import PdfPage from './PdfPage.vue'
const props = withDefaults(defineProps<{ src: string; title?: string; locale?: 'zh' | 'en' }>(), { title: '', locale: 'zh' })
const root = ref<HTMLElement | null>(null)
const sentinel = ref<HTMLElement | null>(null)
const document = shallowRef<PDFDocumentProxy | null>(null)
const visiblePages = ref(1)
const loading = ref(false)
const error = ref(false)
let task: PDFDocumentLoadingTask | undefined
let observer: IntersectionObserver | undefined
let bottomObserver: IntersectionObserver | undefined
let generation = 0
let lastReady = 0
let active = false
const autoPages = ref(false)
const label = computed(() => props.title || (props.locale === 'zh' ? 'PDF 正文' : 'PDF document'))
function observeBottom() {
  bottomObserver?.disconnect()
  if (!sentinel.value || !document.value || visiblePages.value >= document.value.numPages || lastReady < visiblePages.value) return
  bottomObserver = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting) || lastReady < visiblePages.value) return
    bottomObserver?.disconnect()
    visiblePages.value++
  }, { rootMargin: '240px 0px' })
  bottomObserver.observe(sentinel.value)
}
async function pageReady(page: number) { lastReady = Math.max(lastReady, page); await nextTick(); if (active) observeBottom() }
async function load() {
  if (loading.value || document.value) return
  const request = ++generation
  loading.value = true; error.value = false
  try {
    const next = await openPdfDocument(props.src)
    if (!active || generation !== request) { await next.destroy(); return }
    task = next
    const value = await next.promise
    if (!active || generation !== request) return
    document.value = markRaw(value)
  } catch { if (active && generation === request) error.value = true }
  finally { if (generation === request) loading.value = false }
}
function arm() {
  observer?.disconnect()
  if (!root.value) return
  if (typeof IntersectionObserver === 'undefined') { void load(); return }
  observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); void load() } }, { rootMargin: '240px 0px' })
  observer.observe(root.value)
}
onMounted(() => { active = true; autoPages.value = typeof IntersectionObserver !== 'undefined'; arm() })
watch(() => props.src, () => {
  generation++; void task?.destroy(); task = undefined; document.value = null; visiblePages.value = 1; lastReady = 0; loading.value = false; error.value = false; bottomObserver?.disconnect(); arm()
})
onBeforeUnmount(() => { active = false; generation++; observer?.disconnect(); bottomObserver?.disconnect(); void task?.destroy() })
</script>
<template>
  <section ref="root" class="public-pdf-document" :aria-label="label" :aria-busy="loading">
    <template v-if="document">
      <PdfPage v-for="page in visiblePages" :key="`${src}:${page}`" :document="document" :page="page" :locale="locale" @ready="pageReady(page)" />
      <div v-if="visiblePages < document.numPages" ref="sentinel" class="public-pdf-next">
        <button v-if="!autoPages" type="button" @click="visiblePages++">{{ locale === 'zh' ? '加载下一页' : 'Load next page' }}</button>
      </div>
    </template>
    <p v-else-if="error" role="status">{{ locale === 'zh' ? 'PDF 暂时无法显示，请重试。' : 'Unable to display this PDF. Please retry.' }} <button type="button" @click="load">{{ locale === 'zh' ? '重试' : 'Retry' }}</button></p>
    <p v-else class="public-pdf-loading" role="status">{{ locale === 'zh' ? '正在准备 PDF 正文…' : 'Preparing PDF…' }}</p>
  </section>
</template>
<style scoped>
.public-pdf-document{display:block;clear:both;width:100%;margin:1.3rem 0 0;padding-top:1rem;border-top:1px solid var(--public-line,#dbe6df)}
.public-pdf-loading{min-height:12rem;color:var(--public-muted,#647568);font-size:.85rem}.public-pdf-next{height:1px}
.public-pdf-document button{padding:.3rem .7rem;border-radius:.5rem;color:var(--public-accent,#316a50);background:var(--public-surface-soft,#edf5ef)}
</style>
