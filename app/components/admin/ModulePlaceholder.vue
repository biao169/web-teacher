<script setup lang="ts">
import { Construction } from '@lucide/vue'; import { ElTag } from 'element-plus'; import type { AdminModuleDefinition } from '~~/shared/admin/registry'
defineProps<{ module: AdminModuleDefinition }>()
</script>
<template><section><AdminPageHeader eyebrow="管理模块" :title="module.title" :description="module.description"><template #actions><ElTag type="warning" effect="light">功能界面待补充</ElTag></template></AdminPageHeader><article class="admin-placeholder-card"><span><Construction :size="28" /></span><div><h2>后台框架和访问权限已经接通</h2><p>该模块已进入统一侧栏、权限守卫、标题和面包屑体系。列表、筛选、表单和批量操作将在下一阶段接入通用 CRUD 内核。</p></div></article></section></template>
