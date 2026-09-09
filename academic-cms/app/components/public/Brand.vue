<script setup lang="ts">
defineProps<{
  homePath: '/zh' | '/en'
  homeLabel: string
  name: string
}>()
</script>

<template>
  <NuxtLink class="public-brand" :to="homePath" :aria-label="homeLabel">
    <span class="public-brand__mark" aria-hidden="true">A</span>
    <span>{{ name }}</span>
  </NuxtLink>
</template>
