<script setup lang="ts">
import type { PublicTeamListViewModel } from '~~/shared/contracts/public-content'
definePageMeta({ layout: 'public' })
const { data, error } = await usePublicListResource<PublicTeamListViewModel>('team', 'en')
const model = useRequiredPublicPage(data, error)
usePublicContentSeo(() => model.value.meta)
</script>
<template><PublicContentTeamList :model="model" /></template>
