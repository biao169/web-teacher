<script setup lang="ts">
import { RefreshCw, UserRound, WandSparkles } from '@lucide/vue'
import { ElAlert, ElButton, ElCheckbox, ElMessage, ElTag } from 'element-plus'
import { adminErrorDetails } from '~/admin/errors'
import {
  generatePublicationCitations,
  type PublicationGeneratedFields,
} from '~~/shared/admin/publication-tools'

type RecordValue = string | number | boolean | null
type GeneratedField = keyof PublicationGeneratedFields
interface HomepageProfile {
  uid: string
  name: string
  nameEn: string
  names: readonly string[]
}
interface HomepageProfileResponse { profile: HomepageProfile | null }
interface ProposalRow {
  field: GeneratedField
  label: string
  current: string
  generated: string
  selected: boolean
}

const props = withDefaults(defineProps<{
  record: Readonly<Record<string, RecordValue>>
  recordUid?: string
  disabled?: boolean
}>(), { recordUid: '', disabled: false })
const emit = defineEmits<{ apply: [fields: Partial<PublicationGeneratedFields>, source: string] }>()
const { request } = useCompleteAdminApi()

const loadingProfile = ref(false)
const profileLoaded = ref(false)
const profile = shallowRef<HomepageProfile | null>(null)
const profileError = ref('')
const warnings = ref<readonly string[]>([])
const proposal = ref<ProposalRow[]>([])

const fieldLabels: Readonly<Record<GeneratedField, string>> = Object.freeze({
  citation_gbt: 'GB/T 7714 引用',
  highlight_gbt: 'GB/T 高亮文本',
  citation_elsevier: 'Elsevier 引用',
  highlight_elsevier: 'Elsevier 高亮文本',
  citation_apa: 'APA 引用',
  highlight_apa: 'APA 高亮文本',
  citation_ieee: 'IEEE 引用',
  highlight_ieee: 'IEEE 高亮文本',
  bibtex: 'BibTeX',
})
const fieldOrder = Object.keys(fieldLabels) as GeneratedField[]
const selectedCount = computed(() => proposal.value.filter(row => row.selected).length)

function recordText(field: string): string {
  const value = props.record[field]
  return value === null || value === undefined ? '' : String(value)
}

async function extractHomepageProfile(showSuccess = true): Promise<readonly string[]> {
  if (loadingProfile.value) return profile.value?.names ?? []
  loadingProfile.value = true
  profileError.value = ''
  try {
    const response = await request<HomepageProfileResponse>('/api/v1/admin/complete/metadata/homepage-profile')
    profile.value = response.profile
    profileLoaded.value = true
    if (showSuccess) {
      if (response.profile) ElMessage.success('已提取主页教师的中英文名称。')
      else ElMessage.warning('当前没有可用的公开主页教师；仍可生成引用，高亮字段将留空。')
    }
    return response.profile?.names ?? []
  }
  catch (failure) {
    profileLoaded.value = true
    profile.value = null
    profileError.value = adminErrorDetails(failure, '主页教师姓名提取失败。').message
    return []
  }
  finally { loadingProfile.value = false }
}

async function generateAll(): Promise<void> {
  if (props.disabled) return
  const names = profileLoaded.value ? (profile.value?.names ?? []) : await extractHomepageProfile(false)
  const result = generatePublicationCitations({
    uid: props.recordUid,
    title: recordText('title'),
    authors: recordText('authors'),
    venue: recordText('venue'),
    year: recordText('year'),
    volume: recordText('volume'),
    issue: recordText('issue'),
    pages: recordText('pages'),
    doi: recordText('doi'),
    url: recordText('url'),
    publication_type: recordText('publication_type'),
  }, names)
  warnings.value = result.warnings
  proposal.value = fieldOrder.map(field => ({
    field,
    label: fieldLabels[field],
    current: recordText(field),
    generated: result.fields[field],
    selected: recordText(field) !== result.fields[field],
  }))
  if (!proposal.value.some(row => row.current !== row.generated)) ElMessage.info('现有引用字段已经是最新生成结果。')
}

function applySelected(): void {
  const fields: Partial<PublicationGeneratedFields> = {}
  for (const row of proposal.value) if (row.selected) fields[row.field] = row.generated
  if (!Object.keys(fields).length) return
  emit('apply', fields, '引用格式自动生成')
  proposal.value = []
}
</script>

