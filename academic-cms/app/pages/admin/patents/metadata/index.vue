<script setup lang="ts">
import AdminCompleteMetadataWorkspace from '../../../../components/admin/complete/AdminCompleteMetadataWorkspace.vue'
definePageMeta({ layout: 'admin' })
useHead({ title: '专利元数据 - 网站后台' })
</script>

<template>
  <AdminCompleteMetadataWorkspace initial-kind="patent" />
</template>
