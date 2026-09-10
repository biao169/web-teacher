<script setup lang="ts">
import { RotateCcw, Search, WandSparkles } from '@lucide/vue'
import { ElAlert, ElButton, ElCheckbox, ElInput, ElMessage, ElTag } from 'element-plus'
import { ElOption, ElSelect } from '~/admin/element-plus-ts6'
import { adminErrorDetails } from '~/admin/errors'
import {
  PUBLICATION_METADATA_PROVIDER_LABELS,
  PUBLICATION_METADATA_PROVIDERS,
  parsePublicationCitation,
  type PublicationCitationFormat,
  type PublicationMetadataFields,
  type PublicationMetadataProvider,
} from '~~/shared/admin/publication-tools'

type PublicationField = keyof PublicationMetadataFields
type PublicationValue = string | number
interface ProposalRow {
  field: PublicationField
  current: string | number | boolean | null
  proposed: PublicationValue
  selected: boolean
}
interface LookupAttempt {
  provider: PublicationMetadataProvider
  status: 'success' | 'not_found' | 'rate_limited' | 'temporary_failure' | 'unavailable'
  message: string
}
interface LookupResponse {
  query: { mode: 'doi' | 'title'; value: string }
  requestedProvider: PublicationMetadataProvider | 'auto'
  selectedProvider: PublicationMetadataProvider | null
  availableProviders: readonly PublicationMetadataProvider[]
  attempts: readonly LookupAttempt[]
  result: {
    provider: PublicationMetadataProvider
    matchScore: number
    fields: PublicationMetadataFields
  } | null
}

const props = withDefaults(defineProps<{
  sourceCitation?: string | null
  record: Readonly<Record<string, string | number | boolean | null>>
  disabled?: boolean
  appliedCount?: number
}>(), { sourceCitation: '', disabled: false, appliedCount: 0 })
const emit = defineEmits<{
  'update:sourceCitation': [value: string]
  apply: [fields: PublicationMetadataFields, source: string]
  'undo-all': []
}>()
const { request } = useCompleteAdminApi()

const provider = ref<PublicationMetadataProvider | 'auto'>('auto')
const availableProviders = ref<readonly PublicationMetadataProvider[]>(PUBLICATION_METADATA_PROVIDERS)
const loading = ref(false)
const error = ref('')
const attempts = ref<readonly LookupAttempt[]>([])
const proposal = ref<ProposalRow[]>([])
const proposalSource = ref('')
const parseFormat = ref<PublicationCitationFormat | null>(null)
const parseConfidence = ref<number | null>(null)
const parseNotes = ref<readonly string[]>([])

const providerOptions = computed(() => [
  { value: 'auto', label: '自动换源' },
  ...availableProviders.value.map(value => ({
    value,
    label: PUBLICATION_METADATA_PROVIDER_LABELS[value],
  })),
])
const selectedCount = computed(() => proposal.value.filter(row => row.selected).length)
const formatLabel = computed(() => {
  const labels: Record<PublicationCitationFormat, string> = {
    bibtex: 'BibTeX', ieee: 'IEEE', apa: 'APA 7', gbt: 'GB/T 7714—2025', elsevier: 'Elsevier numbered', generic: '通用格式',
  }
  return parseFormat.value ? labels[parseFormat.value] : ''
})

const fieldLabels: Readonly<Record<PublicationField, string>> = Object.freeze({
  title: '论文题名',
  authors: '作者列表',
  venue: '期刊或会议',
  year: '年份',
  volume: '卷号',
  issue: '期号',
  pages: '页码/文章号',
  doi: 'DOI',
  url: '外部链接',
  publication_type: '论文类型',
  corresponding_authors: '通讯作者',
  abstract: '摘要',
  keywords: '关键词',
})

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '（空）'
  return String(value)
}

