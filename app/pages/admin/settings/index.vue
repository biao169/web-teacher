<script setup lang="ts">
definePageMeta({ layout: 'admin' })
useHead({ title: '系统设置中心' })

const entries = [
  { title: '网站设置', description: '站点名称、首页、SEO、Logo 与页脚。', to: '/admin/settings/site' },
  { title: '全局设置', description: '注册、留言、上传、PDF、翻译与元数据策略。', to: '/admin/settings/global' },
  { title: '导航与按钮', description: '维护顶部、首页、页脚和后台导航。', to: '/admin/navigation' },
] as const
</script>

<template>
  <section class="admin-settings-hub" aria-labelledby="settings-title">
    <header>
      <h1 id="settings-title">系统设置中心</h1>
      <p>选择一个设置模块。保存操作会写入操作日志并精确失效相关缓存。</p>
    </header>
    <div class="settings-grid">
      <NuxtLink v-for="entry in entries" :key="entry.to" :to="entry.to" class="settings-card">
        <strong>{{ entry.title }}</strong>
        <span>{{ entry.description }}</span>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.admin-settings-hub{display:grid;gap:1.25rem}.settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1rem}.settings-card{display:grid;gap:.5rem;padding:1.25rem;border:1px solid var(--el-border-color);border-radius:.75rem;background:var(--el-bg-color);text-decoration:none;color:inherit}.settings-card:hover{border-color:var(--el-color-primary)}.settings-card span{color:var(--el-text-color-secondary)}
</style>
