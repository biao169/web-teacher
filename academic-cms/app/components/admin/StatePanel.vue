<script setup lang="ts">
import { AlertTriangle, Inbox } from '@lucide/vue'
withDefaults(defineProps<{ tone?: 'empty' | 'error' | 'unavailable'; title: string; description: string; requestId?: string | null }>(), { tone: 'empty', requestId: null })
</script>
<template><section class="admin-state-panel" :data-tone="tone" role="status"><span class="admin-state-panel__icon" aria-hidden="true"><Inbox v-if="tone === 'empty'" :size="27" /><AlertTriangle v-else :size="27" /></span><h1>{{ title }}</h1><p>{{ description }}</p><small v-if="requestId">请求编号：{{ requestId }}</small><slot name="actions" /></section></template>
