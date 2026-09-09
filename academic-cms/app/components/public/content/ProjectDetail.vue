<script setup lang="ts">
import { formatProjectAmount } from '~~/shared/utils/project-amount'
import CopyRecordButton from './CopyRecordButton.vue'
import type { PublicProjectDetailViewModel } from '~~/shared/contracts/public-content'
const props = defineProps<{ model: PublicProjectDetailViewModel }>()
const facts = computed(() => [
  { label: props.model.locale === 'zh' ? '项目来源' : 'Source', value: props.model.item.source }, { label: props.model.locale === 'zh' ? '基金/计划' : 'Fund', value: props.model.item.fundName },
  { label: props.model.locale === 'zh' ? '项目编号' : 'Project number', value: props.model.item.projectNumber }, { label: props.model.locale === 'zh' ? '承担角色' : 'Role', value: props.model.item.role },
  { label: props.model.locale === 'zh' ? '负责人' : 'Principal', value: props.model.item.principal }, { label: props.model.locale === 'zh' ? '项目成员' : 'Members', value: props.model.item.members },
  { label: props.model.locale === 'zh' ? '周期' : 'Period', value: props.model.item.periodLabel }, { label: props.model.locale === 'zh' ? '状态' : 'Status', value: props.model.item.status }, { label: props.model.locale === 'zh' ? '经费' : 'Funding', value: formatProjectAmount(props.model.item.amount, props.model.locale) },
])
</script>
<template><div><PublicContentPageHero :meta="model.meta" :locale="model.locale" hide-description /><section class="public-content-section public-section--dark"><div class="public-container public-detail-main public-detail-main--dark"><CopyRecordButton module="projects" :locale="model.locale" :uid="model.item.uid" :label="model.item.name" text /><PublicContentFactGrid :items="facts" /><PublicContentLongText :title="model.locale === 'zh' ? '项目简介' : 'Project summary'" :text="model.item.summary" id="project-summary" /></div></section></div></template>
