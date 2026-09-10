<script setup lang="ts">
import { publicHomePublicationPage } from '~~/shared/utils/public-home-publications'
definePageMeta({ layout: 'public' })

const { data, error, refresh } = await usePublicHome('zh')
if (error.value || !data.value) {
  throw createError({ statusCode: 503, message: 'Public site data is temporarily unavailable' })
}
usePublicSeo(() => data.value!)
const publicationPage = computed(() => publicHomePublicationPage(data.value!))
const { data: citations, status: citationStatus, error: citationError, refresh: refreshCitations } = await usePublicCitationPage(publicationPage)
async function retryCitations() { await refresh(); await refreshCitations() }
</script>

<template>
  <PublicHomePage v-if="data" :model="data" :citations="citations" :citation-status="citationStatus" :citation-error="Boolean(citationError)" @retry="retryCitations" />
</template>
