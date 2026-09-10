<script setup lang="ts">
import { ElAlert, ElButton, ElSkeleton, ElTable, ElTableColumn, ElTag } from 'element-plus'

interface CapabilityRow { module: string; path: string; connected: boolean }

definePageMeta({ layout: 'admin' })
useHead({ title: '后台功能连通性' })
const { data, status, error, refresh } = await useFetch<{ capabilities?: CapabilityRow[] }>('/api/v1/admin/capabilities', { key: 'admin-capabilities' })
const rows = computed<readonly CapabilityRow[]>(() => Array.isArray(data.value?.capabilities) ? data.value.capabilities : [])
</script>
<template>
 <section class="capabilities" aria-labelledby="cap-title">
  <header><div><h1 id="cap-title">后台功能连通性</h1><p>用于本地验收菜单、页面和管理功能入口。</p></div><ElButton :loading="status==='pending'" @click="refresh()">重新检查</ElButton></header>
  <ElAlert v-if="error" type="error" title="无法读取功能状态" show-icon />
  <ElSkeleton v-else-if="status==='pending'" :rows="8" animated />
  <ElTable v-else :data="[...rows]" stripe>
   <ElTableColumn prop="module" label="权限模块" min-width="180" /><ElTableColumn prop="path" label="后台地址" min-width="240" />
   <ElTableColumn label="状态" width="120"><template #default="{ row }"><ElTag :type="row.connected?'success':'danger'">{{ row.connected?'已接通':'异常' }}</ElTag></template></ElTableColumn>
   <ElTableColumn label="操作" width="110"><template #default="{ row }"><NuxtLink :to="row.path"><ElButton link type="primary">打开</ElButton></NuxtLink></template></ElTableColumn>
  </ElTable>
 </section>
</template>
<style scoped>.capabilities{display:grid;gap:1rem}.capabilities>header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.capabilities h1,.capabilities p{margin:0}.capabilities p{margin-top:.35rem;color:var(--el-text-color-secondary)}</style>
