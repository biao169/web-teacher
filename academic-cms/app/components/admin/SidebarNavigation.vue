<script setup lang="ts">
import { ADMIN_ICONS, FALLBACK_ADMIN_ICON } from '~/admin/icons'
import type { AdminNavigationGroup } from '~~/shared/admin/registry'
const props = defineProps<{ groups: readonly AdminNavigationGroup[]; collapsed?: boolean }>()
const emit = defineEmits<{ navigate: [] }>(); const route = useRoute()
function active(path: string): boolean { return path === '/admin' ? route.path === path : route.path === path || route.path.startsWith(`${path}/`) }
</script>
<template>
  <nav class="admin-navigation" :aria-label="props.collapsed ? '后台模块导航（已折叠）' : '后台模块导航'">
    <section v-for="group in groups" :key="group.id" class="admin-navigation__group">
      <h2 v-if="!collapsed" class="admin-navigation__group-title">{{ group.label }}</h2>
      <ul class="admin-navigation__list">
        <li v-for="item in group.modules" :key="item.module">
          <NuxtLink class="admin-navigation__link" :class="{ 'is-active': active(item.path) }" :to="item.path" :title="collapsed ? item.title : undefined" :aria-current="active(item.path) ? 'page' : undefined" @click="emit('navigate')">
            <component :is="ADMIN_ICONS[item.icon] ?? FALLBACK_ADMIN_ICON" :size="18" aria-hidden="true" />
            <span v-if="!collapsed" class="admin-navigation__label">{{ item.shortTitle }}</span>
            <span v-if="!collapsed && !item.implemented" class="admin-navigation__pending">待补充</span>
          </NuxtLink>
        </li>
      </ul>
    </section>
    <p v-if="groups.length === 0" class="admin-navigation__empty">当前账号没有可查看的后台模块。</p>
  </nav>
</template>
