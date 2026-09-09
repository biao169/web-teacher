<script setup lang="ts">
import type { PublicProfileDetailViewModel } from '~~/shared/contracts/public-content'
definePageMeta({ layout: 'public' })
const route = useRoute()
const identifier = computed(() => {
  const value = route.params.uid
  return typeof value === 'string' ? value : ''
})
const { data, error } = await usePublicDetailResource<PublicProfileDetailViewModel>('team', identifier, 'zh')
const model = useRequiredPublicPage(data, error)
usePublicContentSeo(() => model.value.meta)
</script>
<template><PublicContentProfileDetail :model="model" /></template>
