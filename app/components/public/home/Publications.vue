<script setup lang="ts">
import { computed } from 'vue'
import type { PublicHomeViewModel } from '~~/shared/contracts/public-site'
import type { PublicCitationPage } from '~~/shared/contracts/public-citation'
import { publicHomePublicationPage } from '~~/shared/utils/public-home-publications'
import RecordGroup from './RecordGroup.vue'
import PublicationRows from '../content/PublicationRows.vue'
import CitationStyleControl from '../content/CitationStyleControl.vue'
const props = defineProps<{ model: PublicHomeViewModel; citations?: PublicCitationPage | null | undefined; citationStatus: string; citationError: boolean }>()
defineEmits<{ retry: [] }>()
const page = computed(() => publicHomePublicationPage(props.model))
</script>
<template><section v-if="model.publications.length" id="publications" class="public-section public-home-section" aria-labelledby="home-publications-title"><div class="public-container">
  <PublicSectionHeading id="home-publications-title" :title="model.locale === 'zh' ? '精选论文' : 'Featured publications'"><template #action><NuxtLink class="public-text-link" :to="`/${model.locale}/publications`">{{ model.locale === 'zh' ? '查看全部' : 'View all' }}</NuxtLink></template></PublicSectionHeading>
  <CitationStyleControl :locale="model.locale" />
  <RecordGroup module="publications" :locale="model.locale" :revision="model.publicationRevision" :items="model.publications"><PublicationRows :model="page" initial :citations="citations" :citation-status="citationStatus" :citation-error="citationError" @retry="$emit('retry')" /></RecordGroup>
</div></section></template>
