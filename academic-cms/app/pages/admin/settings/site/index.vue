<script setup lang="ts">
import AdminCompleteResourceWorkspace from '../../../../components/admin/complete/AdminCompleteResourceWorkspace.vue'

definePageMeta({ layout: 'admin' })
useHead({ title: '网站设置 · 后台' })
</script>

<template>
  <AdminCompleteResourceWorkspace
    resource-key="site-settings"
    permission-module="site_settings"
    title="网站设置"
    description="维护网站品牌、首页内容、SEO、Logo 和页脚；启用配置会同步影响中英文公开页面。"
  />
</template>
