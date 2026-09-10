<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'accent' | 'neutral' | 'outline' }>(), { tone: 'neutral' })
</script>

<template>
  <span class="public-badge" :class="`public-badge--${tone}`"><slot /></span>
</template>
