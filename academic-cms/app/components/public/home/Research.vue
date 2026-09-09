<script setup lang="ts">
import type { PublicHomeViewModel } from '~~/shared/contracts/public-site'
defineProps<{ model: PublicHomeViewModel }>()
</script>
<template><section v-if="model.researchInterests.length" id="research" class="public-section public-home-section" aria-labelledby="home-research-title"><div class="public-container">
  <PublicSectionHeading id="home-research-title" :title="model.locale === 'zh' ? '研究方向' : 'Research interests'"><template #action><NuxtLink class="public-text-link" :to="`/${model.locale}/research`">{{ model.locale === 'zh' ? '查看全部' : 'View all' }}</NuxtLink></template></PublicSectionHeading>
  <div class="public-home-research"><NuxtLink v-for="item in model.researchInterests" :key="item.uid" class="public-home-research__card" :to="item.href">{{ item.name }}</NuxtLink></div>
</div></section></template>
