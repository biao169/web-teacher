<script setup lang="ts">
definePageMeta({ layout: 'public' })
useSeoMeta({ title: 'Change password', description: 'Changing your password revokes active sessions on other devices.', robots: 'noindex, nofollow' })
</script>
<template><PublicAuthPageShell eyebrow="Account security" title="Change password" description="Changing your password revokes active sessions on other devices."><PublicAuthPasswordChangeForm locale="en" /></PublicAuthPageShell></template>
