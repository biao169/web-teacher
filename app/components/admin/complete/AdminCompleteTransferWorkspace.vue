<script setup lang="ts">
import AdminFormItem from '../shared/AdminFormItem.vue'
import { ElAlert, ElButton, ElCard, ElCheckbox, ElCheckboxGroup, ElDescriptions, ElDescriptionsItem, ElDivider, ElForm, ElInput, ElMessage, ElMessageBox, ElRadioGroup, ElResult, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { ElRadioButton, ElTabPane, ElTabs } from '~/admin/element-plus-ts6'
import { downloadAdminTextFile } from '~/admin/download'
import { formatAdminDateTime as formatTime } from '~/admin/formatters'
import { hasAdminPermission } from '~~/shared/admin/registry'
import type { SafeUserView } from '~~/shared/contracts/auth'

type ExportFormat = 'backup' | 'json' | 'csv'
type RestoreMode = 'merge' | 'replace'
interface TransferTable { key: string; label: string; group: string; sensitive?: boolean }
interface ExportResponse { filename: string; mime: string; content: string; rows: number; mediaFilesIncluded?: boolean; mediaFiles?: number; mediaBytes?: number }
interface PreviewTable { name: string; rows: number; inserts: number; updates: number; deletes: number }
interface TransferPreview {
  tables: PreviewTable[]
  total: number
  inserts: number
  updates: number
  deletes: number
  digest: string
  schemaVersion: string
  currentSchemaVersion: string
  createdAt: string
  warnings: string[]
  configurationTables: string[]
  configurationRestored: boolean
  mediaFilesIncluded: boolean
  media: { managed: number; included: number; missing: number; bytes: number }
}
interface ApplyResponse {
  applied: number
  sessionsRevoked: boolean
  configurationTables: string[]
  configurationRestored: boolean
  requiresReload: boolean
  invalidatedCacheTags: string[]
  mediaFilesIncluded: boolean
  mediaFilesRestored: number
  mediaFilesCreated: number
  mediaFilesReused: number
}
interface RequestError { data?: { error?: { message?: unknown } }; message?: unknown }

const TABLES: TransferTable[] = [
  { key: 'site_settings', label: '网站设置', group: '配置' }, { key: 'global_settings', label: '全局设置', group: '配置', sensitive: true }, { key: 'navigation_items', label: '导航与按钮', group: '配置' },
  { key: 'profiles', label: '教师与团队', group: '人员与研究' }, { key: 'research_interests', label: '研究方向', group: '人员与研究' }, { key: 'students', label: '学生', group: '人员与研究' }, { key: 'student_category_displays', label: '学生分类显示', group: '人员与研究' },
  { key: 'publications', label: '论文', group: '科研成果' }, { key: 'projects', label: '项目', group: '科研成果' }, { key: 'patents', label: '专利与软件著作', group: '科研成果' },
  { key: 'news', label: '新闻动态', group: '内容与交流' }, { key: 'courses', label: '课程', group: '内容与交流' }, { key: 'messages', label: '联系留言', group: '内容与交流' },
  { key: 'media_assets', label: '媒体元数据', group: '资源与语言' }, { key: 'translation_cache', label: '翻译缓存', group: '资源与语言' },
  { key: 'auth_roles', label: '角色', group: '账号权限', sensitive: true }, { key: 'auth_users', label: '用户账号', group: '账号权限', sensitive: true }, { key: 'auth_permissions', label: '模块权限', group: '账号权限', sensitive: true },
]
const GROUPS = [...new Set(TABLES.map(item => item.group))]
const TABLE_LABELS = Object.fromEntries(TABLES.map(item => [item.key, item.label]))

const { request } = useCompleteAdminApi()
const auth = useAuthSession()
const route = useRoute()
const router = useRouter()
const currentUser = computed<SafeUserView | null>(() => auth.session.value.authenticated ? auth.session.value.user as unknown as SafeUserView : null)
const canExport = computed(() => hasAdminPermission(currentUser.value, 'import_export', 'export'))
const canPreview = computed(() => hasAdminPermission(currentUser.value, 'import_export', 'create'))
const canApply = computed(() => hasAdminPermission(currentUser.value, 'import_export', 'edit'))

const tab = ref(route.query.tab === 'restore' || route.query.tab === 'backup' ? 'restore' : 'export')
const selected = ref(TABLES.map(item => item.key))
const format = ref<ExportFormat>('backup')
const passphrase = ref('')
const passphraseConfirm = ref('')
const includeMediaFiles = ref(false)
const exportBusy = ref(false)
const lastExport = ref<{ filename: string; rows: number; mediaFiles: number; mediaBytes: number } | null>(null)

const fileName = ref('')
const fileSize = ref(0)
const content = ref('')
const importPassphrase = ref('')
const restoreMode = ref<RestoreMode>('merge')
const previewBusy = ref(false)
const applyBusy = ref(false)
const preview = ref<TransferPreview | null>(null)
const replacePhrase = ref('')

const groupedTables = computed(() => GROUPS.map(group => ({ group, tables: TABLES.filter(item => item.group === group) })))
const selectedSensitive = computed(() => TABLES.some(item => item.sensitive && selected.value.includes(item.key)))
const exportReady = computed(() => canExport.value && selected.value.length > 0 && (format.value !== 'csv' || selected.value.length === 1) && (format.value !== 'backup' || (passphrase.value.length >= 15 && passphrase.value === passphraseConfirm.value)))
const canApplyPreview = computed(() => Boolean(canApply.value && preview.value && (restoreMode.value !== 'replace' || replacePhrase.value === 'REPLACE')))

function tableLabel(key: string): string { return TABLE_LABELS[key] ?? key }
function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
function errorText(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback
  const error = value as RequestError
  const message = error.data?.error?.message ?? error.message
  return typeof message === 'string' && message ? message : fallback
}
function isCancelled(value: unknown): boolean {
  return value === 'cancel' || Boolean(value && typeof value === 'object' && (value as RequestError).message === 'cancel')
}
function selectAll(): void { selected.value = TABLES.map(item => item.key) }
function clearSelection(): void { selected.value = [] }
function invalidatePreview(): void { preview.value = null; replacePhrase.value = '' }
function changeFormat(value: ExportFormat): void {
  format.value = value
  lastExport.value = null
  if (value !== 'backup') { passphrase.value = ''; passphraseConfirm.value = ''; includeMediaFiles.value = false }
}
function changeMode(value: RestoreMode): void { restoreMode.value = value; invalidatePreview() }

async function exportData(): Promise<void> {
  if (!exportReady.value) return
  exportBusy.value = true
  try {
    const value = await request<ExportResponse>('/api/v1/admin/complete/import-export/export', { method: 'POST', body: { format: format.value, tables: selected.value, passphrase: format.value === 'backup' ? passphrase.value : undefined, includeMediaFiles: format.value === 'backup' && selected.value.includes('media_assets') && includeMediaFiles.value } })
    downloadAdminTextFile(value.filename, value.mime, value.content)
    lastExport.value = { filename: value.filename, rows: Number(value.rows ?? 0), mediaFiles: Number(value.mediaFiles ?? 0), mediaBytes: Number(value.mediaBytes ?? 0) }
    ElMessage.success(`已导出 ${value.rows ?? 0} 条记录${value.mediaFilesIncluded ? `和 ${value.mediaFiles ?? 0} 个媒体文件` : ''}`)
    passphrase.value = ''
    passphraseConfirm.value = ''
  } catch (value: unknown) { ElMessage.error(errorText(value, '导出失败')) }
  finally { exportBusy.value = false }
}

async function readFile(next: File): Promise<void> {
  if (next.size < 2 || next.size > 48 * 1024 * 1024) throw new Error('导入文件必须小于 48 MB 且不能为空')
  if (!/\.(?:acms|json)$/iu.test(next.name)) throw new Error('只接受 .acms 或 .json 文件')
  const value = await next.text()
  if (!value.trim().startsWith('{')) throw new Error('导入文件不是有效的 JSON 或加密备份封装')
  fileName.value = next.name
  fileSize.value = next.size
  content.value = value
  importPassphrase.value = ''
  invalidatePreview()
}
async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const next = input.files?.[0]
  if (!next) return
  try { await readFile(next) }
  catch (value: unknown) { clearFile(); ElMessage.error(errorText(value, '文件读取失败')) }
  finally { input.value = '' }
}
function clearFile(): void {
  fileName.value = ''; fileSize.value = 0; content.value = ''; importPassphrase.value = ''; invalidatePreview()
}
async function previewImport(): Promise<void> {
  if (!content.value || !canPreview.value) return
  previewBusy.value = true
  preview.value = null
  try {
    preview.value = await request<TransferPreview>('/api/v1/admin/complete/import-export/preview', { method: 'POST', body: { content: content.value, passphrase: importPassphrase.value, mode: restoreMode.value } })
    ElMessage.success('文件解密、结构、字段和冲突预检通过')
  } catch (value: unknown) { ElMessage.error(errorText(value, '导入预检失败')) }
  finally { previewBusy.value = false }
}
async function applyImport(): Promise<void> {
  const currentPreview = preview.value
  if (!canApplyPreview.value || !currentPreview) return
  const replace = restoreMode.value === 'replace'
  try {
    await ElMessageBox.confirm(
      replace ? `将替换 ${currentPreview.tables.length} 张表，并删除其中 ${currentPreview.deletes} 条未出现在备份内的记录。该操作只会整体成功或整体回滚。` : `将按稳定 UID 合并 ${currentPreview.total} 条记录，其中新增 ${currentPreview.inserts} 条、更新 ${currentPreview.updates} 条。`,
      replace ? '确认替换恢复' : '确认合并恢复',
      { type: 'warning', confirmButtonText: replace ? '确认替换' : '确认合并', cancelButtonText: '取消' },
    )
    applyBusy.value = true
    const value = await request<ApplyResponse>('/api/v1/admin/complete/import-export/apply', {
      method: 'POST',
      body: { content: content.value, passphrase: importPassphrase.value, digest: currentPreview.digest, mode: restoreMode.value, confirmation: replace ? 'REPLACE_ACADEMIC_CMS_DATA' : 'MERGE_ACADEMIC_CMS_DATA' },
    })
    clearFile()
    if (value.sessionsRevoked) {
      auth.clear()
      await ElMessageBox.alert(`已恢复 ${value.applied} 条记录，账号或权限数据已变更，全部活动 Session 已撤销。`, '恢复完成', { type: 'success', confirmButtonText: '重新登录' })
      window.location.assign('/admin/login')
      return
    }
    if (value.configurationRestored && value.requiresReload) {
      const mediaResult = value.mediaFilesIncluded ? `；同时恢复 ${value.mediaFilesRestored} 个媒体文件（新建 ${value.mediaFilesCreated}、复用 ${value.mediaFilesReused}）` : ''
      await ElMessageBox.alert(`已恢复 ${value.applied} 条记录，并失效 ${value.invalidatedCacheTags.length} 个相关缓存标签${mediaResult}。刷新后将重新装载网站、全局和导航配置。`, '配置恢复完成', { type: 'success', confirmButtonText: '刷新并应用' })
      window.location.reload()
      return
    }
    ElMessage.success(`已恢复 ${value.applied} 条记录${value.mediaFilesIncluded ? `和 ${value.mediaFilesRestored} 个媒体文件（新建 ${value.mediaFilesCreated}、复用 ${value.mediaFilesReused}）` : ''}`)
  } catch (value: unknown) {
    if (isCancelled(value)) return
    ElMessage.error(errorText(value, '恢复失败，数据库未发生部分写入'))
  } finally { applyBusy.value = false }
}

