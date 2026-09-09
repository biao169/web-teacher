import { ref, watchEffect, onBeforeUnmount } from 'vue'
export * from 'vue'
export { useRoute,useRouter } from 'vue-router'
const app={}
const session=ref<any>({authenticated:false,csrfToken:''})
const auth={session,async load(){const s=await (globalThis as any).$fetch('/transfer-api/v1/auth/status');session.value=s;return s},async logout(){await (globalThis as any).$fetch('/transfer-api/v1/auth/logout',{method:'POST',body:{},headers:{'x-csrf-token':session.value.csrfToken}});await auth.load()}}
export const useNuxtApp=()=>app
export const useRuntimeConfig=()=>({public:{fileTransfer:{standalone:true}}})
export const useAuthSession=()=>auth
export function useHead(value:any){const stop=watchEffect(()=>{const v=typeof value==='function'?value():value;if(v.title)document.title=v.title;if(v.htmlAttrs?.lang)document.documentElement.lang=v.htmlAttrs.lang;if(v.bodyAttrs?.class)document.body.classList.add(v.bodyAttrs.class)});onBeforeUnmount(()=>{stop();document.body.classList.remove('ft-admin-body')})}
