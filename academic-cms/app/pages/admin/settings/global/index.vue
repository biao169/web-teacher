<script setup lang="ts">
import AdminCompleteResourceWorkspace from '../../../../components/admin/complete/AdminCompleteResourceWorkspace.vue'

definePageMeta({ layout: 'admin' })
useHead({ title: '全局设置 · 后台' })
</script>

<template>
  <AdminCompleteResourceWorkspace
    resource-key="global-settings"
    permission-module="global_settings"
    title="全局设置"
    description="维护注册、留言、上传、PDF、翻译、元数据和建议缓存策略；按更新时间最新的一条为当前生效配置，密钥采用保留、替换、清除三态编辑。"
  />
</template>