<template>
  <div class="publication-generator">
    <div class="publication-generator__intro">
      <div>
        <strong>引用格式与教师姓名高亮</strong>
        <small>读取当前启用网站设置所指定的公开主页教师，并根据本页字段生成 GB/T、Elsevier、APA、IEEE 与 BibTeX。</small>
      </div>
      <div class="publication-generator__actions">
        <ElButton :loading="loadingProfile" :disabled="disabled" @click="extractHomepageProfile(true)">
          <UserRound :size="15" />{{ profileLoaded ? '重新提取教师姓名' : '提取主页教师姓名' }}
        </ElButton>
        <ElButton type="primary" :disabled="disabled" @click="generateAll">
          <WandSparkles :size="15" />生成全部引用格式
        </ElButton>
      </div>
    </div>

    <div v-if="profile" class="publication-generator__profile" aria-live="polite">
      <span>主页教师</span>
      <ElTag effect="plain">UID：{{ profile.uid }}</ElTag>
      <ElTag v-if="profile.name" type="success" effect="light">{{ profile.name }}</ElTag>
      <ElTag v-if="profile.nameEn" type="success" effect="light">{{ profile.nameEn }}</ElTag>
    </div>
    <ElAlert v-else-if="profileLoaded && !profileError" type="info" title="没有找到同时满足“主页指定、公开、启用”的教师记录；引用仍可生成，高亮字段将留空。" :closable="false" show-icon />
    <ElAlert v-if="profileError" type="warning" :title="profileError" :closable="false" show-icon>
      <template #default><ElButton text type="warning" :loading="loadingProfile" @click="extractHomepageProfile(true)"><RefreshCw :size="14" />重试提取</ElButton></template>
    </ElAlert>

    <div v-if="warnings.length" class="publication-generator__warnings">
      <ElAlert v-for="warning in warnings" :key="warning" type="warning" :title="warning" :closable="false" show-icon />
    </div>

    <div v-if="proposal.length" class="publication-generator__proposal">
      <header>
        <div><strong>生成结果预览</strong><small>勾选需要覆盖的字段；应用后仍需使用页面底部“保存”写入数据库，也可在对应输入框下方逐项撤销。</small></div>
        <ElButton type="primary" :disabled="disabled || selectedCount === 0" @click="applySelected">应用 {{ selectedCount }} 项</ElButton>
      </header>
      <div class="publication-generator__table-wrap">
        <table>
          <thead><tr><th>采用</th><th>字段</th><th>当前值</th><th>生成值</th></tr></thead>
          <tbody>
            <tr v-for="row in proposal" :key="row.field">
              <td><ElCheckbox v-model="row.selected" :disabled="disabled || row.current === row.generated" :aria-label="'应用' + row.label" /></td>
              <th scope="row">{{ row.label }}</th>
              <td><pre>{{ row.current || '（空）' }}</pre></td>
              <td><pre>{{ row.generated || '（空）' }}</pre></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.publication-generator{display:grid;gap:.75rem;margin-bottom:1rem;padding:.9rem;border:1px solid var(--el-border-color-lighter);border-radius:.7rem;background:var(--el-fill-color-extra-light)}
.publication-generator__intro,.publication-generator__proposal>header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.publication-generator__intro>div:first-child,.publication-generator__proposal>header>div{display:grid;gap:.2rem}.publication-generator small{color:var(--el-text-color-secondary);font-size:.75rem;line-height:1.55}.publication-generator__actions,.publication-generator__profile{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}.publication-generator__profile>span{color:var(--el-text-color-secondary);font-size:.75rem;font-weight:700}.publication-generator__warnings{display:grid;gap:.4rem}.publication-generator__proposal{display:grid;gap:.65rem;padding-top:.75rem;border-top:1px solid var(--el-border-color-lighter)}.publication-generator__table-wrap{overflow:auto}.publication-generator table{width:100%;min-width:48rem;border-collapse:collapse;font-size:.77rem}.publication-generator th,.publication-generator td{padding:.55rem;border-top:1px solid var(--el-border-color-lighter);text-align:left;vertical-align:top}.publication-generator thead th{border-top:0;color:var(--el-text-color-secondary)}.publication-generator tbody th{width:9.5rem}.publication-generator td:first-child{width:3.5rem}.publication-generator pre{max-width:34rem;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.55}@media(max-width:760px){.publication-generator__intro,.publication-generator__proposal>header{flex-direction:column}.publication-generator__actions{width:100%}}
</style>
