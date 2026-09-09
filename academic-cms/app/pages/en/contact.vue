<script setup lang="ts">
import ContactForm from '~/components/public/contact/ContactForm.vue'
definePageMeta({ layout: 'public' })
usePublicContentSeo({ title: 'Contact the team', description: 'Send a message about admissions, collaboration, publications, projects, or courses.', path: '/en/contact', alternatePath: '/zh/contact', breadcrumbs: [], image: null, type: 'website' })
</script>
<template><PublicAuthPageShell eyebrow="Contact" title="Contact the team" description="Send a message about admissions, collaboration, publications, projects, or courses."><ContactForm locale="en" /></PublicAuthPageShell></template>
