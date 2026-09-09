import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, type RouteLocationNormalized } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useLatestRequest } from './useLatestRequest'

interface EditorLifecycleOptions {
  dirty: () => boolean
  busy?: () => boolean
  identity?: (route: RouteLocationNormalized) => string
}

/** Share editor navigation, mutation exclusion and stale response protection; keep CRUD rules in each editor. */
export function useAdminEditorLifecycle(options: EditorLifecycleOptions) {
  const locked = ref(false)
  const busy = computed(() => locked.value || Boolean(options.busy?.()))
  let committed = false
  let disposed = false
  const reads = useLatestRequest()
  let confirmation: Promise<boolean> | null = null
  const identity = options.identity ?? (route => JSON.stringify([route.path, route.query.edit ?? '', route.query.tab ?? '']))

  async function confirmDiscard(message = '当前页面有未保存修改，确定放弃并离开吗？'): Promise<boolean> {
    if (!options.dirty()) return true
    if (!confirmation) {
      confirmation = ElMessageBox.confirm(message, '未保存的更改', {
        type: 'warning', confirmButtonText: '放弃修改', cancelButtonText: '继续编辑',
      }).then(() => true, () => false).finally(() => { confirmation = null })
    }
    return confirmation
  }

  async function mayLeave(): Promise<boolean> {
    if (busy.value && !(committed && !options.dirty())) return false
    return confirmDiscard()
  }
  onBeforeRouteLeave(mayLeave)
  onBeforeRouteUpdate((to, from) => identity(to) === identity(from) ? true : mayLeave())

  /** Lock synchronously, including confirmation dialogs; a second save/delete cannot start. */
  async function run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    if (disposed || busy.value || confirmation) return undefined
    locked.value = true
    committed = false
    try { return await operation() }
    finally { committed = false; locked.value = false }
  }

  /** Call only after persistence succeeded and the editor baseline was updated. */
  function commit(): void { committed = true }

  /** The returned predicate expires on the next load, identity change or unmount. */
  const startLoad = reads.start
  const invalidateLoad = reads.invalidate
  onBeforeRouteUpdate((to, from) => { if (identity(to) !== identity(from)) invalidateLoad() })

  function beforeUnload(event: BeforeUnloadEvent): void {
    if (!options.dirty() && !busy.value) return
    event.preventDefault()
    event.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => {
    disposed = true
    invalidateLoad()
    window.removeEventListener('beforeunload', beforeUnload)
  })
  return { busy, run, commit, confirmDiscard, startLoad, invalidateLoad }
}
