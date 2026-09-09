<script setup lang="ts">
import { Copy, Check, LoaderCircle } from '@lucide/vue'
import { inject, watch, onBeforeUnmount } from 'vue'
import type { PublicSelectableModule } from '~~/shared/contracts/public-selection'
import type { PublicSiteLocale } from '~~/shared/contracts/public-site'
import { usePublicCitationStyle } from '~/composables/usePublicCitationStyle'
import { PUBLIC_COPY_CONTEXT, usePublicCopy } from '~/composables/usePublicCopy'
import { PUBLIC_SELECTION_CONTEXT } from '~/composables/usePublicSelection'
import CopyPrepared from './CopyPrepared.vue'
const props = defineProps<{ module: PublicSelectableModule; locale: PublicSiteLocale; uid: string; label: string; text?: boolean }>()
const inherited = inject(PUBLIC_COPY_CONTEXT, null), copy = inherited ?? usePublicCopy()
const selection = inject(PUBLIC_SELECTION_CONTEXT, null)
const style = usePublicCitationStyle(), includeNumbers = useState('public-copy-numbers:v1', () => false)
function run() {
  if (copy.busy.value) return
  void copy.copy({ module: props.module, locale: props.locale, uids: [props.uid], includeNumbers: includeNumbers.value, ...(props.module === 'publications' ? { citationStyle: style.value } : {}) })
}
watch(() => [props.uid, props.module, props.locale, props.module === 'publications' ? style.value : '', includeNumbers.value, selection?.contextKey.value], copy.reset, { flush: 'sync' })
onBeforeUnmount(copy.reset)
</script>
<template>
  <button class="public-copy-record" type="button" :disabled="copy.busy.value" :aria-busy="copy.busy.value" :aria-label="locale === 'zh' ? `复制 ${label}` : `Copy ${label}`" :title="copy.status.value === 'copied' ? (locale === 'zh' ? '已复制' : 'Copied') : (locale === 'zh' ? '复制' : 'Copy')" @click="run"><Check v-if="copy.status.value === 'copied'" :size="16" aria-hidden="true" /><LoaderCircle v-else-if="copy.busy.value" :size="16" aria-hidden="true" /><Copy v-else :size="16" aria-hidden="true" /><span v-if="text">{{ locale === 'zh' ? (copy.busy.value ? '正在复制…' : copy.status.value === 'copied' ? '已复制' : '复制') : (copy.busy.value ? 'Copying…' : copy.status.value === 'copied' ? 'Copied' : 'Copy') }}</span></button>
  <CopyPrepared v-if="!inherited" :copy="copy" />
</template>
