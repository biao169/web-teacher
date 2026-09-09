<script setup lang="ts">
import type { PublicCitationPage } from '~~/shared/contracts/public-citation'
import type { PublicHomeViewModel } from '~~/shared/contracts/public-site'

defineProps<{ model: PublicHomeViewModel; citations?: PublicCitationPage | null | undefined; citationStatus: string; citationError: boolean }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="public-home pub:min-h-screen">
    <PublicHomeHero :model="model" />
    <PublicHomeResearch :model="model" />
    <PublicHomePublications :model="model" :citations="citations" :citation-status="citationStatus" :citation-error="citationError" @retry="$emit('retry')" />
    <PublicHomeProjects :model="model" />
    <PublicHomeNews :model="model" />
  </div>
</template>
