<script setup lang="ts">
definePageMeta({ layout: 'public' })
useSeoMeta({ title: '创建账号', description: '公开注册是否开放由网站全局设置控制。', robots: 'noindex, nofollow' })
</script>
<template><PublicAuthPageShell eyebrow="账号注册" title="创建账号" description="公开注册是否开放由网站全局设置控制。"><PublicAuthRegisterForm locale="zh" /></PublicAuthPageShell></template>
