<script setup lang="ts">
import type { PublicStudentDetailViewModel } from '~~/shared/contracts/public-content'
definePageMeta({ layout: 'public' })
const route = useRoute()
const identifier = computed(() => {
  const value = route.params.uid
  return typeof value === 'string' ? value : ''
})
const { data, error } = await usePublicDetailResource<PublicStudentDetailViewModel>('students', identifier, 'en')
const model = useRequiredPublicPage(data, error)
usePublicContentSeo(() => model.value.meta)
</script>
<template><PublicContentStudentDetail :model="model" /></template>
