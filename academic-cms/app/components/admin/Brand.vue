<script setup lang="ts">defineProps<{ collapsed?: boolean }>()</script>
<template>
  <NuxtLink class="admin-brand" to="/admin" aria-label="返回管理后台首页">
    <span class="admin-brand__mark" aria-hidden="true">A</span>
    <span v-if="!collapsed" class="admin-brand__copy"><strong>Academic CMS</strong><small>管理后台</small></span>
  </NuxtLink>
</template>
