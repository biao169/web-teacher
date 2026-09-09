<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft } from '@lucide/vue'
import { publicDetailList, safePublicReturn } from '~~/shared/utils/public-detail-link'
const props = defineProps<{ path: string; locale: 'zh' | 'en' }>()
const route = useRoute()
const target = computed(() => safePublicReturn(props.path, route.query.from) ?? publicDetailList(props.path)!)
const home = computed(() => /^\/(zh|en)(?:#|$)/u.test(target.value))
</script>
<template><NuxtLink class="public-detail-return" :to="target"><ArrowLeft :size="16" aria-hidden="true" />{{ locale === 'zh' ? (home ? '返回首页' : '返回结果列表') : (home ? 'Back to home' : 'Back to results') }}</NuxtLink></template>
