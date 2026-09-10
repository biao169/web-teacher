import { defineStore } from 'pinia'
export type AdminDensity = 'comfortable' | 'compact'
const STORAGE_KEY = 'academic-cms:admin-ui:v1'
const STORAGE_VERSION = 1
interface PersistedAdminUi { version: number; sidebarCollapsed: boolean; density: AdminDensity }
function readPersisted(value: string | null): PersistedAdminUi | null {
  if (!value || value.length > 2_048) return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const candidate = parsed as Partial<PersistedAdminUi>
    if (candidate.version !== STORAGE_VERSION || typeof candidate.sidebarCollapsed !== 'boolean') return null
    if (candidate.density !== 'comfortable' && candidate.density !== 'compact') return null
    return { version: STORAGE_VERSION, sidebarCollapsed: candidate.sidebarCollapsed, density: candidate.density }
  }
  catch { return null }
}
export const useAdminUiStore = defineStore('admin-ui', {
  state: () => ({ hydrated: false, sidebarCollapsed: false, mobileOpen: false, density: 'comfortable' as AdminDensity }),
  actions: {
    hydrate(): void {
      if (this.hydrated || typeof window === 'undefined') return
      try {
        const persisted = readPersisted(window.localStorage.getItem(STORAGE_KEY))
        if (persisted) { this.sidebarCollapsed = persisted.sidebarCollapsed; this.density = persisted.density }
      }
      catch {}
      this.hydrated = true
    },
    persist(): void {
      if (!this.hydrated || typeof window === 'undefined') return
      const value: PersistedAdminUi = { version: STORAGE_VERSION, sidebarCollapsed: this.sidebarCollapsed, density: this.density }
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) }
      catch {}
    },
    toggleSidebar(): void { this.sidebarCollapsed = !this.sidebarCollapsed; this.persist() },
    setMobileOpen(value: boolean): void { this.mobileOpen = value },
    setDensity(value: AdminDensity): void { this.density = value; this.persist() },
    resetTransient(): void { this.mobileOpen = false },
  },
})
