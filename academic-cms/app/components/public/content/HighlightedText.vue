<script setup lang="ts">
import { splitHighlightedText } from '~~/shared/utils/text-highlight'

const props = withDefaults(defineProps<{
  text: string
  highlights?: readonly string[]
  markSuffix?: string
}>(), { highlights: () => [], markSuffix: '' })
const segments = computed(() => splitHighlightedText(props.text, props.highlights))
</script>

<template>
  <span class="public-highlighted-text"><template v-for="(segment, index) in segments" :key="index"><mark v-if="segment.highlighted">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template><sup v-if="segment.highlighted && markSuffix">{{ markSuffix }}</sup></template></span>
</template>
