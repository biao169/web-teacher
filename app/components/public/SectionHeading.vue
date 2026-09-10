<script setup lang="ts">
defineProps<{
  eyebrow?: string
  title: string
  description?: string | null
  id?: string
}>()
</script>

<template>
  <header class="public-section-heading">
    <div>
      <p v-if="eyebrow" class="public-eyebrow">{{ eyebrow }}</p>
      <h2 :id="id">{{ title }}</h2>
      <p v-if="description" class="public-section-description">{{ description }}</p>
    </div>
    <div v-if="$slots.action" class="public-section-heading__action"><slot name="action" /></div>
  </header>
</template>
