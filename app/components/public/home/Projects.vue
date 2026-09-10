<script setup lang="ts">
import type { PublicHomeViewModel } from '~~/shared/contracts/public-site'
import RecordGroup from './RecordGroup.vue'
import ProjectsRows from '../content/ProjectsRows.vue'
defineProps<{ model: PublicHomeViewModel }>()
</script>
<template><section v-if="model.projects.length" id="projects" class="public-section public-home-section" aria-labelledby="home-projects-title"><div class="public-container">
  <PublicSectionHeading id="home-projects-title" :title="model.locale === 'zh' ? '科研项目' : 'Research projects'"><template #action><NuxtLink class="public-text-link" :to="`/${model.locale}/projects`">{{ model.locale === 'zh' ? '查看全部' : 'View all' }}</NuxtLink></template></PublicSectionHeading>
  <RecordGroup module="projects" :locale="model.locale" :revision="model.generatedAt" :items="model.projects"><ProjectsRows :items="model.projects" :locale="model.locale" /></RecordGroup>
</div></section></template>
