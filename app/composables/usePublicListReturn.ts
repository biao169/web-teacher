import type { ComputedRef, InjectionKey } from 'vue'
export const PUBLIC_LIST_RETURN_CONTEXT: InjectionKey<ComputedRef<Map<string, string>>> = Symbol('public-list-return')
