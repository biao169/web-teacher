<script setup lang="ts">
import type { PublicResearchDetailViewModel } from '~~/shared/contracts/public-content'
definePageMeta({ layout: 'public' })
const route = useRoute()
const identifier = computed(() => {
  const value = route.params.uid
  return typeof value === 'string' ? value : ''
})
const { data, error } = await usePublicDetailResource<PublicResearchDetailViewModel>('research', identifier, 'zh')
const model = useRequiredPublicPage(data, error)
usePublicContentSeo(() => model.value.meta)
</script>
<template><PublicContentResearchDetail :model="model" /></template>
