<script setup lang="ts">
import { ElDrawer } from 'element-plus'
import { ElConfigProvider } from '~/admin/element-plus-ts6'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
const route = useRoute(); const ui = useAdminUi(); const shell = useAdminShell()
useHead({ htmlAttrs: { lang: 'zh-CN' }, bodyAttrs: { class: 'admin-body' }, titleTemplate: title => title ? `${title} · 管理后台` : '管理后台', meta: [{ name: 'robots', content: 'noindex,nofollow' }] })
watch(() => route.fullPath, () => ui.setMobileOpen(false))
const elementSize = computed(() => ui.density === 'compact' ? 'small' : 'default')
</script>
<template>
  <ElConfigProvider :locale="zhCn" :size="elementSize" namespace="el">
    <a class="admin-skip-link" href="#admin-main">跳到主要内容</a>
    <div class="admin-shell" :class="{ 'is-collapsed': ui.sidebarCollapsed }" :data-density="ui.density">
      <aside class="admin-sidebar" aria-label="后台侧栏"><AdminSidebar :groups="shell.navigation.value" :collapsed="ui.sidebarCollapsed" @navigate="ui.resetTransient()" @toggle="ui.toggleSidebar()" /></aside>
      <ElDrawer v-model="ui.mobileOpen" class="admin-mobile-drawer" direction="ltr" :size="'min(88vw, 19rem)'" :with-header="false" append-to-body aria-label="后台菜单"><AdminSidebar :groups="shell.navigation.value" mobile @navigate="ui.setMobileOpen(false)" /></ElDrawer>
      <section class="admin-workspace"><AdminTopbar :page-title="shell.pageTitle.value" :breadcrumbs="shell.breadcrumbs.value" :user="shell.user.value" @mobile-menu="ui.setMobileOpen(true)" /><main id="admin-main" class="admin-main" tabindex="-1"><slot /></main></section>
    </div>
  </ElConfigProvider>
</template>
<style src="~/assets/admin/typography.css"></style>
<style src="~/assets/admin/base.css"></style>
