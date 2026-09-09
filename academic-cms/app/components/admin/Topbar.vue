<script setup lang="ts">
import { ExternalLink, KeyRound, LogOut, Menu, MonitorCog, UserRound } from '@lucide/vue'
import { ElButton, ElDropdown, ElDropdownItem, ElDropdownMenu, ElMessage } from 'element-plus'
import { getAdminQueryClient } from '~/admin/query-client'
import { safeAdminReturnPath } from '~~/shared/admin/paths'
import type { AdminBreadcrumbItem } from '~~/shared/admin/registry'
import type { SafeUserView } from '~~/shared/contracts/auth'
const props = defineProps<{ pageTitle: string; breadcrumbs: readonly AdminBreadcrumbItem[]; user: SafeUserView | null }>()
const emit = defineEmits<{ mobileMenu: [] }>(); const route = useRoute(); const auth = useAuthSession(); const ui = useAdminUi(); const loggingOut = ref(false)
const accountLabel = computed(() => props.user?.displayName || props.user?.username || '账号')
const initials = computed(() => accountLabel.value.trim().slice(0,1).toUpperCase() || 'A')
async function logout(): Promise<void> {
  if (loggingOut.value) return; loggingOut.value = true
  try { await auth.logout(); getAdminQueryClient().clear(); ui.resetTransient(); window.location.replace('/zh/login') }
  catch { ElMessage.error('退出登录失败，请稍后重试。') }
  finally { loggingOut.value = false }
}
function handleCommand(command: string): void {
  if (command === 'site') window.location.assign('/zh')
  else if (command === 'password') {
    const next = safeAdminReturnPath(route.fullPath, '/admin')
    window.location.assign(`/zh/account/password?next=${encodeURIComponent(next)}`)
  }
  else if (command === 'density') ui.setDensity(ui.density === 'compact' ? 'comfortable' : 'compact')
  else if (command === 'logout') void logout()
}
</script>
<template>
  <header class="admin-topbar">
    <div class="admin-topbar__leading"><ElButton class="admin-topbar__menu" circle plain aria-label="打开后台菜单" @click="emit('mobileMenu')"><Menu :size="19" aria-hidden="true" /></ElButton><div class="admin-topbar__heading"><AdminBreadcrumbs :items="breadcrumbs" /><strong>{{ pageTitle }}</strong></div></div>
    <div class="admin-topbar__actions">
      <ElButton tag="a" href="/zh" plain class="admin-topbar__site-link"><ExternalLink :size="16" aria-hidden="true" /><span>查看网站</span></ElButton>
      <ElDropdown v-if="user" trigger="click" @command="handleCommand">
        <button class="admin-account" type="button" :aria-label="`打开账号菜单：${accountLabel}`"><span class="admin-account__avatar" aria-hidden="true">{{ initials }}</span><span class="admin-account__copy"><strong>{{ accountLabel }}</strong><small>{{ user.role.name }}</small></span></button>
        <template #dropdown><ElDropdownMenu><ElDropdownItem command="site"><ExternalLink :size="15" />查看公开网站</ElDropdownItem><ElDropdownItem command="password"><KeyRound :size="15" />修改密码</ElDropdownItem><ElDropdownItem command="density"><MonitorCog :size="15" />切换界面密度</ElDropdownItem><ElDropdownItem divided command="logout" :disabled="loggingOut"><LogOut :size="15" />退出登录</ElDropdownItem></ElDropdownMenu></template>
      </ElDropdown>
      <span v-else class="admin-account admin-account--anonymous"><UserRound :size="18" />身份不可用</span>
    </div>
  </header>
</template>
