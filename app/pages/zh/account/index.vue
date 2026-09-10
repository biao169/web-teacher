<script setup lang="ts">
definePageMeta({ layout: 'public' })
useSeoMeta({ title: '账号与登录状态', description: '查看当前身份、刷新会话或管理登录设备。', robots: 'noindex, nofollow' })
</script>
<template><PublicAuthPageShell eyebrow="账号中心" title="账号与登录状态" description="查看当前身份、刷新会话或管理登录设备。"><PublicAuthAccountPanel locale="zh" /></PublicAuthPageShell></template>
