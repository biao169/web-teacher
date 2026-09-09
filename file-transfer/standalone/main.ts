import {createApp} from 'vue'
import {createRouter,createWebHistory,RouterLink} from 'vue-router'
import {ofetch} from 'ofetch'
import App from './App.vue'
import Transfer from '../web/public/transfer.vue'
import Admin from '../web/admin/index.vue'
import Login from './Login.vue'
import '../web/styles/transfer.css'
import './standalone.css'
;(globalThis as any).$fetch=ofetch.create({retry:0})
const router=createRouter({history:createWebHistory(),routes:[{path:'/:locale(zh|en)/transfer',component:Transfer},{path:'/transfer-admin/:rest(.*)*',component:Admin},{path:'/:locale(zh|en)/login',component:Login},{path:'/setup',component:Login},{path:'/:pathMatch(.*)*',redirect:'/zh/transfer'}],scrollBehavior(to){return to.hash?{el:to.hash,top:100}:{top:0}}})
createApp(App).component('NuxtLink',RouterLink).use(router).mount('#app')
