<script setup lang="ts">
import type { PublicCourseListViewModel } from '~~/shared/contracts/public-content'

defineProps<{ model: PublicCourseListViewModel }>()
</script>
<template>
  <PublicContentListFrame :model="model" :empty-title="model.locale === 'zh' ? '暂无课程' : 'No courses'">
    <template #default="{ items }">
    <PublicContentRecordRow v-for="item in items" :key="item.uid" :uid="item.uid" :display-number="item.displayNumber" :title="item.name" :href="item.href" :metadata="[item.semester]" :tags="[item.audience]" :summary="item.summary" />
    </template>
  </PublicContentListFrame>
</template>
