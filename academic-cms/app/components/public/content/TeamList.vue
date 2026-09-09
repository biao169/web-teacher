<script setup lang="ts">
import type { PublicTeamListViewModel } from '~~/shared/contracts/public-content'
import { mediaSurnameFallback } from '~/utils/media-fallback'
defineProps<{ model: PublicTeamListViewModel }>()
</script>
<template>
  <PublicContentListFrame :model="model" :empty-title="model.locale === 'zh' ? '暂无团队成员' : 'No team members'">
    <template #default="{ items }">
    <PublicContentRecordRow v-for="item in items" :key="item.uid" :uid="item.uid" :display-number="item.displayNumber" :title="item.name" :href="item.href" :media="item.avatar" :media-fallback="mediaSurnameFallback(item.name)" portrait :tags="[item.role]" :metadata="[item.title, item.organization, item.lab]" :summary="item.biography" />
    </template>
  </PublicContentListFrame>
</template>
