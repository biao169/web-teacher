<script setup lang="ts">
import type { PublicContentBlock } from '~~/shared/contracts/public-content'
defineProps<{ blocks: PublicContentBlock[]; locale?: 'zh' | 'en' }>()
</script>
<template>
  <div class="public-rich-content">
    <template v-for="(block, index) in blocks" :key="`${block.type}:${index}`">
      <h2 v-if="block.type === 'heading' && block.level === 2">{{ block.text }}</h2>
      <h3 v-else-if="block.type === 'heading'">{{ block.text }}</h3>
      <p v-else-if="block.type === 'paragraph'">{{ block.text }}</p>
      <blockquote v-else-if="block.type === 'quote'">{{ block.text }}</blockquote>
      <pre v-else-if="block.type === 'code'"><code>{{ block.text }}</code></pre>
      <ol v-else-if="block.type === 'list' && block.ordered"><li v-for="item in block.items" :key="item">{{ item }}</li></ol>
      <ul v-else-if="block.type === 'list'"><li v-for="item in block.items" :key="item">{{ item }}</li></ul>
      <PublicContentRichHtml v-else-if="block.type === 'rich'" :html="block.html" :locale="locale ?? 'zh'" />
    </template>
  </div>
</template>