watch(tab, value => void router.replace({ query: { ...route.query, tab: value } }))
watch(selected, value => { if (!value.includes('media_assets')) includeMediaFiles.value = false }, { deep: true })
</script>

<template>
  <section class="transfer-page">
    <header><h1>导入导出与备份</h1><p>按稳定 UID 迁移数据，或生成包含完整敏感配置的加密整站备份。恢复始终先预检，再以单个原子事务写入。</p></header>
    <div class="admin-metric-grid">
      <article class="admin-metric-card"><small>支持的数据表</small><strong>18</strong><p>仅接受固定白名单</p></article>
      <article class="admin-metric-card"><small>在线恢复上限</small><strong>500 条</strong><p>更大数据应使用维护脚本</p></article>
      <article class="admin-metric-card"><small>文件请求上限</small><strong>48 MB</strong><p>解密后正文仍限制为 32 MB</p></article>
      <article class="admin-metric-card"><small>加密算法</small><strong>AES-256-GCM</strong><p>PBKDF2-SHA-256 · 600,000 次</p></article>
    </div>

    <ElTabs v-model="tab" class="transfer-tabs">
      <ElTabPane label="导出与加密备份" name="export">
        <ElCard shadow="never">
          <ElAlert v-if="!canExport" title="当前角色没有导出权限。" type="warning" show-icon :closable="false" />
          <ElForm label-position="top" class="export-form">
            <AdminFormItem label="导出格式">
              <ElRadioGroup :model-value="format" @change="changeFormat($event as ExportFormat)"><ElRadioButton value="backup">加密备份</ElRadioButton><ElRadioButton value="json">安全 JSON</ElRadioButton><ElRadioButton value="csv">单表 CSV</ElRadioButton></ElRadioGroup>
              <p class="admin-field-help">加密备份用于完整恢复；JSON/CSV 会排除敏感凭据，适合交换或分析。</p>
            </AdminFormItem>
            <ElAlert v-if="format === 'backup'" title="加密备份可包含密码哈希和 Provider 密钥。请妥善保存口令；系统无法找回，也不会把口令写入日志。" type="warning" show-icon :closable="false" />
            <ElAlert v-else title="JSON/CSV 会排除密码哈希和 Provider 密钥，适合数据分析；涉及用户账号的完整恢复应使用加密备份。" type="info" show-icon :closable="false" />
            <div class="selection-head"><strong>选择数据表（{{ selected.length }}/{{ TABLES.length }}）</strong><div><ElButton link type="primary" @click="selectAll">全选</ElButton><ElButton link @click="clearSelection">清空</ElButton></div></div>
            <div class="table-groups">
              <fieldset v-for="group in groupedTables" :key="group.group"><legend>{{ group.group }}</legend><ElCheckboxGroup v-model="selected"><ElCheckbox v-for="item in group.tables" :key="item.key" :value="item.key"><span>{{ item.label }}</span><ElTag v-if="item.sensitive" size="small" type="warning" effect="plain">敏感</ElTag></ElCheckbox></ElCheckboxGroup></fieldset>
            </div>
            <ElCheckbox v-if="format === 'backup' && selected.includes('media_assets')" v-model="includeMediaFiles" class="media-backup-option">
              同时备份受管理的媒体实体文件
            </ElCheckbox>
            <ElAlert v-if="format === 'backup' && selected.includes('media_assets') && includeMediaFiles" title="在线媒体快照最多包含 100 个对象、原始文件合计 24 MB；外部 HTTPS 链接和随源码发布的静态资源不会复制。超过上限时导出会安全终止。" type="info" show-icon :closable="false" />
            <ElAlert v-if="format === 'csv' && selected.length !== 1" title="CSV 每次只能选择一张表。" type="info" :closable="false" />
            <div v-if="format === 'backup'" class="passphrase-grid">
              <AdminFormItem label="备份口令（至少 15 个字符）" required><ElInput v-model="passphrase" type="password" show-password autocomplete="new-password" placeholder="请输入备份加密口令" /><p class="admin-field-help">仅用于本次文件加密，系统不会保存或记录该口令。</p></AdminFormItem>
              <AdminFormItem label="确认备份口令" required><ElInput v-model="passphraseConfirm" type="password" show-password autocomplete="new-password" placeholder="请再次输入备份口令" /><p class="admin-field-help">必须与备份口令完全一致；丢失后无法解密备份。</p></AdminFormItem>
              <ElAlert v-if="passphraseConfirm && passphrase !== passphraseConfirm" title="两次输入的备份口令不一致。" type="error" :closable="false" />
            </div>
            <div class="primary-actions"><ElButton type="primary" :loading="exportBusy" :disabled="!exportReady" @click="exportData">生成并下载</ElButton><span v-if="selectedSensitive && format === 'backup'">当前选择包含敏感配置，只会生成加密文件。</span></div>
          </ElForm>
          <ElResult v-if="lastExport" icon="success" title="导出文件已生成" :sub-title="`${lastExport.filename} · ${lastExport.rows} 条记录${lastExport.mediaFiles ? ` · ${lastExport.mediaFiles} 个媒体文件 / ${formatBytes(lastExport.mediaBytes)}` : ''}`" />
        </ElCard>
      </ElTabPane>

      <ElTabPane label="预检与恢复" name="restore">
        <ElCard shadow="never">
          <ElAlert title="请先下载当前数据库的加密备份。仅当文件内带有媒体快照时才恢复实体文件；对象写入会先校验，数据库失败时回滚本次新建对象。" type="warning" show-icon :closable="false" />
          <ElForm label-position="top" class="restore-form">
            <AdminFormItem label="备份或 JSON 文件" required>
              <div class="file-control"><label class="file-button"><input type="file" accept=".acms,.json,application/json,application/octet-stream" @change="onFile"><span>{{ fileName ? '更换文件' : '选择文件' }}</span></label><div v-if="fileName" class="file-meta"><strong>{{ fileName }}</strong><span>{{ formatBytes(fileSize) }}</span><ElButton link type="danger" @click="clearFile">移除</ElButton></div></div>
              <p class="admin-field-help">选择本系统生成的 .acms 加密备份或安全 JSON；文件会先预检，不会直接写入数据库。</p>
            </AdminFormItem>
            <AdminFormItem label="加密备份口令"><ElInput v-model="importPassphrase" type="password" show-password autocomplete="current-password" placeholder="普通 JSON 文件可留空" @input="invalidatePreview" /><p class="admin-field-help">仅 .acms 加密备份需要填写；口令只用于当前预检和恢复请求。</p></AdminFormItem>
            <AdminFormItem label="恢复模式">
              <ElRadioGroup :model-value="restoreMode" @change="changeMode($event as RestoreMode)"><ElRadioButton value="merge">按 UID 合并</ElRadioButton><ElRadioButton value="replace">替换所选表</ElRadioButton></ElRadioGroup>
              <p class="admin-field-help">合并模式保留文件外记录；替换模式会先清空文件列出的数据表。</p>
            </AdminFormItem>
            <ElAlert v-if="restoreMode === 'replace'" title="替换模式会清空文件中列出的表，再按依赖顺序恢复；外键、唯一约束或任一记录失败时全部回滚。" type="error" show-icon :closable="false" />
            <div class="primary-actions"><ElButton type="primary" plain :loading="previewBusy" :disabled="!content || !canPreview" @click="previewImport">解密并预检</ElButton><span v-if="!canPreview">当前角色没有导入预检权限。</span></div>
          </ElForm>

          <template v-if="preview">
            <ElDivider content-position="left">预检结果</ElDivider>
            <ElDescriptions :column="2" border class="preview-summary">
              <ElDescriptionsItem label="文件创建时间">{{ formatTime(preview.createdAt) }}</ElDescriptionsItem><ElDescriptionsItem label="Schema">{{ preview.schemaVersion }} → 当前 {{ preview.currentSchemaVersion }}</ElDescriptionsItem>
              <ElDescriptionsItem label="记录总数">{{ preview.total }}</ElDescriptionsItem><ElDescriptionsItem label="数据表">{{ preview.tables.length }}</ElDescriptionsItem>
              <ElDescriptionsItem label="新增 / 更新">{{ preview.inserts }} / {{ preview.updates }}</ElDescriptionsItem><ElDescriptionsItem label="预计删除">{{ preview.deletes }}</ElDescriptionsItem>
              <ElDescriptionsItem label="内容摘要" :span="2"><code>{{ preview.digest }}</code></ElDescriptionsItem>
              <ElDescriptionsItem label="配置生效" :span="2">{{ preview.configurationRestored ? `提交后失效缓存并刷新：${preview.configurationTables.map(tableLabel).join('、')}` : '本次文件不含运行配置表' }}</ElDescriptionsItem>
              <ElDescriptionsItem label="媒体实体文件" :span="2">{{ preview.mediaFilesIncluded ? '包含' : '不包含，仅恢复媒体元数据' }}</ElDescriptionsItem>
              <ElDescriptionsItem v-if="preview.mediaFilesIncluded" label="媒体快照" :span="2">{{ preview.media.included }} 个文件 · {{ formatBytes(preview.media.bytes) }}<template v-if="preview.media.missing"> · 缺少 {{ preview.media.missing }} 个受管理对象</template></ElDescriptionsItem>
            </ElDescriptions>
            <ElAlert v-for="warning in preview.warnings" :key="warning" :title="warning" type="warning" show-icon :closable="false" class="preview-warning" />
            <ElTable :data="preview.tables" border size="small" class="preview-table"><ElTableColumn label="数据表" min-width="170"><template #default="{ row }">{{ tableLabel(row.name) }}<small>{{ row.name }}</small></template></ElTableColumn><ElTableColumn prop="rows" label="文件记录" width="100" /><ElTableColumn prop="inserts" label="新增" width="90" /><ElTableColumn prop="updates" label="更新" width="90" /><ElTableColumn prop="deletes" label="删除" width="90" /></ElTable>
            <ElForm v-if="restoreMode === 'replace'" label-position="top" class="replace-confirm"><AdminFormItem label="输入 REPLACE 以启用替换恢复"><ElInput v-model="replacePhrase" autocomplete="off" placeholder="REPLACE" /><p class="admin-field-help">必须准确输入大写 REPLACE，防止误触发会删除现有记录的恢复模式。</p></AdminFormItem></ElForm>
            <div class="apply-row"><div><strong>{{ restoreMode === 'replace' ? '替换恢复' : '合并恢复' }}</strong><p>提交时会重新解密并核对摘要，预检后文件发生变化将被拒绝。</p></div><ElButton :type="restoreMode === 'replace' ? 'danger' : 'primary'" :loading="applyBusy" :disabled="!canApplyPreview" @click="applyImport">{{ restoreMode === 'replace' ? '执行替换恢复' : '执行合并恢复' }}</ElButton></div>
          </template>
        </ElCard>
      </ElTabPane>
    </ElTabs>
  </section>
