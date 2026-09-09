<script setup lang="ts">
import { Clock3, ExternalLink, MessageSquareText, RefreshCw, ServerCog, ShieldCheck } from '@lucide/vue'
import { ElAlert, ElButton, ElSkeleton, ElSkeletonItem, ElTag } from 'element-plus'
import { ADMIN_ICONS, FALLBACK_ADMIN_ICON } from '~/admin/icons'
import { adminErrorDetails } from '~/admin/errors'
import { visibleAdminModules } from '~~/shared/admin/registry'
definePageMeta({ layout: 'admin' }); useSeoMeta({ title: '控制台' })
const auth = useAuthSession(); const query = useAdminDashboard()
const { data, error, isPending, isFetching, refetch } = query
const user = computed(() => auth.session.value.authenticated ? auth.session.value.user : null)
const modules = computed(() => visibleAdminModules(user.value).filter(item => item.module !== 'dashboard'))
const details = computed(() => error.value ? adminErrorDetails(error.value) : null)
const formatter = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
const timeFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const sessionExpiry = computed(() => auth.session.value.authenticated ? formatter.format(new Date(auth.session.value.expiresAt)) : '—')
const generatedAt = computed(() => data.value ? timeFormatter.format(new Date(data.value.generatedAt)) : '—')
</script>
<template>
  <section class="admin-dashboard">
    <AdminPageHeader eyebrow="总览" title="控制台" description="查看当前身份、待处理事项、运行状态和可用管理模块。"><template #actions><ElButton :loading="isFetching" @click="refetch()"><RefreshCw :size="16" />刷新</ElButton></template></AdminPageHeader>
    <ElAlert v-if="details" class="admin-dashboard__alert" type="error" :closable="false" show-icon :title="details.message" :description="details.requestId ? `请求编号：${details.requestId}` : '可以稍后手动重试。'" />
    <div v-if="isPending" class="admin-metric-grid" aria-label="正在加载控制台"><article v-for="index in 4" :key="index" class="admin-metric-card"><ElSkeleton animated><template #template><ElSkeletonItem variant="text" style="width:42%" /><ElSkeletonItem variant="h1" style="margin-top:18px;width:60%" /><ElSkeletonItem variant="text" style="margin-top:16px" /></template></ElSkeleton></article></div>
    <template v-else>
      <div class="admin-metric-grid">
        <article class="admin-metric-card"><span class="admin-metric-card__icon"><ShieldCheck :size="20" /></span><small>当前账号</small><strong>{{ user?.displayName || user?.username || '—' }}</strong><p>{{ user?.role.name || '身份不可用' }}</p></article>
        <article class="admin-metric-card"><span class="admin-metric-card__icon"><MessageSquareText :size="20" /></span><small>待处理留言</small><strong>{{ data?.pendingMessages ?? '无查看权限' }}</strong><p>{{ data?.pendingMessages === null ? '该模块不会被查询。' : '状态为“新留言”的记录。' }}</p></article>
        <article class="admin-metric-card"><span class="admin-metric-card__icon"><ServerCog :size="20" /></span><small>运行环境</small><strong>{{ data?.runtime.kind ?? '—' }}</strong><p>应用版本 {{ data?.runtime.version ?? '—' }}</p></article>
        <article class="admin-metric-card"><span class="admin-metric-card__icon"><Clock3 :size="20" /></span><small>Session 到期</small><strong>{{ sessionExpiry }}</strong><p>控制台数据生成于 {{ generatedAt }}</p></article>
      </div>
      <div class="admin-dashboard__columns">
        <section class="admin-panel" aria-labelledby="admin-modules-title"><header class="admin-panel__heading"><div><small>权限范围</small><h2 id="admin-modules-title">可用管理模块</h2></div><ElTag effect="plain">{{ modules.length }} 个</ElTag></header><div class="admin-module-grid"><NuxtLink v-for="item in modules" :key="item.module" class="admin-module-card" :to="item.path"><span class="admin-module-card__icon"><component :is="ADMIN_ICONS[item.icon] ?? FALLBACK_ADMIN_ICON" :size="20" /></span><span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span><ElTag v-if="!item.implemented" size="small" type="info" effect="plain">待补充</ElTag><ExternalLink v-else :size="15" /></NuxtLink></div><AdminStatePanel v-if="modules.length === 0" title="没有可用模块" description="当前角色没有任何后台模块的查看权限，请联系系统管理员。" /></section>
        <section class="admin-panel" aria-labelledby="admin-operations-title"><header class="admin-panel__heading"><div><small>最近活动</small><h2 id="admin-operations-title">操作日志</h2></div><NuxtLink v-if="user?.permissions.operation_logs?.view" class="admin-panel__link" to="/admin/logs">查看全部</NuxtLink></header><ol v-if="data?.recentOperations?.length" class="admin-activity-list"><li v-for="item in data.recentOperations" :key="item.uid"><span class="admin-activity-list__dot" /><div><strong>{{ item.summary || item.action }}</strong><p>{{ item.actorName || '系统' }} · {{ item.module }}</p></div><time :datetime="item.createdAt">{{ timeFormatter.format(new Date(item.createdAt)) }}</time></li></ol><AdminStatePanel v-else title="暂无可显示的操作" :description="user?.permissions.operation_logs?.view ? '近期没有操作日志。' : '当前角色没有操作日志查看权限，因此不会查询该表。'" /></section>
      </div>
    </template>
  </section>
</template>
