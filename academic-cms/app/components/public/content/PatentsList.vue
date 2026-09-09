<script setup lang="ts">
import type { PublicPatentListViewModel } from '~~/shared/contracts/public-content'

defineProps<{ model: PublicPatentListViewModel }>()
</script>
<template>
  <PublicContentListFrame :model="model" :empty-title="model.locale === 'zh' ? '暂无专利或软著' : 'No patents or software works'">
    <template #default="{ items }">
    <PublicContentRecordRow v-for="item in items" :key="item.uid" :uid="item.uid" :display-number="item.displayNumber" :title="item.name" :metadata="[item.inventors, item.applicationNumber ? (model.locale === 'zh' ? '申请号：' : 'Application: ') + item.applicationNumber : null, item.grantNumber ? (model.locale === 'zh' ? '授权号：' : 'Grant: ') + item.grantNumber : null, item.grantDate || item.applicationDate]" :tags="[item.patentType, item.country]" :status-tags="[item.legalStatus]" />
    </template>
  </PublicContentListFrame>
</template>
