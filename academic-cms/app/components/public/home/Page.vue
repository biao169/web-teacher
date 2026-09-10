<script setup lang="ts">
import type { PublicCitationPage } from '~~/shared/contracts/public-citation'
import type { PublicHomeViewModel } from '~~/shared/contracts/public-site'

defineProps<{ model: PublicHomeViewModel; citations?: PublicCitationPage | null | undefined; citationStatus: string; citationError: boolean }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="public-home public-home--cards pub:min-h-screen">
    <div class="public-container public-home-grid">
      <PublicHomeHero :model="model" />
      <PublicHomeResearch :model="model" />
      <div v-if="model.publications.length || model.news.length" class="public-home-updates" :class="{ 'public-home-updates--single': !model.publications.length || !model.news.length }">
        <PublicHomePublications :model="model" :citations="citations" :citation-status="citationStatus" :citation-error="citationError" @retry="$emit('retry')" />
        <PublicHomeNews :model="model" />
      </div>
      <PublicHomeProjects :model="model" />
    </div>
  </div>
</template>

<style src="../../../assets/public/home.css"></style>
