<script setup lang="ts">
import type { PublicNewsDetailViewModel } from '~~/shared/contracts/public-content'
definePageMeta({ layout: 'public' })
const route = useRoute()
const identifier = computed(() => {
  const value = route.params.slug
  return typeof value === 'string' ? value : ''
})
const { data, error } = await usePublicDetailResource<PublicNewsDetailViewModel>('news', identifier, 'zh')
const model = useRequiredPublicPage(data, error)
usePublicContentSeo(() => model.value.meta)
</script>
<template><PublicContentNewsDetail :model="model" /></template>
