<script setup lang="ts">
import { nextTick, ref, useId } from 'vue'
import { ChevronDown, MessageCircle } from '@lucide/vue'
import ContactForm from './ContactForm.vue'

defineProps<{ locale: 'zh' | 'en'; news: { uid: string; title: string } }>()
const expanded = ref(false)
const opened = ref(false)
const panel = ref<HTMLElement | null>(null)
const panelId = useId()
async function toggle(): Promise<void> {
  expanded.value = !expanded.value
  if (expanded.value) {
    opened.value = true
    await nextTick()
    panel.value?.focus({ preventScroll: true })
  }
}
</script>
<template>
  <section class="public-news-messages">
    <button class="public-news-messages__toggle" type="button" :aria-expanded="expanded" :aria-controls="panelId" @click="toggle">
      <MessageCircle :size="17" aria-hidden="true" />{{ locale === 'zh' ? (expanded ? '收起留言区' : '就这条新闻留言') : (expanded ? 'Close message form' : 'Message about this news') }}<ChevronDown :size="15" aria-hidden="true" />
    </button>
    <div :id="panelId" ref="panel" v-show="expanded" class="public-news-messages__panel" tabindex="-1" role="region" :aria-label="locale === 'zh' ? '新闻留言' : 'News message'">
      <h2>{{ locale === 'zh' ? '新闻留言' : 'News message' }}</h2>
      <p>{{ locale === 'zh' ? '提交给网站管理团队。' : 'Send a message to the site team.' }}</p>
      <ContactForm v-if="opened" :locale="locale" :news="news" />
    </div>
  </section>
</template>
