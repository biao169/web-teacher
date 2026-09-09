<script setup lang="ts">
definePageMeta({ layout: 'public' })
useSeoMeta({ title: '登录', description: '使用网站账号访问受保护内容或管理功能。', robots: 'noindex, nofollow' })
</script>
<template><PublicAuthPageShell eyebrow="账号登录" title="登录" description="使用网站账号访问受保护内容或管理功能。"><PublicAuthLoginForm locale="zh" /></PublicAuthPageShell></template>
