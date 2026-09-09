import type { QueryClient } from '@tanstack/vue-query'
declare module '#app' { interface NuxtApp { $adminRuntimeReady: boolean; $adminQueryClient: QueryClient | null } }
declare module 'vue' { interface ComponentCustomProperties { $adminRuntimeReady: boolean; $adminQueryClient: QueryClient | null } }
export {}
