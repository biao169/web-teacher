<script setup lang="ts">
import type { MediaViewModel } from '~~/shared/contracts/media'
import { mediaSurnameFallback } from '~/utils/media-fallback'

const props = withDefaults(defineProps<{
  media?: MediaViewModel | null
  name?: string | null
  size?: number
}>(), { media: null, name: null, size: 36 })

const failed = ref(false)
const source = computed(() => props.media?.available && props.media.kind === 'image' ? props.media.url : null)
const alt = computed(() => props.media?.alt?.trim() || (typeof props.name === 'string' ? props.name.trim() : '') || '人员照片')
const initials = computed(() => mediaSurnameFallback(props.name) || '?')
watch(source, () => { failed.value = false })
</script>

<template>
  <span
    class="admin-list-avatar"
    :style="{ '--admin-list-avatar-size': `${props.size}px` }"
    :aria-label="source && !failed ? undefined : `${alt}（暂无照片）`"
  >
    <img
      v-if="source && !failed"
      :src="source"
      :alt="alt"
      :width="props.size"
      :height="props.size"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    >
    <span v-else aria-hidden="true">{{ initials }}</span>
  </span>
</template>

<style scoped>
.admin-list-avatar {
  width: var(--admin-list-avatar-size);
  height: var(--admin-list-avatar-size);
  display: inline-flex;
  flex: 0 0 var(--admin-list-avatar-size);
  align-items: center;
  justify-content: center;
  overflow: visible;
  border: 0;
  border-radius: .42rem;
  color: var(--admin-primary-strong);
  background: transparent;
  font-size: .68rem;
  font-weight: 800;
  letter-spacing: .02em;
  line-height: 1;
}
.admin-list-avatar img { width: 100%; height: 100%; max-width: 100%; max-height: 100%; display: block; margin: 0; border: 0; border-radius: .42rem; object-fit: contain; object-position: center; background: transparent; }
</style>
