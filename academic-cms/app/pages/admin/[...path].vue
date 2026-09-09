<script setup lang="ts">
import { adminContentRoute } from '~~/shared/admin/content-modules'
import { adminModuleForPath } from '~~/shared/admin/registry'
definePageMeta({ layout: 'admin' })
const route = useRoute()
const contentRoute = computed(() => adminContentRoute(route.path))
const selected = computed(() => adminModuleForPath(route.path))
if (!contentRoute.value && !selected.value) setResponseStatus(404)
useSeoMeta({ title: () => contentRoute.value?.definition.title ?? selected.value?.title ?? '后台页面' })
</script>
<template>
  <AdminContentWorkspace v-if="contentRoute" :route-model="contentRoute" />
  <AdminModulePlaceholder v-else-if="selected" :module="selected" />
  <AdminStatePanel v-else tone="error" title="后台页面不存在" description="该路径没有对应的后台模块。" />
</template>
