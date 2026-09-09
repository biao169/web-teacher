<script setup lang="ts">
import type { PublicCourseListViewModel } from '~~/shared/contracts/public-content'
definePageMeta({ layout: 'public' })
const { data, error } = await usePublicListResource<PublicCourseListViewModel>('courses', 'en')
const model = useRequiredPublicPage(data, error)
usePublicContentSeo(() => model.value.meta)
</script>
<template><PublicContentCoursesList :model="model" /></template>
