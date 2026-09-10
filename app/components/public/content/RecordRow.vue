<script setup lang="ts">
import type { PublicMedia } from '~~/shared/contracts/public-site'
import { computed, inject, provide } from 'vue'
import { PUBLIC_LIST_RETURN_CONTEXT } from '~/composables/usePublicListReturn'
import { publicDetailHref } from '~~/shared/utils/public-detail-link'
import CopyRecordButton from './CopyRecordButton.vue'
import CopyPrepared from './CopyPrepared.vue'
import { PUBLIC_COPY_CONTEXT, usePublicCopy } from '~/composables/usePublicCopy'
const copy = usePublicCopy()
provide(PUBLIC_COPY_CONTEXT, copy)
import Badge from '../ui/Badge.vue'
import { PUBLIC_SELECTION_CONTEXT } from '~/composables/usePublicSelection'
const selection = inject(PUBLIC_SELECTION_CONTEXT, null)

const props = withDefaults(defineProps<{
  uid: string
  displayNumber: number
  title: string
  href?: string
  summary?: string | null
  metadata?: Array<string | null | undefined>
  tags?: Array<string | null | undefined>
  statusTags?: Array<string | null | undefined>
  media?: PublicMedia
  mediaFallback?: string
  portrait?: boolean
  tagsAtEnd?: boolean
}>(), { summary: null, metadata: () => [], tags: () => [], statusTags: () => [], mediaFallback: '', portrait: false, tagsAtEnd: false })
const badges = computed(() => {
  const statuses = new Set(props.statusTags.map(tag => tag?.trim()).filter(Boolean))
  return [...new Set([...props.tags, ...props.statusTags].map(tag => tag?.trim()).filter((tag): tag is string => Boolean(tag)))].map(label => ({ label, tone: statuses.has(label) ? 'accent' as const : 'neutral' as const }))
})
const origins = inject(PUBLIC_LIST_RETURN_CONTEXT, null)
const detailHref = computed(() => props.href && origins?.value.get(props.uid) ? publicDetailHref(props.href, origins.value.get(props.uid)!) : props.href)
function changeSelection(event: Event) {
  const checkbox = event.target as HTMLInputElement
  selection?.toggle(props.uid, props.title, checkbox.checked)
  checkbox.checked = selection?.ids.value.has(props.uid) ?? false
}
</script>

<template>
  <article class="public-compact-record" :data-uid="uid" :data-media="media ? 'true' : undefined" :data-portrait="media && portrait ? 'true' : undefined" :data-selected="selection?.ids.value.has(uid) ? 'true' : undefined">
    <div class="public-compact-record__rail">
      <span class="public-record-number">{{ displayNumber }}.</span>
      <label v-if="selection?.enabled.value" class="public-record-select">
        <input class="public-record-checkbox" type="checkbox" :aria-label="title" :checked="selection.ids.value.has(uid)" @change="changeSelection">
      </label>
      <CopyRecordButton v-if="selection?.module.value" :module="selection.module.value" :locale="selection.locale.value" :uid="uid" :label="title" />
      <slot name="controls" />
    </div>
    <div v-if="media" class="public-compact-record__media" :class="{ 'is-portrait': portrait }">
      <PublicMediaImage :media="media" :initials="title" :fallback-text="mediaFallback" :aspect="portrait ? 'portrait' : 'landscape'" />
    </div>
    <div class="public-compact-record__body">
      <slot name="eyebrow" />
      <div class="public-compact-record__heading">
        <slot name="content">
          <h2 class="public-compact-record__title"><NuxtLink v-if="detailHref" :to="detailHref">{{ title }}</NuxtLink><template v-else>{{ title }}</template></h2>
        </slot>
        <div v-if="badges.length && !tagsAtEnd" class="public-record-tags"><Badge v-for="badge in badges" :key="badge.label" :tone="badge.tone">{{ badge.label }}</Badge></div>
      </div>
      <p v-if="metadata.some(Boolean)" class="public-compact-record__meta">{{ metadata.filter(Boolean).join(' · ') }}</p>
      <p v-if="summary" class="public-compact-record__summary">{{ summary }}</p>
      <slot name="body" />
      <div v-if="$slots.links || (tagsAtEnd && badges.length)" class="public-compact-record__links"><slot name="links" /><div v-if="tagsAtEnd && badges.length" class="public-record-tags"><Badge v-for="badge in badges" :key="badge.label" :tone="badge.tone">{{ badge.label }}</Badge></div></div>
    </div>
    <CopyPrepared :copy="copy" />
  </article>
</template>
