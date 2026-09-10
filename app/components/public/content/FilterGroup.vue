<script setup lang="ts">
import { Check, ChevronDown, Search } from '@lucide/vue'
import type { CSSProperties } from 'vue'
import type { PublicFilterGroup, PublicFilterOption } from '~~/shared/contracts/public-content'
import { publicListDefinition, publicListHref } from '~~/shared/utils/public-list-link'

const props = defineProps<{ group: PublicFilterGroup; locale: 'zh' | 'en' }>()
const open = defineModel<boolean>('open', { default: false })
const route = useRoute()
const router = useRouter()
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const popup = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const listbox = ref<HTMLElement | null>(null)
const candidate = ref('')
const result = ref<{ options: PublicFilterOption[]; page: number; hasMore: boolean } | null>(null)
const loading = ref(false)
const error = ref('')
const active = ref(0)
const position = ref<CSSProperties>({ visibility: 'hidden' })
const id = `public-filter-${useId()}`
let generation = 0
let controller: AbortController | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let observer: ResizeObserver | undefined
let focusOptions = false
let lastRequest = { candidate: '', page: 1 }
const selected = computed(() => props.group.options.find(option => option.selected))
const options = computed(() => (result.value?.options ?? (candidate.value.trim() ? [] : props.group.options.slice(0, 20))).map(option => ({
  ...option, label: props.group.options.find(known => known.value === option.value)?.label || option.label,
})))
// Index zero is always the clear option, including when the current selection is on another page.
const choices = computed(() => [{ value: '', label: props.locale === 'zh' ? '全部' : 'All', count: null }, ...options.value])
function cancelRequest() { generation++; controller?.abort(); controller = null; clearTimeout(timer); loading.value = false }
function close(restoreFocus = false) {
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}
async function choose(value: string) {
  try {
    const target = publicListHref(route.path, route.query, { [props.group.key]: value || null, page: null }, route.hash)
    await router.push(target)
    close(true)
  } catch { error.value = props.locale === 'zh' ? '筛选未能应用，请重试。' : 'Could not apply this filter. Please retry.' }
}
async function browse(page = 1, term = candidate.value.trim()) {
  cancelRequest()
  const current = generation
  controller = new AbortController()
  lastRequest = { candidate: term, page }
  loading.value = true; error.value = ''
  try {
    const data = await $fetch<{ options: PublicFilterOption[]; page: number; hasMore: boolean }>('/api/v1/public/filter-options', {
      query: { ...route.query, locale: props.locale, module: publicListDefinition(route.path)?.module, field: props.group.key, candidate: term, candidatePage: page },
      signal: controller.signal, timeout: 10000,
    })
    if (current === generation) {
      const activeValue = choices.value[active.value]?.value
      result.value = data
      active.value = Math.max(0, choices.value.findIndex(option => option.value === activeValue))
    }
  } catch {
    if (current === generation) error.value = props.locale === 'zh' ? '选项读取失败，请重试或缩短关键词。' : 'Could not load options. Retry or shorten the search.'
  } finally { if (current === generation) loading.value = false }
}
function scheduleSearch() {
  cancelRequest(); result.value = null; error.value = ''; active.value = 0
  if (open.value) timer = setTimeout(() => { void browse() }, 250)
}
watch(candidate, scheduleSearch)
function positionPopup() {
  if (!open.value || !trigger.value || !popup.value) return
  const rect = trigger.value.getBoundingClientRect()
  if (rect.bottom < 0 || rect.top > window.innerHeight) { close(); return }
  const margin = 12, gap = 6
  const below = Math.max(0, window.innerHeight - rect.bottom - gap - margin)
  const above = Math.max(0, rect.top - gap - margin)
  const height = Math.min(popup.value.scrollHeight, window.innerHeight - 2 * margin)
  const down = below >= height || below >= above
  const available = down ? below : above
  const width = popup.value.getBoundingClientRect().width
  position.value = {
    minWidth: `min(max(18rem, ${rect.width}px), calc(100vw - 1.5rem))`,
    left: `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`,
    top: `${down ? Math.max(margin, rect.bottom + gap) : Math.max(margin, rect.top - gap - Math.min(height, available))}px`,
    maxHeight: `${available}px`, visibility: 'visible',
  }
}
function outside(event: Event) { if (event.target instanceof Node && !root.value?.contains(event.target)) close() }
function cleanup() {
  cancelRequest(); observer?.disconnect(); observer = undefined
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('focusin', outside)
  window.removeEventListener('resize', positionPopup)
  window.removeEventListener('scroll', positionPopup, true)
}
function focusList(last = false) {
  active.value = last ? choices.value.length - 1 : Math.max(0, choices.value.findIndex(option => option.value === (selected.value?.value ?? '')))
  listbox.value?.focus()
}
function openFromKeyboard(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  event.preventDefault()
  if (open.value) focusList(event.key === 'ArrowUp')
  else { focusOptions = true; open.value = true }
}
function move(event: KeyboardEvent) {
  if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) event.preventDefault()
  if (event.key === 'ArrowDown') active.value = (active.value + 1) % choices.value.length
  else if (event.key === 'ArrowUp') active.value = (active.value - 1 + choices.value.length) % choices.value.length
  else if (event.key === 'Home') active.value = 0
  else if (event.key === 'End') active.value = choices.value.length - 1
  else if (event.key === 'Enter' || event.key === ' ') { void choose(choices.value[active.value]!.value); return }
  else return
  document.getElementById(`${id}-option-${active.value}`)?.scrollIntoView?.({ block: 'nearest' })
}
watch(open, async value => {
  if (!value) {
    cleanup(); candidate.value = ''; result.value = null; error.value = ''; position.value = { visibility: 'hidden' }
    return
  }
  await nextTick()
  if (!open.value) return
  document.addEventListener('pointerdown', outside)
  document.addEventListener('focusin', outside)
  window.addEventListener('resize', positionPopup)
  window.addEventListener('scroll', positionPopup, true)
  if (typeof ResizeObserver !== 'undefined' && popup.value) { observer = new ResizeObserver(positionPopup); observer.observe(popup.value) }
  positionPopup()
  if (focusOptions) { focusList(); focusOptions = false } else input.value?.focus()
  void browse()
})
watch(() => route.fullPath, () => { close(); cancelRequest() })
watch([options, loading, error], async () => { await nextTick(); positionPopup() })
onBeforeUnmount(cleanup)
</script>
<template>
  <div ref="root" class="public-filter-dropdown" :data-filter="group.key" @keydown.esc.stop.prevent="close(true)">
    <button :id="`${id}-trigger`" ref="trigger" type="button" class="public-filter-trigger" :class="{ 'is-selected': selected }"
      aria-haspopup="dialog" :aria-expanded="open" :aria-controls="open ? `${id}-popup` : undefined"
      :title="selected ? `${group.label}: ${selected.label}` : group.label" @click="open = !open" @keydown="openFromKeyboard">
      <span>{{ group.label }}</span><span v-if="selected" class="public-filter-value">: {{ selected.label }}</span><ChevronDown :size="14" aria-hidden="true" />
    </button>
    <div v-if="open" :id="`${id}-popup`" ref="popup" class="public-filter-popup" role="dialog" :aria-labelledby="`${id}-trigger`" :style="position">
      <form class="public-filter-option-search" role="search" @submit.prevent="browse()">
        <label class="public-sr-only" :for="`${id}-search`">{{ locale === 'zh' ? `搜索${group.label}` : `Search ${group.label}` }}</label>
        <input :id="`${id}-search`" ref="input" v-model="candidate" type="search" maxlength="256" autocomplete="off"
          :placeholder="locale === 'zh' ? `搜索${group.label}` : `Search ${group.label}`" @keydown.down.prevent="focusList()" @keydown.up.prevent="focusList(true)">
        <button type="submit" :aria-label="locale === 'zh' ? '搜索选项' : 'Search options'"><Search :size="16" aria-hidden="true" /></button>
      </form>
      <p v-if="selected" class="public-filter-current">{{ locale === 'zh' ? '已选：' : 'Selected: ' }}{{ selected.label }}</p>
      <p v-if="error" class="public-filter-status" role="alert">{{ error }} <button type="button" @click="browse(lastRequest.page, lastRequest.candidate)">{{ locale === 'zh' ? '重试' : 'Retry' }}</button></p>
      <p v-if="loading" class="public-filter-status" role="status">{{ locale === 'zh' ? '正在读取…' : 'Loading…' }}</p>
      <div :id="`${id}-options`" ref="listbox" role="listbox" :aria-label="group.label" :aria-busy="loading" tabindex="0"
        :aria-activedescendant="`${id}-option-${active}`" class="public-filter-option-list" @keydown="move">
        <div v-for="(option, index) in choices" :id="`${id}-option-${index}`" :key="option.value" role="option"
          :aria-selected="option.value === (selected?.value ?? '')" class="public-filter-option" :class="{ 'is-active': active === index }"
          @pointermove="active = index" @click="choose(option.value)">
          <Check :size="14" aria-hidden="true" :class="{ 'is-hidden': option.value !== (selected?.value ?? '') }" />
          <span>{{ option.label }}</span><small v-if="option.count !== null">{{ option.count }}</small>
        </div>
      </div>
      <p v-if="result && !options.length && !loading && !error" class="public-filter-status" role="status">{{ locale === 'zh' ? '没有匹配选项' : 'No matching options' }}</p>
      <div v-if="result" class="public-filter-option-pages">
        <button type="button" :disabled="loading || result.page <= 1" @click="browse(result.page - 1)">{{ locale === 'zh' ? '上一页' : 'Previous' }}</button>
        <span aria-live="polite">{{ locale === 'zh' ? `第 ${result.page} 页` : `Page ${result.page}` }}</span>
        <button type="button" :disabled="loading || !result.hasMore" @click="browse(result.page + 1)">{{ locale === 'zh' ? '下一页' : 'Next' }}</button>
      </div>
    </div>
  </div>
</template>
