<script setup lang="ts">
import { computed } from 'vue'
import type { PublicStudentSummary, PublicNumberedRecord } from '~~/shared/contracts/public-content'
import { mediaSurnameFallback } from '~/utils/media-fallback'
import { splitPublicCategories } from '~~/shared/utils/public-categories'
const props = defineProps<{ items: Array<PublicStudentSummary & PublicNumberedRecord>; locale: 'zh' | 'en'; categories?: Array<{ key: string; label: string }> | undefined }>()
const groups = computed(() => {
  const result = new Map<string, { key: string; label: string; items: typeof props.items }>()
  for (const item of props.items) {
    const key = splitPublicCategories(item.categoryKey ?? item.category)[0] ?? ''
    const label = props.categories?.find(category => category.key === key)?.label ?? splitPublicCategories(item.category)[0] ?? (props.locale === 'zh' ? '未分类' : 'Uncategorized')
    if (!result.has(key)) result.set(key, { key, label, items: [] })
    result.get(key)!.items.push(item)
  }
  const order = new Map(props.categories?.map((category, index) => [category.key, index]))
  return [...result.values()].sort((a, b) => (order.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.key) ?? Number.MAX_SAFE_INTEGER))
})
</script>
<template>
  <section v-for="group in groups" :key="group.key" class="public-student-group" :aria-label="group.label" :data-category="group.key">
    <header class="public-student-group__heading"><h2>{{ group.label }}</h2><span>{{ locale === 'zh' ? `已加载 ${group.items.length} 人` : `${group.items.length} loaded` }}</span></header>
    <div class="public-student-group__rows">
      <PublicContentRecordRow v-for="item in group.items" :key="item.uid" :uid="item.uid" :display-number="item.displayNumber" :title="item.name" :href="item.href" :media="item.avatar" :media-fallback="mediaSurnameFallback(item.name)" portrait :metadata="[item.degree, item.grade, item.direction]" :tags="splitPublicCategories(item.category)" :status-tags="[item.status]" :summary="item.biography" />
    </div>
  </section>
</template>
<style scoped>
.public-student-group{min-width:0}.public-student-group+.public-student-group{margin-top:1.3rem}
.public-student-group__heading{display:flex;align-items:baseline;gap:.75rem;padding:.5rem .15rem .65rem;border-bottom:1px solid var(--public-line);margin-bottom:.6rem}
.public-student-group__heading h2{font-size:1rem;font-weight:600;color:var(--public-accent-strong)}.public-student-group__heading span{font-size:.8rem;color:var(--public-muted)}
.public-student-group__rows{display:grid;gap:.5rem}
</style>