function setProposal(fields: PublicationMetadataFields, source: string): void {
  const rows: ProposalRow[] = []
  for (const [rawField, rawValue] of Object.entries(fields)) {
    const field = rawField as PublicationField
    if (!Object.hasOwn(fieldLabels, field) || rawValue === undefined || rawValue === null || rawValue === '') continue
    const proposed = typeof rawValue === 'number' ? rawValue : String(rawValue).trim()
    if (String(props.record[field] ?? '') === String(proposed)) continue
    rows.push({ field, current: props.record[field] ?? null, proposed, selected: true })
  }
  proposal.value = rows
  proposalSource.value = source
  if (!rows.length) ElMessage.info('没有发现需要更新的字段。')
}

function parseCitation(): void {
  error.value = ''
  attempts.value = []
  const result = parsePublicationCitation(props.sourceCitation)
  parseFormat.value = result.format
  parseConfidence.value = result.confidence
  parseNotes.value = result.notes
  if (!Object.keys(result.fields).length) {
    proposal.value = []
    error.value = result.notes[0] ?? '未能从引文中解析出可用字段。'
    return
  }
  setProposal(result.fields, formatLabel.value + ' 引文解析')
}

async function lookupFrom(preferred: 'doi' | 'title' | 'auto' = 'auto'): Promise<void> {
  if (loading.value || props.disabled) return
  const doi = String(props.record.doi ?? '').trim()
  const title = String(props.record.title ?? '').trim()
  const mode = preferred === 'auto' ? (doi ? 'doi' : 'title') : preferred
  const queryValue = mode === 'doi' ? doi : title
  if (!queryValue) {
    ElMessage.warning('请先填写' + (mode === 'doi' ? ' DOI' : '论文题名') + '。')
    return
  }
  loading.value = true
  error.value = ''
  attempts.value = []
  parseFormat.value = null
  parseConfidence.value = null
  parseNotes.value = []
  proposal.value = []
  try {
    const response = await request<LookupResponse>('/api/v1/admin/complete/metadata/publication', {
      query: { [mode]: queryValue, provider: provider.value },
    })
    availableProviders.value = response.availableProviders.length ? response.availableProviders : availableProviders.value
    attempts.value = response.attempts
    if (!response.result) {
      error.value = provider.value === 'auto'
        ? '所有已配置来源均未返回可用结果。请选择具体来源重试，或检查题名/DOI。'
        : '当前来源未返回可用结果，请切换来源重试。'
      return
    }
    if (mode === 'title' && response.result.matchScore < 0.55) {
      error.value = '找到的题名相似度仅为 ' + Math.round(response.result.matchScore * 100) + '%，请逐项核对后再应用。'
    }
    setProposal(response.result.fields, response.result.provider + ' 联网查验')
  }
  catch (failure) {
    error.value = adminErrorDetails(failure, '论文元数据查验失败。').message
  }
  finally { loading.value = false }
}

function applySelected(): void {
  const fields: PublicationMetadataFields = {}
  for (const row of proposal.value) {
    if (row.selected) fields[row.field] = row.proposed as never
  }
  if (!Object.keys(fields).length) return
  emit('apply', fields, proposalSource.value)
  proposal.value = []
}

function statusTone(status: LookupAttempt['status']): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'success') return 'success'
  if (status === 'rate_limited' || status === 'temporary_failure') return 'warning'
  if (status === 'not_found') return 'info'
  return 'danger'
}

function statusLabel(status: LookupAttempt['status']): string {
  return {
    success: '成功',
    not_found: '未找到',
    rate_limited: '受限',
    temporary_failure: '暂时失败',
    unavailable: '不可用',
  }[status]
}

defineExpose({ lookupFrom })
</script>

