<script setup lang="ts">
import CopyRecordButton from './CopyRecordButton.vue'
import type { PublicPublicationDetailViewModel } from '~~/shared/contracts/public-content'
import { PUBLIC_CITATION_LABELS, type PublicCitation } from '~~/shared/contracts/public-citation'
import { usePublicCitationStyle } from '~/composables/usePublicCitationStyle'
import CitationStyleControl from './CitationStyleControl.vue'
import CitationText from './CitationText.vue'
const props = defineProps<{ model: PublicPublicationDetailViewModel }>()
const selected = usePublicCitationStyle()
const citation = computed<PublicCitation>(() => props.model.item.citations.find(item => item.style === selected.value)
  ?? { style: selected.value, label: PUBLIC_CITATION_LABELS[selected.value], status: 'missing', text: '', highlights: [] })
const facts = computed(() => [
  { label: props.model.locale === 'zh' ? '期刊/会议' : 'Venue', value: props.model.item.venue },
  { label: props.model.locale === 'zh' ? '年份' : 'Year', value: props.model.item.year },
  { label: props.model.locale === 'zh' ? '卷' : 'Volume', value: props.model.item.volume },
  { label: props.model.locale === 'zh' ? '期' : 'Issue', value: props.model.item.issue },
  { label: props.model.locale === 'zh' ? '页码' : 'Pages', value: props.model.item.pages },
  { label: props.model.locale === 'zh' ? '论文类型' : 'Type', value: props.model.item.publicationType },
])
</script>
<template>
  <div>
    <PublicContentPageHero :meta="model.meta" :locale="model.locale" hide-description><template #actions><PublicUiButton v-if="model.item.externalUrl" :href="model.item.externalUrl" external show-external-icon variant="secondary">{{ model.locale === 'zh' ? '查看来源' : 'View source' }}</PublicUiButton><PublicUiButton v-if="model.item.doi" :href="`https://doi.org/${model.item.doi}`" external show-external-icon variant="ghost">DOI</PublicUiButton></template></PublicContentPageHero>
    <section class="public-content-section"><div class="public-container public-detail-layout public-detail-layout--wide">
      <main class="public-detail-main">
        <p v-if="model.item.authors" class="public-detail-lead">{{ model.item.authors }}</p>
        <PublicContentFactGrid :items="facts" />
        <div v-if="model.item.tags.length || model.item.indexTypes.length" class="public-tag-list"><span v-for="tag in [...model.item.indexTypes, ...model.item.tags]" :key="tag">{{ tag }}</span></div>
        <section class="public-detail-section">
          <CitationStyleControl :locale="model.locale" />
          <div class="public-citation-box">
            <CitationText :citation="citation" :locale="model.locale" />
            <CopyRecordButton v-if="citation.status !== 'missing'" module="publications" :locale="model.locale" :uid="model.item.uid" :label="model.item.title" text />
          </div>
        </section>
        <PublicContentLongText :title="model.locale === 'zh' ? '摘要' : 'Abstract'" :text="model.item.abstract" id="publication-abstract" />
        <section v-if="model.item.keywords.length" class="public-detail-section"><h2>{{ model.locale === 'zh' ? '关键词' : 'Keywords' }}</h2><div class="public-tag-list"><span v-for="keyword in model.item.keywords" :key="keyword">{{ keyword }}</span></div></section>
        <section v-if="model.item.bibtex" class="public-detail-section"><h2>BibTeX</h2><pre class="public-code-block"><code>{{ model.item.bibtex }}</code></pre></section>
      </main>
      <aside class="public-detail-aside"><PublicContentMediaLink :media="model.item.pdf" :label="model.locale === 'zh' ? '论文 PDF' : 'Publication PDF'" /><p v-if="model.item.correspondingAuthors"><strong>{{ model.locale === 'zh' ? '通讯作者' : 'Corresponding authors' }}</strong>{{ model.item.correspondingAuthors }}</p><p v-if="model.item.sourceCitation"><strong>{{ model.locale === 'zh' ? '原始引用' : 'Source citation' }}</strong>{{ model.item.sourceCitation }}</p></aside>
    </div></section>
  </div>
</template>
