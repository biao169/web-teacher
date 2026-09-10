<script setup lang="ts">
withDefaults(defineProps<{ interactive?: boolean; padded?: boolean }>(), { interactive: false, padded: true })
</script>

<template>
  <article
    class="public-card pub:relative"
    :class="{ 'public-card--interactive': interactive, 'public-card--padded': padded }"
  >
    <slot />
  </article>
</template>