</template>

<style scoped>
.transfer-page{display:grid;gap:1rem}.transfer-page>header h1{margin:0}.transfer-page>header p{margin:.45rem 0 0;color:var(--admin-muted)}.transfer-tabs{min-width:0}.export-form,.restore-form{display:grid;gap:.9rem}.selection-head,.primary-actions,.apply-row,.file-meta{display:flex;align-items:center;justify-content:space-between;gap:.75rem}.selection-head>div{display:flex;gap:.6rem}.table-groups{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem}.table-groups fieldset{min-width:0;margin:0;padding:.8rem;border:1px solid var(--admin-border);border-radius:var(--admin-radius)}.table-groups legend{padding:0 .35rem;color:var(--admin-muted);font-size:.78rem;font-weight:700}.table-groups .el-checkbox-group{display:grid;gap:.35rem}.table-groups .el-checkbox{height:auto;margin:0}.table-groups .el-checkbox span{display:inline-flex;align-items:center;gap:.35rem}.passphrase-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 1rem}.passphrase-grid>.el-alert{grid-column:1/-1}.primary-actions{justify-content:flex-start;color:var(--admin-muted);font-size:.78rem}.file-control{display:grid;gap:.65rem;width:100%}.file-button{display:inline-flex;width:max-content;cursor:pointer}.file-button input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.file-button span{padding:.55rem .9rem;border:1px solid var(--el-color-primary);border-radius:var(--el-border-radius-base);color:var(--el-color-primary);font-weight:650}.file-meta{justify-content:flex-start;padding:.75rem;border:1px solid var(--admin-border);border-radius:var(--admin-radius);background:var(--el-fill-color-lighter)}.file-meta span{color:var(--admin-muted)}.preview-summary{margin-top:1rem}.preview-summary code{word-break:break-all}.preview-warning{margin-top:.75rem}.preview-table{margin-top:1rem}.preview-table small{display:block;margin-top:.16rem;color:var(--admin-muted)}.replace-confirm{max-width:28rem;margin-top:1rem}.apply-row{margin-top:1rem;padding:1rem;border:1px solid var(--admin-border);border-radius:var(--admin-radius);background:var(--el-fill-color-lighter)}.apply-row p{margin:.3rem 0 0;color:var(--admin-muted);font-size:.78rem}@media(max-width:1000px){.table-groups{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:680px){.table-groups,.passphrase-grid{grid-template-columns:1fr}.selection-head,.primary-actions,.apply-row,.file-meta{align-items:flex-start;flex-direction:column}.passphrase-grid>*{grid-column:auto!important}}
</style>
