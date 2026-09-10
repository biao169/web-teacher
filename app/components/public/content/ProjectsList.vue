<script setup lang="ts">
import ProjectsRows from './ProjectsRows.vue'
import type { PublicProjectListViewModel } from '~~/shared/contracts/public-content'

defineProps<{ model: PublicProjectListViewModel }>()
</script>
<template>
  <PublicContentListFrame :model="model" :empty-title="model.locale === 'zh' ? '暂无项目' : 'No projects'">
    <template #default="{ items }">
    <ProjectsRows :items="items" :locale="model.locale" />
    </template>
  </PublicContentListFrame>
</template>
