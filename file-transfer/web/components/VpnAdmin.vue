<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from '#imports'
import { unitToBytes, vpnReason } from '../../shared/vpn.mjs'
import type { VpnStatus } from '../../shared/client'
import VpnStatusCard from './VpnStatus.vue'
const props = defineProps<{zh:boolean;disabled:boolean;revision:number;csrfToken:string}>()
const state = ref<VpnStatus|null>(null), busy = ref(false), problem = ref(''), day = ref(''), month = ref(''), confirmed = ref(false)
let mounted=false, generation=0, timer:ReturnType<typeof setInterval>|undefined, controller:AbortController|undefined
async function load() {
  if(!mounted || busy.value) return
  const run=++generation;controller?.abort();controller=new AbortController()
  try { const data=await $fetch<VpnStatus>('/transfer-api/v1/admin/vpn',{retry:0,timeout:5000,signal:controller.signal});if(run===generation){state.value=data;problem.value=''} }
  catch { if(run===generation){state.value=null;problem.value='FT_METER_UNAVAILABLE'} }
}
async function action(kind:'calibrate'|'reconcile') {
  if(busy.value || props.disabled || !state.value) return
  busy.value=true;problem.value='';controller?.abort();const run=++generation
  try {
    const body=kind==='calibrate'?{revision:props.revision,dailyBytes:unitToBytes(day.value,state.value.unit),monthlyBytes:unitToBytes(month.value,state.value.unit)}:{revision:props.revision,observedAt:state.value.observedAt,confirm:confirmed.value}
    const data=await $fetch<VpnStatus>(`/transfer-api/v1/admin/vpn/${kind}`,{method:'PUT',body,headers:{'x-csrf-token':props.csrfToken},retry:0,timeout:5000})
    if(run===generation){state.value=data;confirmed.value=false;day.value='';month.value=''}
  } catch(e) {if(run===generation) problem.value=(e as {data?:{error?:{code?:string}}})?.data?.error?.code || 'FT_METER_INVALID'}
  finally {if(run===generation)busy.value=false}
}
onMounted(()=>{mounted=true;void load();timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},10000)})
onBeforeUnmount(()=>{mounted=false;++generation;controller?.abort();clearInterval(timer)})
watch(()=>props.revision,()=>{state.value=null;confirmed.value=false;void load()})
</script>
<template>
  <div class="ft-vpn-admin">
    <VpnStatusCard :value="state" :zh="zh" />
    <button type="button" class="ft-text-button" :disabled="busy" @click="load">{{zh?'刷新出口数据':'Refresh exit usage'}}</button>
    <p v-if="disabled" class="ft-muted">{{zh?'请先保存本页配置，再校准或对账。':'Save this page’s settings before calibrating or reconciling.'}}</p>
    <div v-if="state?.source==='interface'" class="ft-vpn-calibrate">
      <h3>{{zh?'填写已用流量':'Set usage already consumed'}}</h3>
      <p class="ft-muted">{{zh?'以供应商账单或可信出口记录填写当前周期已用量，包含开始采集前的共用流量。校准不会减少本周期已累计值。计数器重置后也在此恢复。':'Use billing or trusted exit records, including shared usage before collection began. Calibration never reduces accumulated usage in the current period. Use it after a counter reset too.'}}</p>
      <div class="ft-form-grid"><label class="ft-field" for="ft-vpn-day-used">{{zh?'今日已用':'Used today'}} · {{state.unit}}<input id="ft-vpn-day-used" v-model="day" type="text" inputmode="decimal" :disabled="disabled || busy"></label><label class="ft-field" for="ft-vpn-month-used">{{zh?'本月已用':'Used this month'}} · {{state.unit}}<input id="ft-vpn-month-used" v-model="month" type="text" inputmode="decimal" :disabled="disabled || busy"></label></div>
      <button type="button" class="ft-button ft-secondary" :disabled="disabled || busy || day==='' || month===''" @click="action('calibrate')">{{zh?'保存已用量并校准':'Save usage and calibrate'}}</button>
    </div>
    <p v-if="state?.source==='snapshot'" class="ft-muted">{{zh?'由服务器本地采集器持续导入当前日／月账单快照。文件格式和导入方法见随包的 VPN 使用说明；不要把账户密钥填入页面。':'A local collector imports current daily/monthly billing snapshots. The included VPN guide describes the format and import command; do not enter account secrets here.'}}</p>
    <div v-if="state && state.pendingBytes!=='0'" class="ft-vpn-reconcile"><p class="ft-muted">{{zh?'已发出的预留不会自动退回，避免统计延迟造成重复放行。请等待任务结束，并核对最新出口统计已包含这些任务后再对账；这不会清空已观测流量。':'Issued reservations are retained to prevent reuse during reporting delays. After tasks end, verify the latest exit usage includes them before reconciling. Observed usage is not cleared.'}}</p><label class="ft-check-field"><input v-model="confirmed" type="checkbox" :disabled="disabled || busy">{{zh?'已核对最新出口统计包含已结束任务':'I verified that the latest exit usage includes completed tasks'}}</label><button type="button" class="ft-button ft-secondary" :disabled="disabled || busy || !confirmed || state.activeReservations>0" @click="action('reconcile')">{{zh?'对账已结束预留':'Reconcile completed reservations'}}</button></div>
    <p v-if="problem" class="ft-notice" role="alert">{{problem==='FT_CONFLICT'?(zh?'配置或统计已变化，请刷新后重试。':'Settings or usage changed. Refresh and try again.'):vpnReason(problem,zh)}}</p>
    <details v-if="state?.audit?.length"><summary>{{zh?'最近校准与对账记录':'Recent calibration and reconciliation'}}</summary><ul class="ft-audit"><li v-for="(item,index) in state.audit" :key="index">{{new Date(item.at).toISOString()}} · {{item.actor}} · {{item.action==='calibrate'?(zh?'校准':'Calibration'):(zh?'确认对账':'Confirmed reconciliation')}}</li></ul></details>
  </div>
</template>
