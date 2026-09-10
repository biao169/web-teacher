<script setup lang="ts">
import type { PublicPublicationListViewModel } from '~~/shared/contracts/public-content'
definePageMeta({ layout: 'public' })
const { data, error, refresh } = await usePublicListResource<PublicPublicationListViewModel>('publications', 'zh')
const model = useRequiredPublicPage(data, error)
usePublicContentSeo(() => model.value.meta)
const { data: citations, status: citationStatus, error: citationError, refresh: refreshCitations } = await usePublicCitationPage(model)
async function retryCitations() { await refresh(); await refreshCitations() }
</script>
<template><PublicContentPublicationsList :model="model" :citations="citations" :citation-status="citationStatus" :citation-error="Boolean(citationError)" @retry="retryCitations" /></template>
