<script setup lang="ts">
import type { PublicStudentListViewModel } from '~~/shared/contracts/public-content'
definePageMeta({ layout: 'public' })
const { data, error } = await usePublicListResource<PublicStudentListViewModel>('students', 'en')
const model = useRequiredPublicPage(data, error)
usePublicContentSeo(() => model.value.meta)
</script>
<template><PublicContentStudentsList :model="model" /></template>
