<script setup lang="ts">
import CopyRecordButton from './CopyRecordButton.vue'
import type { PublicPatentDetailViewModel } from '~~/shared/contracts/public-content'
const props = defineProps<{ model: PublicPatentDetailViewModel }>()
const facts = computed(() => [
  { label: props.model.locale === 'zh' ? '国家/地区' : 'Country or region', value: props.model.item.country }, { label: props.model.locale === 'zh' ? '类型' : 'Type', value: props.model.item.patentType },
  { label: props.model.locale === 'zh' ? '申请号' : 'Application number', value: props.model.item.applicationNumber }, { label: props.model.locale === 'zh' ? '授权号' : 'Grant number', value: props.model.item.grantNumber },
  { label: props.model.locale === 'zh' ? '申请日期' : 'Application date', value: props.model.item.applicationDate }, { label: props.model.locale === 'zh' ? '授权日期' : 'Grant date', value: props.model.item.grantDate },
  { label: props.model.locale === 'zh' ? '发明人/作者' : 'Inventors or authors', value: props.model.item.inventors }, { label: props.model.locale === 'zh' ? '权利人' : 'Owner', value: props.model.item.owner },
  { label: props.model.locale === 'zh' ? '法律状态' : 'Legal status', value: props.model.item.legalStatus },
])
</script>
<template><div><PublicContentPageHero :meta="model.meta" :locale="model.locale" hide-description /><section class="public-content-section"><div class="public-container public-detail-layout public-detail-layout--wide"><main class="public-detail-main"><CopyRecordButton module="patents" :locale="model.locale" :uid="model.item.uid" :label="model.item.name" text /><PublicContentFactGrid :items="facts" /><PublicContentLongText :title="model.locale === 'zh' ? '简介' : 'Summary'" :text="model.item.summary" id="patent-summary" /></main><aside class="public-detail-aside"><PublicContentMediaLink :media="model.item.certificate" :label="model.locale === 'zh' ? '证书材料' : 'Certificate'" /></aside></div></section></div></template>
