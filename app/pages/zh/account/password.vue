<script setup lang="ts">
definePageMeta({ layout: 'public' })
useSeoMeta({ title: '修改密码', description: '修改后将撤销其他设备上的活动登录。', robots: 'noindex, nofollow' })
</script>
<template><PublicAuthPageShell eyebrow="账号安全" title="修改密码" description="修改后将撤销其他设备上的活动登录。"><PublicAuthPasswordChangeForm locale="zh" /></PublicAuthPageShell></template>
