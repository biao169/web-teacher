<script setup lang="ts">
import type { PublicCitation } from '~~/shared/contracts/public-citation'
import type { PublicSiteLocale } from '~~/shared/contracts/public-site'
import { publicCitationSegments } from '~~/shared/utils/public-citation'
const props = defineProps<{ citation: PublicCitation; locale: PublicSiteLocale }>()
const segments = computed(() => publicCitationSegments(props.citation))
</script>
<template>
  <div class="public-citation-content" :data-citation-style="citation.style" :data-citation-status="citation.status">
    <p v-if="citation.status === 'missing'" class="public-citation-missing">{{ locale === 'zh' ? `${citation.label}：该格式未维护，现有资料不足以生成。` : `${citation.label}: this format is not maintained and the available metadata is insufficient to generate it.` }}</p>
    <p v-else class="public-citation-text"><template v-for="(segment, index) in segments" :key="index"><mark v-if="segment.highlighted">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template></p>
    <small v-if="citation.status === 'generated'" class="public-citation-status">{{ locale === 'zh' ? '按已有资料生成' : 'Generated from available metadata' }}</small>
  </div>
</template>
