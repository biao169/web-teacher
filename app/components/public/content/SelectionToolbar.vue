<script setup lang="ts">
import { inject, watch } from 'vue'
import CopyPrepared from './CopyPrepared.vue'
import { PUBLIC_SELECTION_CONTEXT } from '~/composables/usePublicSelection'
import { usePublicCopy } from '~/composables/usePublicCopy'
import { usePublicCitationStyle } from '~/composables/usePublicCitationStyle'
import type { PublicSiteLocale } from '~~/shared/contracts/public-site'
const props = defineProps<{ locale: PublicSiteLocale; pageCount: number; loaded?: boolean }>()
const selection = inject(PUBLIC_SELECTION_CONTEXT)!, copy = usePublicCopy(), style = usePublicCitationStyle()
const includeNumbers = useState('public-copy-numbers:v1', () => false)
function run() {
  if (!selection.module.value || !selection.count.value || copy.busy.value) return
  void copy.copy({ module: selection.module.value, locale: props.locale, uids: [...selection.ids.value], includeNumbers: includeNumbers.value, ...(selection.module.value === 'publications' ? { citationStyle: style.value } : {}) })
}
function removeUnavailable() {
  const blocked = new Set(copy.unavailable.value)
  for (const uid of blocked) selection.toggle(uid, '', false)
}
function changePage(event: Event) {
  const checkbox = event.target as HTMLInputElement
  selection.togglePage(checkbox.checked)
  checkbox.checked = selection.allOnPage.value; checkbox.indeterminate = selection.someOnPage.value
}
watch(() => [props.locale, selection.contextKey.value, includeNumbers.value], copy.reset, { flush: 'sync' })
</script>
<template>
  <div v-if="selection.enabled.value" class="public-selection-toolbar">
    <label class="public-selection-page"><input type="checkbox" :checked="selection.allOnPage.value" :indeterminate="selection.someOnPage.value" :disabled="pageCount === 0" @change="changePage"><span>{{ locale === 'zh' ? (loaded ? '全选已加载' : '全选当前页') : (loaded ? 'Select loaded items' : 'Select this page') }}</span></label>
    <span class="public-selection-count" aria-live="polite">{{ locale === 'zh' ? `已选 ${selection.count.value} 条` : `${selection.count.value} selected` }}<span v-if="selection.outsideCount.value">{{ locale === 'zh' ? `，其中 ${selection.outsideCount.value} 条${loaded ? '未在当前列表加载' : '不在当前页'}` : ` · ${selection.outsideCount.value} ${loaded ? 'not loaded in this list' : 'outside this page'}` }}</span></span>
    <label class="public-copy-number-option"><input v-model="includeNumbers" type="checkbox">{{ locale === 'zh' ? '带页面序号' : 'Include list numbers' }}</label>
    <button class="public-copy-selected" type="button" :disabled="!selection.count.value || copy.busy.value" :aria-busy="copy.busy.value" @click="run">{{ locale === 'zh' ? (copy.busy.value ? '正在复制…' : '复制已选') : (copy.busy.value ? 'Copying…' : 'Copy selected') }}</button>
    <button type="button" :disabled="!selection.count.value" @click="selection.clear()">{{ locale === 'zh' ? '清空' : 'Clear' }}</button>
    <p v-if="selection.notice.value" class="public-selection-notice" role="status">{{ selection.notice.value }}</p>
    <CopyPrepared :copy="copy"><button v-if="copy.unavailable.value.length" type="button" @click="removeUnavailable">{{ locale === 'zh' ? '取消勾选不可用条目' : 'Deselect unavailable items' }}</button></CopyPrepared>
  </div>
</template>
