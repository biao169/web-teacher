import type { MaybeRefOrGetter } from 'vue'

interface StoredColumnWidths {
  readonly version: 1
  readonly widths: Readonly<Record<string, number>>
}

const STORAGE_PREFIX = 'academic-cms:admin-table:v1:'
const MIN_COLUMN_WIDTH = 60
const MAX_COLUMN_WIDTH = 960

function safePreferenceKey(value: string): string {
  return value.trim().replace(/[^a-z0-9:_-]/giu, '-').slice(0, 128)
}

function normalizedWidths(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const output: Record<string, number> = {}
  for (const [key, width] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_.:-]{0,127}$/iu.test(key) || typeof width !== 'number' || !Number.isFinite(width)) continue
    output[key] = Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)))
  }
  return output
}

export function useAdminTablePreferences(preferenceKey: MaybeRefOrGetter<string>) {
  const widths = ref<Record<string, number>>({})
  const hydrated = ref(false)

  function storageKey(): string { return `${STORAGE_PREFIX}${safePreferenceKey(toValue(preferenceKey))}` }
  function persist(): void {
    if (!import.meta.client || !hydrated.value) return
    const payload: StoredColumnWidths = { version: 1, widths: widths.value }
    window.localStorage.setItem(storageKey(), JSON.stringify(payload))
  }
  function load(): void {
    widths.value = {}
    if (import.meta.client) {
      try {
        const raw = window.localStorage.getItem(storageKey())
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<StoredColumnWidths>
          if (parsed.version === 1) widths.value = normalizedWidths(parsed.widths)
        }
      } catch {
        widths.value = {}
      }
    }
    hydrated.value = true
  }
  function setColumnWidth(column: string, width: number): void {
    const next = normalizedWidths({ ...widths.value, [column]: width })
    widths.value = next
    persist()
  }
  function columnWidth(column: string): number | undefined { return widths.value[column] }
  function resetColumnWidths(): void {
    widths.value = {}
    if (import.meta.client) window.localStorage.removeItem(storageKey())
  }

  onMounted(load)
  watch(() => toValue(preferenceKey), load)
  return { widths: readonly(widths), hydrated: readonly(hydrated), columnWidth, setColumnWidth, resetColumnWidths }
}
