<script setup lang="ts">
import {onMounted,computed} from 'vue'
import {useRoute} from 'vue-router'
import {useAuthSession} from './imports'
const auth=useAuthSession(),route=useRoute(),zh=computed(()=>route.params.locale!=='en'&&route.query.lang!=='en');onMounted(()=>auth.load().catch(()=>{}))
</script>
<template><header class="ft-site-header"><NuxtLink to="/zh/transfer" class="ft-logo"><span aria-hidden="true">↗</span>{{zh?'文件快传':'File transfer'}}<small>{{zh?'轻松连接 · 自在分享':'Connect & share'}}</small></NuxtLink><nav><NuxtLink :to="`/${zh?'zh':'en'}/transfer`">{{zh?'发送 / 接收':'Send / receive'}}</NuxtLink><span v-if="auth.session.value.authenticated" class="ft-account-name">{{auth.session.value.user?.name}}</span><button v-if="auth.session.value.authenticated" class="ft-button ft-secondary" @click="auth.logout">{{zh?'退出':'Sign out'}}</button><NuxtLink v-else class="ft-button ft-secondary" :to="`/${zh?'zh':'en'}/login`">{{zh?'登录':'Sign in'}}</NuxtLink></nav></header><RouterView/><footer class="ft-site-footer">{{zh?'文件与文件夹，按你的方式传递。':'Files and folders, shared your way.'}}</footer></template>
