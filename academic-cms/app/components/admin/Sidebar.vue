<script setup lang="ts">
import { PanelLeftClose, PanelLeftOpen } from '@lucide/vue'
import type { AdminNavigationGroup } from '~~/shared/admin/registry'
defineProps<{ groups: readonly AdminNavigationGroup[]; collapsed?: boolean; mobile?: boolean }>()
const emit = defineEmits<{ navigate: []; toggle: [] }>()
const transferExtension = computed(() => ((useRuntimeConfig().public as Record<string, unknown>).fileTransfer as { enabled?: boolean } | undefined)?.enabled ? resolveComponent('FileTransferAdminEntry') : null)
</script>
<template>
  <div class="admin-sidebar__inner" :class="{ 'is-collapsed': collapsed }">
    <AdminBrand :collapsed="collapsed" />
    <AdminSidebarNavigation :groups="groups" :collapsed="collapsed" @navigate="emit('navigate')" />
    <component :is="transferExtension" v-if="transferExtension" :collapsed="collapsed" @navigate="emit('navigate')" />
    <button v-if="!mobile" class="admin-sidebar__collapse" type="button" :aria-label="collapsed ? '展开后台侧栏' : '折叠后台侧栏'" @click="emit('toggle')">
      <PanelLeftOpen v-if="collapsed" :size="18" aria-hidden="true" /><PanelLeftClose v-else :size="18" aria-hidden="true" /><span v-if="!collapsed">折叠侧栏</span>
    </button>
  </div>
</template>
