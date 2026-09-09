<script setup lang="ts">
import { bytesToUnit, vpnReason } from '../../shared/vpn.mjs'
import type { VpnStatus } from '../../shared/client'
const props = defineProps<{ value: VpnStatus | null | undefined; zh: boolean }>()
function amount(value:string|null) { return value===null ? (props.zh?'待核验':'Unverified') : `${bytesToUnit(value,props.value?.unit)} ${props.value?.unit || 'GB'}` }
function at(value:number) { return new Intl.DateTimeFormat(props.zh?'zh-CN':'en-GB',{timeZone:props.value?.timeZone,dateStyle:'short',timeStyle:'medium'}).format(value) }
</script>
<template>
  <div class="ft-vpn-status" :aria-label="zh?'VPN 出口额度':'VPN exit budget'">
    <div class="ft-selection-heading"><h3>{{zh?'出口额度，一眼看清':'Your exit budget at a glance'}}</h3><span class="ft-badge">{{value?.mode==='strict'?(zh?'严格保护':'Strict protection'):(zh?'估算保护':'Estimated protection')}}</span></div>
    <p v-if="!value" class="ft-muted">{{zh?'正在读取出口统计…':'Loading exit usage…'}}</p>
    <template v-else>
      <p class="ft-notice" :role="value.warning?'alert':'status'">{{value.reason?vpnReason(value.reason,zh):value.warning?(zh?'VPN 剩余额度偏低，请留意用量，优先使用已核验局域网。':'The VPN budget is running low. Watch usage and prefer verified LAN transfers.'):(zh?'当前估算额度可用；已开放的受控链路仍按权限与逐块预算执行。':'Estimated budget is available; enabled controlled paths still enforce access and chunk budgets.')}}</p>
      <dl class="ft-limit-grid"><div v-for="period in (['daily','monthly'] as const)" :key="period"><dt>{{period==='daily'?(zh?'今日可用':'Available today'):(zh?'本月可用':'Available this month')}}</dt><dd>{{amount(value[period].remainingBytes)}}</dd><p>{{zh?'已观测：':'Observed: '}}{{amount(value[period].usedBytes)}} / {{amount(value[period].limitBytes)}}</p><p>{{zh?'安全余量：':'Safety margin: '}}{{amount(value[period].safetyBytes)}}</p><p>{{zh?'重置：':'Resets: '}}{{at(value[period].resetAt)}}</p></div></dl>
      <p class="ft-muted">{{zh?'任务预留：':'Reserved: '}}{{amount(value.reservedBytes)}} · {{zh?'待对账：':'Pending reconciliation: '}}{{amount(value.pendingBytes)}} · {{value.timeZone}}</p>
      <p class="ft-muted">{{zh?'最近统计：':'Last sample: '}}{{value.observedAt?at(value.observedAt):(zh?'尚无数据':'No data')}}</p>
      <p class="ft-muted">{{zh?'计费方向：':'Billing: '}}{{value.billing==='both'?(zh?'上传＋下载':'Upload + download'):value.billing==='outbound'?(zh?'仅上传出口':'Outbound only'):(zh?'仅下载入口':'Inbound only')}} · {{value.source==='interface'?(zh?'本机网卡统计':'Local interface statistics'):value.source==='snapshot'?(zh?'外部账单／网关快照':'External billing / gateway snapshot'):(zh?'统计未接入':'Source not connected')}}</p>
      <p class="ft-muted">{{zh?'这是周期采样的估算数据，包含所选出口的共用流量。未接入可核验硬限额时，严格模式会关闭计费链路；已核验不经过该出口的局域网仍按原权限使用。':'These sampled estimates include traffic sharing the selected exit. Strict mode closes metered paths until an enforced exit cap is verifiable. Verified LAN paths outside that exit keep their existing access rules.'}}</p>
    </template>
  </div>
</template>
