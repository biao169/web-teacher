<script setup lang="ts">
import { Image as ImageIcon } from '@lucide/vue'
import type { PublicMedia } from '~~/shared/contracts/public-site'

const props = withDefaults(defineProps<{
  media: PublicMedia
  initials?: string | null
  fallbackText?: string | null
  eager?: boolean
  priority?: boolean
  aspect?: 'square' | 'portrait' | 'landscape' | 'logo'
}>(), {
  initials: null,
  fallbackText: null,
  eager: false,
  priority: false,
  aspect: 'landscape',
})

const failed = ref(false)
watch(() => props.media.available ? props.media.url : null, () => { failed.value = false })

const imageAvailable = computed(() => props.media.available && props.media.kind === 'image' && !failed.value)
const fallbackText = computed(() => {
  const explicit = props.fallbackText?.trim()
  if (explicit) return explicit
  const value = props.initials?.trim()
  if (!value) return ''
  const words = value.split(/\s+/u).filter(Boolean)
  if (words.length > 1) return words.slice(0, 2).map(word => Array.from(word)[0] ?? '').join('').toUpperCase()
  return Array.from(value).slice(0, 2).join('').toUpperCase()
})
const fallback = computed(() => props.media.available ? 'placeholder' : props.media.fallback)
const alt = computed(() => props.media.alt)
</script>

<template>
  <span class="public-media" :class="`public-media--${aspect}`">
    <img
      v-if="imageAvailable && media.available"
      :src="media.url"
      :alt="media.alt"
      :title="media.title || undefined"
      :width="media.width || undefined"
      :height="media.height || undefined"
      :loading="eager || priority ? 'eager' : 'lazy'"
      :fetchpriority="priority ? 'high' : undefined"
      decoding="async"
      @error="failed = true"
    >
    <span v-else class="public-media__fallback" :aria-label="alt || undefined" :aria-hidden="alt ? undefined : 'true'">
      <span v-if="fallbackText" class="public-media__initials">{{ fallbackText }}</span>
      <ImageIcon v-else-if="fallback === 'placeholder'" :size="28" stroke-width="1.5" aria-hidden="true" />
    </span>
  </span>
</template>
