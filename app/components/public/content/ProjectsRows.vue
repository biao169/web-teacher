<script setup lang="ts">
import { formatProjectAmount } from '~~/shared/utils/project-amount'
import type { PublicProjectSummary, PublicNumberedRecord } from '~~/shared/contracts/public-content'
defineProps<{ items: Array<PublicProjectSummary & PublicNumberedRecord>; locale: 'zh' | 'en' }>()
</script>
<template>
    <PublicContentRecordRow v-for="item in items" :key="item.uid" :uid="item.uid" :display-number="item.displayNumber" :title="item.name"
      :metadata="[item.projectNumber ? (locale === 'zh' ? '编号：' : 'No. ') + item.projectNumber : null, item.principal ? (locale === 'zh' ? '负责人：' : 'Principal: ') + item.principal : null, item.role, item.periodLabel, formatProjectAmount(item.amount, locale)]" :status-tags="[item.status]">
      <template #eyebrow>
        <p v-if="item.source || item.fundName" class="public-project-funding"><strong v-if="item.source">{{ item.source }}</strong><span v-if="item.source && item.fundName"> · </span><strong v-if="item.fundName">{{ item.fundName }}</strong></p>
      </template>
      <template #content>
        <p class="public-project-name">{{ item.name }}</p>
      </template>
    </PublicContentRecordRow>
</template>
