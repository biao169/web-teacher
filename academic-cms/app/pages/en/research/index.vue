<script setup lang="ts">
import type { PublicResearchViewModel } from '~~/shared/contracts/public-content'
definePageMeta({ layout: 'public' })
const { data, error } = await usePublicResearchResource<PublicResearchViewModel>('en')
const model = useRequiredPublicPage(data, error)
usePublicContentSeo(() => model.value.meta)
</script>
<template><PublicContentResearchList :model="model" /></template>
