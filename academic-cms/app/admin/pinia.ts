import { createPinia, type Pinia } from 'pinia'
let adminPinia: Pinia | undefined
export function getAdminPinia(): Pinia { adminPinia ??= createPinia(); return adminPinia }
