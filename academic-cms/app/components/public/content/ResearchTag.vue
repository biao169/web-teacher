<script setup lang="ts">
import { computed, inject, provide } from 'vue'
import type { PublicResearchItem, PublicNumberedRecord } from '~~/shared/contracts/public-content'
import { PUBLIC_SELECTION_CONTEXT } from '~/composables/usePublicSelection'
import { PUBLIC_LIST_RETURN_CONTEXT } from '~/composables/usePublicListReturn'
import { publicDetailHref } from '~~/shared/utils/public-detail-link'
import CopyRecordButton from './CopyRecordButton.vue'
import CopyPrepared from './CopyPrepared.vue'
import { PUBLIC_COPY_CONTEXT, usePublicCopy } from '~/composables/usePublicCopy'
const copy = usePublicCopy()
provide(PUBLIC_COPY_CONTEXT, copy)

const props = defineProps<{ item: PublicResearchItem & PublicNumberedRecord; locale: 'zh' | 'en' }>()
const selection = inject(PUBLIC_SELECTION_CONTEXT, null)
const origins = inject(PUBLIC_LIST_RETURN_CONTEXT, null)
const selectable = computed(() => selection?.enabled.value && selection.module.value === 'research')
const selected = computed(() => selectable.value && selection?.ids.value.has(props.item.uid))
const detailHref = computed(() => {
  const origin = origins?.value.get(props.item.uid)
  return origin ? publicDetailHref(props.item.href, origin) : props.item.href
})
function changeSelection(event: Event) {
  const checkbox = event.target as HTMLInputElement
  if (selectable.value) selection?.toggle(props.item.uid, props.item.name, checkbox.checked)
  checkbox.checked = Boolean(selected.value)
}
</script>
<template>
  <article class="public-research-tag" :data-uid="item.uid" :data-copy-state="copy.status.value !== 'idle' ? copy.status.value : undefined" :data-selected="selected ? 'true' : undefined">
    <div v-if="selectable" class="public-research-tag__controls">
      <label class="public-record-select"><input class="public-record-checkbox" type="checkbox" :aria-label="item.name" :checked="selected" @change="changeSelection"></label>
      <CopyRecordButton module="research" :locale="locale" :uid="item.uid" :label="item.name" />
    </div>
    <h2 class="public-research-tag__name"><span class="public-record-number">{{ item.displayNumber }}.</span><NuxtLink :to="detailHref">{{ item.name }}</NuxtLink></h2>
    <CopyPrepared :copy="copy" />
  </article>
</template>
