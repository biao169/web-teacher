<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount, useHead, useRoute, useRuntimeConfig } from '#imports'
import { useTransferSession } from '../composables/useTransferSession'
import AccountsAdmin from '../components/AccountsAdmin.vue'
import ShareAdmin from '../components/ShareAdmin.vue'
import VpnAdmin from '../components/VpnAdmin.vue'
import SettingField from '../components/SettingField.vue'
import { SETTINGS_SECTIONS, POLICY_FIELDS, defaultSettings, defaultRule, validateSubmission } from '../../shared/settings.mjs'
import type { SettingsSnapshot, ToolSettings } from '../../shared/client'
const route = useRoute()
const standalone = !!(useRuntimeConfig().public.fileTransfer as { standalone?: boolean })?.standalone
const visibleSections = computed(() => SETTINGS_SECTIONS.filter(section => section.id !== 'cloud' || session.value?.capabilities?.deployment === 'cloudflare'))
const zh = computed(() => route.query.lang !== 'en')
const locale = computed(() => zh.value ? 'zh' : 'en')
const { session, pending, error, refresh, auth } = useTransferSession()
const snapshot = ref<SettingsSnapshot | null>(null)
const draft = ref<ToolSettings>(defaultSettings())
const managerText = ref(''); const owner = ref('')
const loading = ref(false); const saving = ref(false); const loggingOut = ref(false)
const problem = ref(''); const success = ref(false); const fields = ref<Record<string, string>>({})
const manager = computed(() => !!session.value?.permissions.includes('transfer.manage'))
const managers = computed(() => managerText.value.split('\n').map(s => s.trim()).filter(Boolean))
const dirty = computed(() => !!snapshot.value && (JSON.stringify(draft.value) !== JSON.stringify(snapshot.value.settings) || JSON.stringify(managers.value) !== JSON.stringify(snapshot.value.managers)))
let generation = 0
function install(value: SettingsSnapshot) { snapshot.value = value; draft.value = structuredClone(value.settings); managerText.value = value.managers.join('\n'); fields.value = {}; success.value = false }
async function load() {
  const run = ++generation; const uid = session.value?.user?.uid
  loading.value = true; problem.value = ''
  try {
    const value = await $fetch<SettingsSnapshot>('/transfer-api/v1/admin/settings', { retry: 0, timeout: 6500 })
    if (run === generation && uid === session.value?.user?.uid) { install(value); owner.value = uid || '' }
  } catch { if (run === generation) problem.value = 'FT_READ_FAILED' }
  finally { if (run === generation) loading.value = false }
}
watch(session, value => {
  // A transient polling error must not discard an unsaved draft.
  if (!value) return
  if (owner.value && (value.user?.uid !== owner.value || !value.permissions.includes('transfer.manage'))) {
    ++generation; snapshot.value = null; draft.value = defaultSettings(); managerText.value = ''; owner.value = ''; loading.value = false; saving.value = false
  }
  if (value.permissions.includes('transfer.manage') && !snapshot.value && !loading.value) void load()
}, { immediate: true })
async function focusError() { await nextTick(); document.getElementById(`ft-${Object.keys(fields.value)[0]}`)?.focus() }
async function save() {
  if (!snapshot.value || !manager.value || saving.value) return
  problem.value = ''; fields.value = {}; success.value = false
  const submission = { revision: snapshot.value.revision, settings: JSON.parse(JSON.stringify(draft.value)), managers: managers.value }
  try { validateSubmission(submission) } catch (cause) { fields.value = (cause as { fields: Record<string,string> }).fields; problem.value = 'FT_VALIDATION'; await focusError(); return }
  const uid = owner.value; const run = ++generation
  saving.value = true
  try {
    const current = auth.session.value
    const value = await $fetch<SettingsSnapshot>('/transfer-api/v1/admin/settings', { method: 'PUT', body: submission, headers: current.authenticated ? { 'x-csrf-token': current.csrfToken } : {}, retry: 0, timeout: 6500 })
    if (run === generation && uid === owner.value) { install(value); success.value = true; void refresh() }
  } catch (cause) {
    if (run === generation) { const c = cause as { data?: { error?: { code?: string }; fields?: Record<string,string> } }; problem.value = c.data?.error?.code || 'FT_SAVE_FAILED'; fields.value = c.data?.fields || {}; await focusError() }
  } finally { if (run === generation) saving.value = false }
}
function defaults() { draft.value = defaultSettings(); fields.value = {}; problem.value = ''; success.value = false }
async function logout() { loggingOut.value = true; try { await auth.logout() } catch { problem.value = 'FT_LOGOUT_FAILED' } finally { loggingOut.value = false } }
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => { ++generation; window.removeEventListener('beforeunload', beforeUnload) })
useHead(() => ({ title: zh.value ? '文件快传管理' : 'File transfer management', htmlAttrs: { lang: zh.value ? 'zh-CN' : 'en' }, bodyAttrs: { class: 'ft-admin-body' }, meta: [{ name: 'robots', content: 'noindex,nofollow' }] }))
const links = [['lan-direct', '局域网直连', 'LAN direct'], ['wan-direct', '广域网直连', 'Internet direct'], ['server-relay', '中继', 'Relay'], ['temporary-share', '临时分享', 'Temporary share']]
</script>
<template>
  <div class="ft-admin">
    <header class="ft-admin-header"><NuxtLink class="ft-admin-brand" :to="`/${locale}/transfer`">↗ {{ zh ? '文件快传' : 'File transfer' }}</NuxtLink><div><NuxtLink :to="{ query: { ...route.query, lang: zh ? 'en' : 'zh' } }">{{ zh ? 'English' : '中文' }}</NuxtLink><NuxtLink v-if="!standalone" to="/admin">{{ zh ? '教师后台' : 'Website admin' }}</NuxtLink><button v-if="session?.authenticated" class="ft-text-button" :disabled="loggingOut" @click="logout">{{ zh ? '退出登录' : 'Sign out' }}</button></div></header>
    <main class="ft-admin-main">
      <p class="ft-eyebrow">{{ zh ? '管理中心' : 'MANAGEMENT' }}</p><h1>{{ zh ? '文件快传管理' : 'File transfer management' }}</h1>
      <p class="ft-muted">{{ zh ? '所有规则在此统一保存。局域网直传需核验网段并授予权限；远程直连需核验公网范围，中继和临时分享按权限及出口预算开放。' : 'Save all rules together. LAN transfers require verified ranges and access grants. Internet direct requires verified public ranges. Relay and sharing follow access and exit budgets.' }}</p>
      <section v-if="error" class="ft-panel" role="alert"><p>{{ zh ? '连接暂时中断，未保存的编辑仍保留。' : 'Connection lost. Unsaved edits are retained.' }}</p><button class="ft-button" :disabled="pending" @click="refresh">{{ zh ? '重新连接' : 'Reconnect' }}</button></section>
      <section v-else-if="!session" class="ft-panel" role="status">{{ zh ? '正在确认账号与权限…' : 'Checking your access…' }}</section>
      <section v-else-if="!session.authenticated" class="ft-panel"><h2>{{ zh ? '请先登录' : 'Please sign in' }}</h2><NuxtLink class="ft-button" :to="{ path: `/${locale}/login`, query: { next: route.fullPath } }">{{ zh ? '前往登录' : 'Sign in' }}</NuxtLink></section>
      <section v-else-if="!manager" class="ft-panel"><h2>{{ zh ? '尚未获得工具管理权限' : 'Tool management access required' }}</h2><p>{{ session.user?.name }}</p><p>{{ session.user?.mustChangePassword ? (zh ? '请先完成密码修改。' : 'Update your password first.') : (zh ? '请联系管理员单独授予文件快传管理权限。' : 'Ask an administrator for file transfer management access.') }}</p><p class="ft-muted">ID: <code>{{ session.user?.uid }}</code></p></section>
      <template v-if="snapshot && (manager || error)">
        <div class="ft-status"><span>{{ session?.user?.name || owner }} · {{ zh ? '配置版本' : 'Revision' }} {{ snapshot.revision }}</span><span>{{ zh ? '最近保存：' : 'Last saved: ' }}{{ snapshot.updatedAt }}</span></div>
        <nav class="ft-anchor-nav" :aria-label="zh ? '配置分区' : 'Settings sections'"><a v-for="section in visibleSections" :key="section.id" :href="`#ft-section-${section.id}`">{{ zh ? section.zh : section.en }}</a><a href="#ft-section-access">{{ zh ? '使用权限' : 'Access rules' }}</a><a href="#ft-section-managers">{{ zh ? '管理账号' : 'Managers' }}</a></nav>
        <AccountsAdmin v-if="standalone && manager" :zh="zh" :csrf-token="auth.session.value.csrfToken || ''" />
        <form @submit.prevent="save">
          <fieldset class="ft-form-fieldset" :disabled="saving">
            <section v-for="section in visibleSections" :id="`ft-section-${section.id}`" :key="section.id" class="ft-panel">
              <h2>{{ zh ? section.zh : section.en }}</h2>
              <div v-if="section.id === 'cloud' && session?.policy.cloudBudget" class="ft-status"><span>{{zh?'今日已计入：':'Today: '}}{{(Number(session.policy.cloudBudget.daily.usedBytes)/1e9).toFixed(3)}} GB</span><span>{{zh?'本月已计入：':'This month: '}}{{(Number(session.policy.cloudBudget.monthly.usedBytes)/1e9).toFixed(3)}} GB</span></div>
              <p v-if="section.id === 'cloud'" class="ft-notice">{{zh?'按 UTC 日/月累计中继与临时分享的申请窗口，上传＋下载合计，失败不退回。达到上限后停止申请新窗口。此项不包含网页、信令、R2 请求次数等费用，也无法统计用户 VPN；请同时在 Cloudflare 设置用量提醒。':'Relay and share windows are charged in both directions per UTC day/month, without refunds. Exhaustion blocks new windows. This does not meter page visits, signaling, R2 operations or client VPN usage; also configure Cloudflare usage alerts.'}}</p>
              <p v-if="section.id === 'links'" class="ft-muted">{{ zh ? '默认选择局域网，连接失败后由发送方明确选择其他方式并生成新链接。默认局域网不限速；角色/个人留空时继承全局速率。' : 'LAN is the default; after failure the sender chooses another option and creates a new link. LAN is unlimited by default; empty role/user rates inherit global rates.' }}</p>
              <p v-if="section.id === 'links'" class="ft-notice">{{ zh ? '请填写实际局域网网段，由管理员核验文件路由不经过 VPN 后勾选确认。浏览器隐藏地址或不在允许范围时会停止，不会自动改走中继。网站访问及配对信令仍可能占用 VPN 流量。' : 'Enter the actual LAN ranges and confirm only after checking that file routes bypass VPN. Hidden or unlisted addresses are blocked without relay fallback. Website visits and signaling may still use VPN traffic.' }}</p>
              <p v-if="section.id === 'personal'" class="ft-notice">{{ zh ? '个人额度按发送＋接收合计，等待连接时预留、获准连接时计入整项大小。开始后的失败和取消不退回。已登录用户按用户 ID 跨会话累计；匿名按浏览器身份累计，清除 Cookie 可重建身份。需要限制匿名总体用量时务必填写共享日／月上限。共享并发按任务计数。' : 'Allowances add sending and receiving. Waiting tasks reserve bytes; authorization charges the full task size without later refunds. Accounts persist across sessions; guests are per browser and can reset cookies. Set shared guest budgets to cap all anonymous use. Shared concurrency counts tasks.' }}</p>
              <p v-if="section.id === 'vpn'" class="ft-notice">{{ zh ? 'GB 与 GiB 仅改变显示及输入单位，已保存字节数不变。请选择实际出口并核验共用流量覆盖范围；网卡统计需要先校准当期已用量。严格模式在没有可核验出口硬限额时保持禁用；估算模式需要保留足够安全余量。' : 'GB/GiB changes display and input units without changing saved byte counts. Verify shared exit coverage; interface counters require initial usage calibration. Strict mode requires a verifiable enforced exit cap. Estimated mode needs a sufficient safety margin.' }}</p>
              <p v-if="section.id==='records'" class="ft-muted">{{zh?'恢复同一任务保留原授权计量，重传继续申请 VPN 预算。检查点只在确认写入后提交；浏览器大文件自动扩大间隔，减少重复复制，最多约 32 次提交。本机恢复记录由用户自选。更改配置会使旧任务失效。':'Recovery preserves the original authorization charge; retransmissions request VPN budget again. Checkpoints commit after writing. Large browser files use wider intervals, about 32 commits per file, to reduce repeated copying. Local recovery history is optional. Configuration changes invalidate old tasks.'}}</p>
              <p v-if="section.id === 'temporary' || section.id === 'records'" class="ft-muted">{{ zh ? '临时分享可在下方撤销与清理；到期自动停止领取，磁盘文件按周期删除。额度账本不含文件名或正文，必要账目至少保留 62 天，不受可选记录开关影响；启用记录时可延长保留期。' : 'Revoke or clean up shares below; expiry blocks retrieval immediately, and disk cleanup runs periodically. Required allowance records contain no filenames or contents and remain at least 62 days regardless of optional logging; enabled logging may extend retention.' }}</p>
              <div class="ft-form-grid"><SettingField v-for="field in section.fields" :key="field.key" v-model="draft[field.key]" :field="field" :path="field.key" :zh="zh" :unit="section.id==='vpn'?(draft.vpnBudgetUnit as 'GB'|'GiB'):undefined" :error="fields[field.key]" /></div>
              <p v-if="section.id==='temporary'" class="ft-muted">{{zh?'临时文件存放在私有服务器目录或私有 R2 桶；这不是端到端加密暂存。中继与暂存的清单上限为 256 KiB；默认保存时长与领取次数只影响新建分享。':'Temporary files use private server storage or R2; storage is not end-to-end encrypted. Relay and share manifests are limited to 256 KiB. Default lifetime and retrieval limits apply to new shares.'}}</p>
              <ShareAdmin v-if="section.id==='temporary' && manager" :zh="zh" :disabled="dirty || saving" :csrf-token="auth.session.value.authenticated ? auth.session.value.csrfToken : ''" />
              <p v-if="section.id==='links'" class="ft-notice">{{zh?'远程直连仅允许已核验绕开受限 VPN 的公网 IPv4 范围；隐藏地址时不能放行。受控中继复用本站 WebSocket，适合 UDP 不可用的网络。服务器与教师代理的文件路径必须一并核验，经过受限 VPN 时须接入统计和额度保护。':'Internet direct only permits verified public IPv4 ranges outside the limited VPN. Hidden routes stay blocked. Controlled relay uses this site’s WebSocket and works without UDP. Verify both server and teacher proxy file paths; limited VPN routes require metering and budget protection.'}}</p>
              <VpnAdmin v-if="section.id==='vpn' && manager" :zh="zh" :disabled="dirty || saving" :revision="snapshot.revision" :csrf-token="auth.session.value.authenticated ? auth.session.value.csrfToken : ''" />
            </section>
            <section id="ft-section-access" class="ft-panel"><h2>{{ zh ? '使用权限与个人限额' : 'Access & personal limits' }}</h2><p class="ft-muted">{{ zh ? '匹配顺序：个人覆盖 → 角色规则 → 登录用户默认；匿名使用独立规则。每条覆盖规则完整替代默认权限。管理权限不会自动授予传输权限。' : 'Priority: user override → role rule → signed-in default. Guests have a separate rule. Each match replaces the default access policy. Management does not grant transfer access.' }}</p>
              <p v-if="fields.rules" class="ft-field-error">{{ zh ? '请保留匿名与登录用户两条默认规则。' : 'Keep both guest and signed-in base rules.' }}</p>
              <article v-for="(rule, index) in draft.rules" :key="index" class="ft-rule">
                <div class="ft-rule-header"><h3>{{ rule.kind === 'anonymous' ? (zh ? '匿名访客' : 'Guests') : rule.kind === 'registered' ? (zh ? '登录用户默认' : 'Signed-in default') : (zh ? '覆盖规则' : 'Override') }}</h3><button v-if="index > 1" class="ft-text-button" type="button" @click="draft.rules.splice(index, 1)">{{ zh ? '移除规则' : 'Remove rule' }}</button></div>
                <div v-if="index > 1" class="ft-form-grid"><label class="ft-field">{{ zh ? '匹配类型' : 'Match type' }}<select v-model="rule.kind"><option value="role">{{ zh ? '角色 ID' : 'Role ID' }}</option><option value="user">{{ zh ? '用户 ID' : 'User ID' }}</option></select></label><label class="ft-field" :for="`ft-rules.${index}.id`">ID<input :id="`ft-rules.${index}.id`" v-model="rule.id" maxlength="200" :aria-invalid="!!fields[`rules.${index}.id`]"><span v-if="fields[`rules.${index}.id`]" class="ft-field-error">{{ zh ? '填写唯一有效 ID' : 'Enter a valid, unique ID' }}</span></label></div>
                <div class="ft-form-grid"><SettingField v-for="field in POLICY_FIELDS" :key="field.key" v-model="rule[field.key]" :field="field" :path="`rules.${index}.${field.key}`" :zh="zh" :error="fields[`rules.${index}.${field.key}`]" /></div>
                <p class="ft-muted">{{zh?'有效局域网速率：':'Effective LAN rate: '}}{{(rule.lanRateKbps ?? draft.lanRateKbps) === null ? (zh?'不限速':'Unlimited') : (rule.lanRateKbps ?? draft.lanRateKbps)+' Kbit/s'}} · {{rule.lanRateKbps===null?(zh?'继承全局':'Inherited from global'):(zh?'来自本条规则':'This rule')}}</p>
                <fieldset class="ft-link-options"><legend>{{ zh ? '允许使用的链路（仍需全局开放）' : 'Allowed connections (also require global availability)' }}</legend><label v-for="link in links" :key="link[0]"><input v-model="rule.links" type="checkbox" :value="link[0]">{{ link[zh ? 1 : 2] }}</label></fieldset>
              </article>
              <button class="ft-button ft-secondary" type="button" :disabled="draft.rules.length >= 52" @click="draft.rules.push(defaultRule())">＋ {{ zh ? '添加角色 / 个人规则' : 'Add role / user rule' }}</button>
            </section>
            <section id="ft-section-managers" class="ft-panel"><h2>{{ zh ? '工具管理账号' : 'Tool managers' }}</h2><label class="ft-field" for="ft-managers">{{ zh ? '每行一个用户 ID；统一保存后生效。当前管理员必须保留。' : 'One user ID per line. Keep your own ID. Grants apply on save.' }}<textarea id="ft-managers" v-model="managerText" rows="4" :aria-invalid="!!fields.managers" /><span v-if="fields.managers" class="ft-field-error">{{ zh ? '请保留自己，删除重复或无效 ID，最多 50 个。' : 'Keep your ID; remove invalid or duplicate IDs. Maximum 50.' }}</span></label><p class="ft-muted">{{ zh ? '首次授权及管理员账号失效后的恢复，仍使用服务器本地授权命令。' : 'Initial access and account recovery use the local server grant command.' }}</p></section>
          </fieldset>
          <div class="ft-save-bar"><div role="status"><span v-if="success && !dirty">{{ zh ? '已保存，重新打开页面仍可读取。' : 'Saved. Settings persist across restarts.' }}</span><span v-else>{{ dirty ? (zh ? '有未保存的修改' : 'Unsaved changes') : (zh ? '配置已同步' : 'Settings up to date') }}</span></div><div class="ft-actions"><button class="ft-text-button" type="button" :disabled="saving" @click="defaults">{{ zh ? '恢复默认到草稿' : 'Draft defaults' }}</button><button class="ft-button" type="submit" :disabled="saving || !manager || !dirty">{{ saving ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存全部配置' : 'Save all settings') }}</button></div></div>
        </form>
        <section class="ft-panel"><h2>{{ zh ? '最近配置变更' : 'Recent configuration changes' }}</h2><p class="ft-muted">{{ zh ? '保留最近 100 次变更，显示最近 20 次；不记录密码或文件正文。' : 'Retains 100 changes; shows the latest 20. No passwords or file contents.' }}</p><ol class="ft-audit"><li v-for="item in snapshot.audit" :key="item.revision"><span>#{{ item.revision }} · {{ item.changed_at }}</span><span>{{ item.changed_by }} · {{ item.action === 'settings-and-grants' ? (zh ? '保存配置与授权' : 'Saved settings and grants') : item.action }}</span></li></ol></section>
      </template>
      <p v-if="loading" role="status">{{ zh ? '正在读取配置…' : 'Loading settings…' }}</p>
      <section v-if="problem" class="ft-panel ft-error-panel" role="alert"><p>{{ problem === 'FT_CONFLICT' ? (zh ? '配置已被其他管理员修改。本次编辑已保留；请先核对，再决定是否读取最新配置。' : 'Another administrator changed the settings. Your draft is retained. Review it before loading the latest version.') : (zh ? '操作未完成，编辑内容已保留。请检查标出的字段、账号权限或服务连接。' : 'The operation did not finish. Your edits are retained. Check highlighted fields, access and connection.') }}</p><button v-if="problem === 'FT_CONFLICT' || (!snapshot && manager)" class="ft-button ft-secondary" :disabled="loading" @click="load">{{ zh ? '读取最新配置并替换本页草稿' : 'Load latest and replace this draft' }}</button></section>
    </main>
  </div>
</template>
<style src="../styles/transfer.css"></style>
