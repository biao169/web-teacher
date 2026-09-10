<script setup lang="ts">
definePageMeta({ layout: 'public' })
useSeoMeta({ title: 'Create an account', description: 'Public registration is governed by the current global site settings.', robots: 'noindex, nofollow' })
</script>
<template><PublicAuthPageShell eyebrow="Account access" title="Create an account" description="Public registration is governed by the current global site settings."><PublicAuthRegisterForm locale="en" /></PublicAuthPageShell></template>
