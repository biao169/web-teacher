<script setup lang="ts">
import type { PublicCourseDetailViewModel } from '~~/shared/contracts/public-content'
definePageMeta({ layout: 'public' })
const route = useRoute()
const identifier = computed(() => {
  const value = route.params.uid
  return typeof value === 'string' ? value : ''
})
const { data, error } = await usePublicDetailResource<PublicCourseDetailViewModel>('courses', identifier, 'zh')
const model = useRequiredPublicPage(data, error)
usePublicContentSeo(() => model.value.meta)
</script>
<template><PublicContentCourseDetail :model="model" /></template>
