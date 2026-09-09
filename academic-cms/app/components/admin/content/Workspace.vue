<script setup lang="ts">
import type { AdminContentRoute } from '~~/shared/admin/content-modules'
defineProps<{ routeModel: AdminContentRoute }>()
</script>
<template>
  <AdminContentList v-if="routeModel.mode === 'list'" :definition="routeModel.definition" />
  <AdminContentEditor v-else :key="`${routeModel.definition.module}:${routeModel.mode}:${routeModel.uid ?? 'new'}`" :definition="routeModel.definition" :mode="routeModel.mode" :uid="routeModel.uid" />
</template>
