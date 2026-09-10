<script setup lang="ts">
import AdminCompleteMediaWorkspace from '../../../../components/admin/complete/AdminCompleteMediaWorkspace.vue'

definePageMeta({ layout: 'admin' })
useHead({ title: '媒体回收站 · 后台' })
</script>

<template><AdminCompleteMediaWorkspace mode="trash" /></template>
