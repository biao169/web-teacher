<script setup lang="ts">
import ContactForm from '~/components/public/contact/ContactForm.vue'
definePageMeta({ layout: 'public' })
usePublicContentSeo({ title: '联系与留言', description: '提交招生、合作、论文、项目或课程相关留言。', path: '/zh/contact', alternatePath: '/en/contact', breadcrumbs: [], image: null, type: 'website' })
</script>
<template><PublicAuthPageShell eyebrow="联系团队" title="联系与留言" description="提交招生、合作、论文、项目或课程相关留言。"><ContactForm locale="zh" /></PublicAuthPageShell></template>
