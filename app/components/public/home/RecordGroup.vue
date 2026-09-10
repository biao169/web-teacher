<script setup lang="ts">
import { computed, provide } from 'vue'
import { usePublicSelection, PUBLIC_SELECTION_CONTEXT } from '~/composables/usePublicSelection'
import { PUBLIC_LIST_RETURN_CONTEXT } from '~/composables/usePublicListReturn'
import SelectionToolbar from '../content/SelectionToolbar.vue'
const props = defineProps<{ locale: 'zh' | 'en'; module: string; revision: string; presentation?: 'cards' | 'tags'; items: Array<{ uid: string; title?: string | null; name?: string }> }>()
const page = computed(() => ({ ...props, meta: { path: `/${props.locale}#${props.module}` } }))
const selection = usePublicSelection(page)
provide(PUBLIC_SELECTION_CONTEXT, selection)
provide(PUBLIC_LIST_RETURN_CONTEXT, computed(() => new Map(props.items.map(item => [item.uid, page.value.meta.path]))))
</script>
<template><div class="public-home-records"><SelectionToolbar v-if="selection.enabled.value" :locale="locale" :page-count="items.length" loaded /><div class="public-compact-list" :class="{ 'public-research-tags': presentation === 'tags' }"><slot /></div></div></template>
