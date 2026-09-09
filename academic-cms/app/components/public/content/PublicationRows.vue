<script setup lang="ts">
import { computed, ref, shallowRef, watch, onBeforeUnmount } from 'vue'
import type { PublicPublicationListViewModel } from '~~/shared/contracts/public-content'
import type { PublicCitationPage } from '~~/shared/contracts/public-citation'
import type { PublicSelectionBatch } from '~~/shared/contracts/public-selection'
import { splitPublicCategories } from '~~/shared/utils/public-categories'
import { readPublicCitationPage } from '~~/shared/utils/public-citation'
import { usePublicCitationStyle } from '~/composables/usePublicCitationStyle'
import CitationText from './CitationText.vue'
const props = defineProps<{ model: PublicPublicationListViewModel; initial: boolean; citations?: PublicCitationPage | null | undefined; citationStatus?: string; citationError?: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const selected = usePublicCitationStyle()
const data = shallowRef<PublicCitationPage | null>(null), status = ref('idle'), failed = ref(false)
let generation = 0, controller: AbortController | null = null
function cancel() { generation++; controller?.abort(); controller = null }
async function read() {
  cancel(); data.value = null; failed.value = false
  if (props.initial) return
  const page = props.model, style = selected.value, current = generation
  controller = new AbortController(); const signal = controller.signal; status.value = 'pending'
  try {
    const result = await readPublicCitationPage({ locale: page.locale, style, revision: page.revision, totalPublic: page.totalPublic, items: page.items },
      uid => $fetch<PublicSelectionBatch>('/api/v1/public/selection', { query: { module: 'publications', locale: page.locale, citationStyle: style, uid }, signal, timeout: 15000 }), signal)
    if (current === generation) { data.value = result; status.value = 'success' }
  } catch { if (current === generation) { failed.value = true; status.value = 'error' } }
}
watch(() => [props.model, props.initial, selected.value], read, { immediate: true, flush: 'sync' })
onBeforeUnmount(cancel)
const citations = computed(() => props.initial ? props.citations : data.value)
const citationError = computed(() => props.initial ? props.citationError : failed.value)
const current = computed(() => (props.initial ? props.citationStatus : status.value) === 'success' && citations.value?.style === selected.value && citations.value?.revision === props.model.revision)
const entries = computed(() => new Map(current.value ? citations.value!.entries.map(entry => [entry.uid, entry]) : []))
const missingCount = computed(() => [...entries.value.values()].filter(entry => entry.citation.status === 'missing').length)
function retry() { if (props.initial) emit('retry'); else void read() }
</script>
<template>
      <p v-if="citationError" class="public-citation-feedback" role="alert">{{ model.locale === 'zh' ? '引文暂未就绪，或列表内容已变化。请重新读取。' : 'Citations are not ready, or the list has changed. Please reload.' }} <button type="button" @click="retry">{{ model.locale === 'zh' ? '重新读取' : 'Reload' }}</button></p>
      <p v-else-if="!current && model.items.length" class="public-citation-feedback" role="status">{{ model.locale === 'zh' ? '正在读取本页引用格式…' : 'Loading citations for this page…' }}</p>
      <p v-else-if="missingCount" class="public-citation-feedback" role="status">{{ model.locale === 'zh' ? `本页 ${missingCount} 条未维护所选格式，已在对应记录中标明。` : `${missingCount} items on this page lack the selected format; they are marked below.` }}</p>

    <PublicContentRecordRow v-for="item in model.items" :key="item.uid" :uid="item.uid" :display-number="item.displayNumber" :title="item.title" tags-at-end :tags="[...splitPublicCategories(item.publicationType), ...item.indexTypes, ...item.tags]">
      <template #content>
        <p v-if="!entries.has(item.uid) || entries.get(item.uid)!.citation.status === 'missing'" class="public-citation-identifier">{{ item.title }}</p>
        <CitationText v-if="entries.has(item.uid)" :citation="entries.get(item.uid)!.citation" :locale="model.locale" />
      </template>
      <template v-if="item.doi || item.externalUrl || entries.get(item.uid)?.pdf?.available" #links>
        <a v-if="item.doi" :href="`https://doi.org/${item.doi}`" target="_blank" rel="noopener noreferrer">DOI</a>
        <a v-if="item.externalUrl" :href="item.externalUrl" target="_blank" rel="noopener noreferrer">{{ model.locale === 'zh' ? '来源' : 'Source' }}</a>
        <PublicContentMediaLink v-if="entries.get(item.uid)?.pdf?.available" :media="entries.get(item.uid)!.pdf!" :label="model.locale === 'zh' ? '论文 PDF' : 'Publication PDF'" />
      </template>
    </PublicContentRecordRow>
</template>
