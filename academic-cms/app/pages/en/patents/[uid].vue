<script setup lang="ts">
import type { PublicPatentDetailViewModel } from '~~/shared/contracts/public-content'
definePageMeta({ layout: 'public' })
const route = useRoute()
const identifier = computed(() => {
  const value = route.params.uid
  return typeof value === 'string' ? value : ''
})
const { data, error } = await usePublicDetailResource<PublicPatentDetailViewModel>('patents', identifier, 'en')
const model = useRequiredPublicPage(data, error)
usePublicContentSeo(() => model.value.meta)
</script>
<template><PublicContentPatentDetail :model="model" /></template>
