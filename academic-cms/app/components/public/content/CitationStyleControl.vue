<script setup lang="ts">
import { useId } from 'vue'
import { PUBLIC_CITATION_LABELS, PUBLIC_CITATION_STYLES } from '~~/shared/contracts/public-citation'
import type { PublicSiteLocale } from '~~/shared/contracts/public-site'
import { usePublicCitationStyle } from '~/composables/usePublicCitationStyle'
defineProps<{ locale: PublicSiteLocale }>()
const selected = usePublicCitationStyle()
const name = `citation-style-${useId()}`
</script>
<template>
  <fieldset class="public-citation-control"><legend>{{ locale === 'zh' ? '引用格式' : 'Citation style' }}</legend>
    <div class="public-citation-options"><label v-for="style in PUBLIC_CITATION_STYLES" :key="style" :class="{ 'is-selected': selected === style }"><input v-model="selected" type="radio" :name="name" :value="style"><span>{{ PUBLIC_CITATION_LABELS[style] }}</span></label></div>
  </fieldset>
</template>
