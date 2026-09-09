<script setup lang="ts">
import { ref,onMounted,onBeforeUnmount } from '#imports'
import { bytesToGB } from '../../shared/settings.mjs'
const props=defineProps<{zh:boolean;disabled:boolean;csrfToken:string}>()
interface Row{id:string;note:string;state:string;expiresAt:number;downloads:number;maxDownloads:number;summary:{files:number;totalBytes:string}}
interface Overview{items:Row[];count:number;reservedBytes:string;limitBytes:string}
const overview=ref<Overview|null>(null),busy=ref(false),problem=ref(''),result=ref('');let generation=0,mounted=false,timer:ReturnType<typeof setInterval>|undefined,controller:AbortController|undefined
async function load(){if(!mounted||busy.value)return;const run=++generation;controller?.abort();controller=new AbortController();try{const value=await $fetch<Overview>('/transfer-api/v1/admin/shares',{retry:0,timeout:6500,signal:controller.signal});if(run===generation){overview.value=value;problem.value=''}}catch{if(run===generation){overview.value=null;problem.value='load'}}}
async function action(kind:'cleanup'|'revoke',id?:string){if(props.disabled||busy.value)return;busy.value=true;const run=++generation;controller?.abort();try{const value=await $fetch<Overview&{removed?:number;failed?:number}>('/transfer-api/v1/admin/shares/action',{method:'PUT',body:kind==='cleanup'?{action:kind}:{action:kind,id},headers:{'x-csrf-token':props.csrfToken},retry:0,timeout:6500});if(run===generation){overview.value=value;problem.value='';result.value=kind==='cleanup'?(props.zh?`本次清理 ${value.removed||0} 项，待重试 ${value.failed||0} 项。`:`Removed ${value.removed||0}; pending retry ${value.failed||0}.`):(props.zh?'已撤销，正在终止相关领取。':'Revoked; active retrievals are stopping.')}}catch{if(run===generation)problem.value='action'}finally{if(run===generation)busy.value=false}}
onMounted(()=>{mounted=true;void load();timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},15000)})
onBeforeUnmount(()=>{mounted=false;++generation;controller?.abort();clearInterval(timer)})
const labels:Record<string,[string,string]>={uploading:['上传中','Uploading'],ready:['可领取','Ready'],revoked:['已撤销','Revoked'],failed:['待清理','Pending cleanup'],deleting:['清理待重试','Cleanup retry']}
</script>
<template>
 <div class="ft-share-admin">
  <div class="ft-selection-heading"><h3>{{zh?'暂存与领取':'Stored shares'}}</h3><div class="ft-actions"><button class="ft-text-button" type="button" :disabled="busy" @click="load">{{zh?'刷新暂存列表':'Refresh shares'}}</button><button class="ft-button ft-secondary" type="button" :disabled="busy||disabled" @click="action('cleanup')">{{zh?'清理到期及已撤销内容':'Clean expired and revoked shares'}}</button></div></div>
  <p v-if="overview" class="ft-muted">{{overview.count}} {{zh?'项分享，存储预留：':'shares; reserved storage: '}}{{bytesToGB(overview.reservedBytes)}} / {{bytesToGB(overview.limitBytes)}} GB</p>
  <p class="ft-muted">{{zh?'存储预留包含正文和文件系统开销余量。自动清理保留活动任务的文件，撤销后立即停止继续领取。列表显示最近 100 项，不展示私密分享链接。':'Storage reservation includes content and filesystem allowance. Cleanup retains active files; revocation stops further retrieval. The latest 100 items are shown, without private links.'}}</p>
  <p v-if="disabled" class="ft-muted">{{zh?'请先保存本页配置再操作。':'Save this page’s settings before acting.'}}</p>
  <ul v-if="overview?.items.length" class="ft-stored-list"><li v-for="item in overview.items" :key="item.id"><div><strong>{{item.note|| (zh?'未填写备注':'No note')}}</strong><small>{{item.summary.files}} {{zh?'个文件':'files'}} · {{bytesToGB(item.summary.totalBytes)}} GB · {{zh?'领取':'Retrievals'}} {{item.downloads}} / {{item.maxDownloads}} · {{new Date(item.expiresAt).toLocaleString()}}</small></div><span class="ft-badge">{{labels[item.state]?.[zh?0:1]||item.state}}</span><button v-if="item.state==='ready'||item.state==='uploading'" type="button" class="ft-text-button" :disabled="busy||disabled" @click="action('revoke',item.id)">{{zh?'撤销':'Revoke'}}</button></li></ul>
  <p v-else-if="overview" class="ft-muted">{{zh?'暂无暂存内容。':'No stored shares.'}}</p>
  <p v-if="problem" class="ft-notice" role="alert">{{zh?'操作未完成，请检查权限、连接与独立存储目录后重试。':'The operation did not finish. Check access, connection and storage before retrying.'}}</p><p v-if="result" class="ft-notice" role="status">{{result}}</p>
 </div>
</template>
