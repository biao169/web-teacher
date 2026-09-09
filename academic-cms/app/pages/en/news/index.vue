<script setup lang="ts">
import type { PublicNewsListViewModel } from '~~/shared/contracts/public-content'
definePageMeta({ layout: 'public' })
const { data, error } = await usePublicListResource<PublicNewsListViewModel>('news', 'en')
const model = useRequiredPublicPage(data, error)
usePublicContentSeo(() => model.value.meta)
</script>
<template><PublicContentNewsList :model="model" /></template>
