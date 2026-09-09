<script setup lang="ts">
import type { PublicStudentListViewModel } from '~~/shared/contracts/public-content'
import StudentGroups from './StudentGroups.vue'
defineProps<{ model: PublicStudentListViewModel }>()
</script>
<template>
  <PublicContentListFrame :model="model" :empty-title="model.locale === 'zh' ? '暂无学生信息' : 'No student profiles'">
    <template #default="{ items }">
    <StudentGroups :items="items" :locale="model.locale" :categories="model.categories" />
    </template>
  </PublicContentListFrame>
</template>
