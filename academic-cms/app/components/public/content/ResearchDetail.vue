<script setup lang="ts">
import type { PublicResearchDetailViewModel } from '~~/shared/contracts/public-content'
import CopyRecordButton from './CopyRecordButton.vue'
defineProps<{ model: PublicResearchDetailViewModel }>()
</script>
<template><div><PublicContentPageHero :meta="model.meta" :locale="model.locale" hide-description /><section class="public-content-section"><div class="public-container public-detail-main"><CopyRecordButton module="research" :locale="model.locale" :uid="model.item.uid" :label="model.item.name" text /><PublicContentLongText :title="model.locale === 'zh' ? '研究方向介绍' : 'About this research'" :text="model.item.description" id="research-description" /></div></section></div></template>
