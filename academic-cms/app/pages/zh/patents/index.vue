<script setup lang="ts">
import type { PublicPatentListViewModel } from '~~/shared/contracts/public-content'
definePageMeta({ layout: 'public' })
const { data, error } = await usePublicListResource<PublicPatentListViewModel>('patents', 'zh')
const model = useRequiredPublicPage(data, error)
usePublicContentSeo(() => model.value.meta)
</script>
<template><PublicContentPatentsList :model="model" /></template>
