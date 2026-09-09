<script setup lang="ts">
import { Download, ExternalLink, FileText } from '@lucide/vue'
import type { PublicMedia } from '~~/shared/contracts/public-site'
defineProps<{ media: PublicMedia; label: string }>()
</script>
<template>
  <a v-if="media.available" class="public-document-link" :href="media.url" :download="media.disposition === 'attachment' ? '' : undefined" target="_blank" rel="noopener noreferrer">
    <FileText :size="20" aria-hidden="true" /><span><strong>{{ label }}</strong><small>{{ media.title || media.mimeType }}</small></span>
    <Download v-if="media.disposition === 'attachment'" :size="18" aria-hidden="true" /><ExternalLink v-else :size="18" aria-hidden="true" />
  </a>
</template>
