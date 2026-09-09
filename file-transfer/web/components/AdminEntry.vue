<script setup lang="ts">
import { useTransferSession } from '../composables/useTransferSession'
defineProps<{ collapsed?: boolean }>()
defineEmits<{ navigate: [] }>()
const { session } = useTransferSession()
</script>
<template>
  <NuxtLink v-if="session?.permissions.includes('transfer.manage')" class="ft-sidebar-entry" to="/transfer-admin/" title="文件快传管理" @click="$emit('navigate')">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 7h16M7 4 4 7l3 3M20 17H4m13-3 3 3-3 3" /></svg>
    <span v-if="!collapsed">文件快传管理</span><span v-else class="ft-entry-sr">文件快传管理</span>
  </NuxtLink>
</template>
<style scoped>
.ft-sidebar-entry{display:flex;align-items:center;gap:10px;margin:8px 12px;padding:11px 12px;border-radius:9px;color:inherit;text-decoration:none;font-size:13px;background:rgba(84,140,112,.08)}.ft-sidebar-entry:hover{background:rgba(84,140,112,.16)}.ft-sidebar-entry:focus-visible{outline:2px solid #48836b;outline-offset:2px}.ft-entry-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
</style>
