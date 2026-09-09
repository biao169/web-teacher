<script setup lang="ts">
import type { PDFDocumentProxy, PDFPageProxy, RenderTask, TextLayer } from '~/utils/pdf-document'
import { loadPdfLibrary } from '~/utils/pdf-document'
const props = defineProps<{ document: PDFDocumentProxy; page: number; locale: 'zh' | 'en' }>()
const emit = defineEmits<{ ready: [] }>()
const host = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const text = ref<HTMLElement | null>(null)
const ratio = ref(210 / 297)
const error = ref(false)
const rendered = ref(false)
let pdfPage: PDFPageProxy | undefined
let renderTask: RenderTask | undefined
let textLayer: TextLayer | undefined
let observer: IntersectionObserver | undefined
let resize: ResizeObserver | undefined
let near = false
let disposed = false
let generation = 0
let lastWidth = 0
function clear() {
  generation++; renderTask?.cancel(); textLayer?.cancel(); text.value?.replaceChildren()
  if (canvas.value) { canvas.value.width = 0; canvas.value.height = 0 }
  rendered.value = false
}
async function render() {
  if (!near || disposed || !host.value || !canvas.value || !text.value) return
  const width = Math.max(1, Math.round(host.value.getBoundingClientRect().width || host.value.clientWidth || 600))
  if (rendered.value && width === lastWidth) return
  clear(); const request = generation; lastWidth = width; error.value = false
  try {
    const page = pdfPage ?? await props.document.getPage(props.page)
    if (disposed || request !== generation) return
    pdfPage = page
    const base = page.getViewport({ scale: 1 })
    ratio.value = base.width / base.height
    const viewport = page.getViewport({ scale: width / base.width })
    const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6_000_000 / (viewport.width * viewport.height)))
    const target = canvas.value!
    target.width = Math.ceil(viewport.width * density); target.height = Math.ceil(viewport.height * density)
    renderTask = page.render({ canvas: target, viewport, transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0] })
    await renderTask.promise
    if (disposed || request !== generation) return
    rendered.value = true; emit('ready')
    const pdf = await loadPdfLibrary()
    const content = await page.getTextContent()
    if (disposed || request !== generation || !text.value) return
    text.value.style.setProperty('--total-scale-factor', String(viewport.scale * viewport.userUnit))
    textLayer = new pdf.TextLayer({ textContentSource: content, container: text.value, viewport })
    await textLayer.render()
  } catch {
    if (disposed || request !== generation) return
    // A text-layer failure must not discard an already rendered page.
    if (!rendered.value) { error.value = true; emit('ready') }
  }
}
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') { near = true; void render() }
  else {
    observer = new IntersectionObserver(entries => {
      const value = entries.some(entry => entry.isIntersecting)
      if (near === value) return
      near = value
      if (near) void render()
      else { clear(); pdfPage?.cleanup() }
    }, { rootMargin: '1200px 0px' })
    if (host.value) observer.observe(host.value)
  }
  if (typeof ResizeObserver !== 'undefined') { resize = new ResizeObserver(() => { if (near) void render() }); if (host.value) resize.observe(host.value) }
})
onBeforeUnmount(() => { disposed = true; observer?.disconnect(); resize?.disconnect(); clear(); pdfPage?.cleanup() })
</script>
<template>
  <div ref="host" class="public-pdf-page" :style="{ aspectRatio: String(ratio) }" role="group" :aria-label="locale === 'zh' ? `PDF 第 ${page} 页` : `PDF page ${page}`">
    <canvas ref="canvas" :class="{ 'is-ready': rendered }" aria-hidden="true" />
    <div ref="text" class="textLayer" />
    <p v-if="error" class="public-pdf-page__error" role="status">{{ locale === 'zh' ? '此页加载失败。' : 'This page could not load.' }} <button type="button" @click="render">{{ locale === 'zh' ? '重试' : 'Retry' }}</button></p>
  </div>
</template>
<style scoped>
.public-pdf-page{position:relative;width:100%;margin:0 0 .7rem;background:transparent;overflow:hidden}
.public-pdf-page canvas{display:block;width:100%;height:100%;opacity:0}.public-pdf-page canvas.is-ready{opacity:1}
.public-pdf-page__error{position:absolute;inset:1rem;font-size:.85rem;color:var(--public-muted,#647568)}
.textLayer{position:absolute;inset:0;overflow:clip;text-align:initial;line-height:1;z-index:1;transform-origin:0 0;-webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;--min-font-size:1;--scale-round-x:1px;--scale-round-y:1px;--text-scale-factor:calc(var(--total-scale-factor)*var(--min-font-size));--min-font-size-inv:calc(1 / var(--min-font-size))}
.textLayer :deep(:is(span,br)){position:absolute;color:transparent;white-space:pre;cursor:text;transform-origin:0% 0%}
.textLayer :deep(> :not(.markedContent)),.textLayer :deep(.markedContent span:not(.markedContent)){z-index:1;--font-height:0;--scale-x:1;--rotate:0deg;font-size:calc(var(--text-scale-factor)*var(--font-height));transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))}
.textLayer :deep(.markedContent){display:contents}.textLayer :deep(::selection){background:rgba(95,150,110,.28)}
</style>
