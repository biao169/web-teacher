<script setup lang="ts">
import { computed, useRoute, useRouter, useHead } from '#imports'
import { useTransferSession } from '../composables/useTransferSession'
import FileWorkspace from '../components/FileWorkspace.vue'
import VpnStatus from '../components/VpnStatus.vue'
import { NETWORK_REASONS } from '../../shared/network.mjs'
import { vpnReason } from '../../shared/vpn.mjs'
import PairWorkspace from '../components/PairWorkspace.vue'
import { bytesToGB } from '../../shared/settings.mjs'
const route = useRoute(); const router = useRouter()
const locale = computed(() => route.path.startsWith('/en') ? 'en' : 'zh')
const zh = computed(() => locale.value === 'zh')
const mode = computed(() => route.query.mode === 'receive' ? 'receive' : 'send')
function switchMode(value: 'send' | 'receive') { void router.replace({ path: route.path, query: { ...route.query, mode: value } }) }
const { session, pending, error, refresh } = useTransferSession()
const policy = computed(() => session.value?.policy)
const paths = [
  { id: 'lan-direct', zh: '同网更快', en: 'Faster nearby', descZh: '双方在线，优先直接连接；经确认不走 VPN 的路径不占用该出口额度。', descEn: 'Both online. Direct paths confirmed outside your VPN avoid its traffic budget.' },
  { id: 'wan-direct', zh: '远程直连', en: 'Connect remotely', descZh: '双方在线；已核验绕开受限 VPN 的公网路径，可以直接传给对方。', descEn: 'Both online. Verified public paths outside the limited VPN can connect directly.' },
  { id: 'server-relay', zh: '中继接力', en: 'Relay fallback', descZh: '直连不成功时由中继接力，受速率和出口流量额度约束。', descEn: 'Helps when direct connections fail; rate and metered traffic limits apply.' },
  { id: 'temporary-share', zh: '稍后领取', en: 'Receive later', descZh: '临时保存到服务器，有保存时限和下载次数限制。', descEn: 'Temporary server storage with expiry and download limits.' },
]
function pathReason(id: string) {
  if (!policy.value) return zh.value ? '正在读取规则' : 'Checking rules'
  if (!policy.value.enabled) return zh.value ? '管理员尚未开放工具' : 'Tool not enabled'
  if (!policy.value.links.find(p => p.id === id)?.configured) return zh.value ? '管理员已关闭此方式' : 'Disabled by administrator'
  if (!policy.value.rule[mode.value] || !policy.value.rule.links.includes(id)) return zh.value ? '当前使用身份未获此权限' : 'Not allowed for your access level'
  if (id === 'lan-direct') return zh.value ? '配对后核验局域网链路' : 'Pair, then verify the LAN route'
  const reason=policy.value.links.find(p=>p.id===id)?.reason
  if(reason && reason!=='FT_NOT_IMPLEMENTED') return NETWORK_REASONS[reason]?.[zh.value?0:1]||vpnReason(reason,zh.value)
  if(policy.value.links.find(p=>p.id===id)?.available)return zh.value?'当前规则允许使用':'Available under your current policy'
  return zh.value ? '链路功能尚未开放' : 'Connection not available yet'
}
const sources:Record<string,[string,string]> = { anonymous:['匿名规则','Guest rule'], registered:['登录用户默认','Signed-in default'], role:['角色规则','Role rule'], user:['个人覆盖','User override'], global:['全局设置','Global setting'] }
const usageRows = computed(() => [{id:'personal',label:zh.value?'我的额度':'My allowance',value:policy.value?.usage?.personal}, {id:'guest-pool',label:zh.value?'所有匿名访客共享':'Shared by all guests',value:policy.value?.usage?.guestPool}].filter(row=>row.value))
function amount(value:string|null) { if(value===null) return zh.value?'不限总量':'Unlimited'; const n=BigInt(value);return n<1000000n?`${n} B`:`${n/1000000n}.${((n%1000000n)/10000n).toString().padStart(2,'0')} MB` }
function resetTime(value:number) { return new Intl.DateTimeFormat(zh.value?'zh-CN':'en-GB',{timeZone:policy.value?.usage?.timeZone,dateStyle:'short',timeStyle:'short'}).format(value) }
function sourceLabel(value?:string) {return (sources[value || ''] || ['—','—'])[zh.value?0:1]}
const lanRate = computed(() => policy.value ? policy.value.rule.lanRateKbps === null ? (zh.value ? '不限速' : 'Unlimited') : `${policy.value.rule.lanRateKbps} Kbit/s` : '—')
function sizeLimit(value: unknown) { return value === null ? (zh.value ? '不限制' : 'Unlimited') : typeof value === 'string' ? bytesToGB(value) + ' GB' : '—' }
useHead(() => ({ title: zh.value ? '文件快传' : 'File transfer', meta: [{ name: 'robots', content: 'noindex,nofollow' }] }))
</script>
<template>
  <section class="public-container ft-page">
    <nav class="ft-breadcrumb" :aria-label="zh ? '网页路径' : 'Breadcrumb'"><NuxtLink :to="`/${locale}`">{{ zh ? '首页' : 'Home' }}</NuxtLink><span aria-hidden="true">/</span><span>{{ zh ? '文件快传' : 'File transfer' }}</span></nav>
    <div class="ft-heading"><div><p class="ft-eyebrow">{{ zh ? '文件 · 文件夹 · 轻松分享' : 'Files · Folders · Simple sharing' }}</p><h1>{{ zh ? '文件快传' : 'File transfer' }}</h1><p>{{ zh ? '发送与接收，在一个熟悉的页面完成。' : 'Send and receive in one familiar place.' }}</p></div><NuxtLink v-if="session?.permissions.includes('transfer.manage')" class="ft-button ft-secondary" :to="{path:'/transfer-admin/',query:{lang:locale}}">{{ zh ? '管理工具' : 'Manage tool' }}</NuxtLink></div>
    <div class="ft-workspace">
      <div class="ft-tabs" :aria-label="zh ? '传输视图' : 'Transfer view'"><button :aria-pressed="mode === 'send'" :class="{ 'is-active': mode === 'send' }" @click="switchMode('send')">{{ zh ? '发送' : 'Send' }}</button><button :aria-pressed="mode === 'receive'" :class="{ 'is-active': mode === 'receive' }" @click="switchMode('receive')">{{ zh ? '接收' : 'Receive' }}</button></div>
      <PairWorkspace :mode="mode" :zh="zh" />
      <FileWorkspace :mode="mode" :zh="zh" :rule="policy?.rule" @switch-mode="switchMode" />
      <div class="ft-status" role="status"><span v-if="pending && !session">{{ zh ? '正在确认账号…' : 'Checking account…' }}</span><span v-else-if="error">{{ zh ? '暂时无法连接快传服务。' : 'Transfer service unavailable.' }} <button class="ft-text-button" :disabled="pending" @click="refresh">{{ zh ? '重试' : 'Retry' }}</button></span><span v-else>{{ session?.user ? (zh ? '当前账号：' : 'Signed in as: ') + session.user.name : (zh ? '匿名访问' : 'Guest access') }}<template v-if="session?.user?.mustChangePassword"> · {{ zh ? '请先修改密码' : 'Please update your password' }}</template></span><NuxtLink v-if="!session?.authenticated" :to="{path:`/${locale}/login`,query:{next:route.fullPath}}">{{ zh ? '登录账号' : 'Sign in' }}</NuxtLink></div>
    </div>
    <section class="ft-panel ft-policy" :aria-label="zh ? '当前使用规则' : 'Current policy'"><h2>{{ zh ? '使用前，看清规则' : 'Know your limits' }}</h2><p v-if="policy && !policy.enabled">{{ policy.notice[locale] }}</p><p>{{ zh ? '局域网单项速率：' : 'LAN rate per task: ' }}{{ lanRate }} · {{ zh ? '来源：' : 'From: ' }}{{ sourceLabel(policy?.rule.rateSource?.lan) }}</p><p v-if="policy">{{ zh ? '当前身份的预设权限：' : 'Configured access: ' }}{{ policy.rule.send ? (zh ? '允许发送' : 'Sending allowed') : (zh ? '禁止发送' : 'Sending denied') }} / {{ policy.rule.receive ? (zh ? '允许接收' : 'Receiving allowed') : (zh ? '禁止接收' : 'Receiving denied') }}</p><dl v-if="policy" class="ft-limit-grid"><div><dt>{{ zh ? '其他链路速率' : 'Other connection rate' }}</dt><dd>{{ policy.rule.wanRateKbps === null ? (zh ? '不限速' : 'Unlimited') : policy.rule.wanRateKbps + ' Kbit/s' }}</dd></div><div><dt>{{ zh ? '单文件 / 单任务' : 'Per file / per task' }}</dt><dd>{{ sizeLimit(policy.rule.maxFileBytes) }} / {{ sizeLimit(policy.rule.maxTaskBytes) }}</dd></div><div><dt>{{ zh ? '个人每日 / 每月总量' : 'Personal daily / monthly' }}</dt><dd>{{ sizeLimit(policy.rule.dailyBytes) }} / {{ sizeLimit(policy.rule.monthlyBytes) }}</dd></div><div><dt>{{ zh ? '文件数 / 同时任务数' : 'Files / concurrent tasks' }}</dt><dd>{{ policy.rule.maxFiles }} / {{ policy.rule.concurrency }}</dd></div></dl><p class="ft-muted">{{ zh ? '优先使用已核验的局域网；远程直连、中继和临时分享按当前权限与出口规则开放。访问网站、配对和服务器传输若经过 VPN，均可能消耗流量；出口状态见下方。' : 'Prefer verified LAN. Internet direct, relay and sharing follow your access and exit rules. Website visits, pairing and server transfers can consume VPN traffic; see the exit status below.' }}</p></section>
    <section v-if="policy?.usage" class="ft-panel ft-allowance" :aria-label="zh?'当前剩余额度':'Current allowance'">
      <div class="ft-selection-heading"><h2>{{zh?'额度清楚，放心传输':'See your allowance before sending'}}</h2><button class="ft-text-button" :disabled="pending" @click="refresh">{{zh?'刷新额度':'Refresh allowance'}}</button></div>
      <p class="ft-muted">{{zh?'当前匹配：':'Current policy: '}}{{sourceLabel(policy.rule.source)}} · {{policy.usage.timeZone}}</p>
      <p v-if="!policy.usage.established" class="ft-muted">{{zh?'首次连接后建立独立匿名身份。浏览器需允许本站 Cookie；匿名额度也受所有访客共享上限约束。':'An independent guest identity is created on first connection. Allow site cookies; the shared guest cap also applies.'}}</p>
      <article v-for="row in usageRows" :key="row.id" class="ft-allowance-row"><h3>{{row.label}} <span class="ft-badge">{{row.value!.activeTasks}} / {{row.value!.concurrency}} {{zh?'同时任务':'active tasks'}}</span></h3>
        <dl class="ft-limit-grid"><div v-for="period in (['daily','monthly'] as const)" :key="period"><dt>{{period==='daily'?(zh?'今日剩余':'Daily remaining'):(zh?'本月剩余':'Monthly remaining')}}</dt><dd>{{amount(row.value![period].remainingBytes)}}</dd><p class="ft-muted">{{zh?'已计入':'Charged'}} {{amount(row.value![period].usedBytes)}} · {{zh?'预留':'Reserved'}} {{amount(row.value![period].reservedBytes)}}</p><p class="ft-muted">{{zh?'重置：':'Resets: '}}{{resetTime(row.value![period].resetAt)}}</p></div></dl>
      </article>
      <p class="ft-muted">{{zh?'发送与接收合计；同账号给自己传输计两次。等待连接时预留额度，获准连接时按整项大小记账，归入开始时的日／月周期；此前取消释放预留，此后中断不退回。它不是 VPN 账单或实测网络流量。':'Sending and receiving are added; sending to yourself counts twice. Waiting tasks reserve allowance. Authorization charges the full size to the start-day/month; earlier cancellation releases reservations, later interruption does not refund them. This is not a VPN bill or measured network traffic.'}}</p>
    </section>
    <section class="ft-panel"><VpnStatus :value="policy?.vpn" :zh="zh" /></section>
    <div class="ft-benefits ft-connections"><article v-for="path in paths" :key="path.id"><h3>{{ zh ? path.zh : path.en }}</h3><p>{{ zh ? path.descZh : path.descEn }}</p><span class="ft-badge">{{ pathReason(path.id) }}</span></article></div>
  </section>
</template>
<style src="../styles/transfer.css"></style>