<template>
  <div class="publication-assistant">
    <ElInput
      :model-value="sourceCitation ?? ''"
      type="textarea"
      :rows="6"
      resize="vertical"
      :disabled="disabled"
      placeholder="粘贴 IEEE、Elsevier、APA、GB/T 或 BibTeX 引文"
      @update:model-value="value => emit('update:sourceCitation', String(value))"
    />
    <div class="publication-assistant__toolbar">
      <ElButton :disabled="disabled || !String(sourceCitation ?? '').trim()" @click="parseCitation">
        <WandSparkles :size="15" />解析引文
      </ElButton>
      <ElSelect v-model="provider" :disabled="disabled || loading" aria-label="论文查新来源">
        <ElOption v-for="option in providerOptions" :key="option.value" :label="option.label" :value="option.value" />
      </ElSelect>
      <ElButton :loading="loading" :disabled="disabled || (!record.doi && !record.title)" @click="lookupFrom('auto')">
        <Search :size="15" />按 DOI/题名查验
      </ElButton>
      <ElButton v-if="appliedCount" plain :disabled="disabled" @click="emit('undo-all')">
        <RotateCcw :size="15" />撤销本次填充（{{ appliedCount }}）
      </ElButton>
    </div>

    <div v-if="parseFormat" class="publication-assistant__parse-summary">
      <ElTag type="success" effect="light">{{ formatLabel }}</ElTag>
      <span>解析置信度 {{ Math.round((parseConfidence ?? 0) * 100) }}%</span>
      <span v-for="note in parseNotes" :key="note">{{ note }}</span>
    </div>

    <div v-if="attempts.length" class="publication-assistant__attempts" aria-label="查新来源结果">
      <div v-for="attempt in attempts" :key="attempt.provider">
        <ElTag :type="statusTone(attempt.status)" effect="light">{{ attempt.provider }} · {{ statusLabel(attempt.status) }}</ElTag>
        <span>{{ attempt.message }}</span>
      </div>
    </div>

    <ElAlert v-if="error" :type="proposal.length ? 'warning' : 'error'" :title="error" show-icon :closable="false" />

    <div v-if="proposal.length" class="publication-assistant__proposal">
      <header>
        <div><strong>待应用字段</strong><small>{{ proposalSource }}；只会写入勾选项，保存前仍可修改或撤销。</small></div>
        <ElButton type="primary" :disabled="disabled || selectedCount === 0" @click="applySelected">应用 {{ selectedCount }} 项</ElButton>
      </header>
      <div class="publication-assistant__table-wrap">
        <table>
          <thead><tr><th>采用</th><th>字段</th><th>当前值</th><th>候选值</th></tr></thead>
          <tbody>
            <tr v-for="row in proposal" :key="row.field">
              <td><ElCheckbox v-model="row.selected" :disabled="disabled" :aria-label="'应用' + fieldLabels[row.field]" /></td>
              <th scope="row">{{ fieldLabels[row.field] }}</th>
              <td>{{ displayValue(row.current) }}</td>
              <td>{{ displayValue(row.proposed) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.publication-assistant{display:grid;width:100%;gap:.75rem}
.publication-assistant__toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
.publication-assistant__toolbar :deep(.el-select){width:10rem}
.publication-assistant__parse-summary{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;color:var(--el-text-color-secondary);font-size:.76rem}
.publication-assistant__attempts{display:grid;gap:.4rem}
.publication-assistant__attempts>div{display:flex;align-items:center;gap:.5rem;color:var(--el-text-color-secondary);font-size:.76rem}
.publication-assistant__proposal{display:grid;gap:.65rem;padding:.8rem;border:1px solid var(--el-border-color-lighter);border-radius:.65rem}
.publication-assistant__proposal>header{display:flex;align-items:center;justify-content:space-between;gap:.75rem}
.publication-assistant__proposal>header>div{display:grid;gap:.2rem}
.publication-assistant__proposal small{color:var(--el-text-color-secondary)}
.publication-assistant__table-wrap{overflow:auto}
.publication-assistant table{width:100%;min-width:42rem;border-collapse:collapse;font-size:.78rem}
.publication-assistant th,.publication-assistant td{padding:.55rem;border-top:1px solid var(--el-border-color-lighter);text-align:left;vertical-align:top;line-height:1.55;overflow-wrap:anywhere}
.publication-assistant thead th{border-top:0;color:var(--el-text-color-secondary);font-weight:650}
.publication-assistant tbody th{width:8rem}
.publication-assistant td:first-child{width:3.5rem}
@media(max-width:720px){.publication-assistant__proposal>header{align-items:flex-start;flex-direction:column}.publication-assistant__toolbar :deep(.el-select){width:100%}}
</style>
