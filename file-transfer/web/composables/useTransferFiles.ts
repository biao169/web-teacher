import { ref, shallowRef, useNuxtApp } from '#imports'
import { emptyBundle, collectFilesAsync, collectHandle, collectDrop, mergeBundles, removePath } from '../files/collection.mjs'
import { saveZip, saveSingle, saveDirectory } from '../files/save.mjs'
import { checkAbort, fileError } from '../../shared/manifest.mjs'
import type { FileBundle, FileProgress, FileProblem, ManifestEntry, SaveResult, ReadHandle } from '../../shared/files'

function createWorkspace() {
  const collection = shallowRef<FileBundle>(emptyBundle())
  const preview = shallowRef<FileBundle | null>(null)
  const busy = ref<'scan' | 'save' | ''>('')
  const progress = ref<FileProgress>({ bytes: '0', totalBytes: '0', path: '' })
  const problem = ref<FileProblem | null>(null)
  const result = ref<SaveResult | null>(null)
  const receiveCode = ref(''); const note = ref('')
  let controller: AbortController | null = null
  function fail(error: unknown) {
    const e = error as FileProblem & { name?: string }
    problem.value = { code: e.name === 'AbortError' || e.code === 'FT_CANCELLED' ? 'FT_CANCELLED' : (typeof e.code === 'string' ? e.code : (e.name === 'NotAllowedError' ? 'FT_PERMISSION_DENIED' : 'FT_READ_FAILED')), ...(e.path ? { path: e.path } : {}), ...(e.partialDirectory ? { partialDirectory: e.partialDirectory, completedFiles: e.completedFiles ?? 0 } : {}) }
  }
  async function collect(read: (signal: AbortSignal) => FileBundle | Promise<FileBundle>) {
    if (busy.value) return
    busy.value = 'scan'; problem.value = null; result.value = null; controller = new AbortController()
    try { const batch = await read(controller.signal); checkAbort(controller.signal); if (!batch.manifest.entries.length) throw fileError('FT_NO_FILES'); collection.value = mergeBundles(collection.value, batch) }
    catch (error) { fail(error) } finally { busy.value = ''; controller = null }
  }
  function addFiles(files: Iterable<File>, directory = false) { return collect(signal => collectFilesAsync(files, { directory, signal })) }
  function addHandle(handle: Promise<ReadHandle>) { return collect(async signal => collectHandle(await handle, { signal })) }
  function addDrop(captured: unknown) { return collect(signal => collectDrop(captured, { signal })) }
  function remove(path: string) { if (!busy.value) { collection.value = removePath(collection.value, path); result.value = null } }
  function clear() { if (!busy.value) { collection.value = emptyBundle(); preview.value = null; problem.value = null; result.value = null } }
  function preparePreview() { if (!busy.value && collection.value.manifest.entries.length) { preview.value = collection.value; result.value = null; problem.value = null } }
  async function save(kind: 'zip' | 'directory' | 'file', entry?: ManifestEntry) {
    const bundle = preview.value
    if (busy.value || !bundle) return
    busy.value = 'save'; problem.value = null; result.value = null; progress.value = { bytes: '0', totalBytes: '0', path: '' }; controller = new AbortController()
    const options = { signal: controller.signal, onProgress: (value: FileProgress) => { progress.value = value } }
    try { result.value = kind === 'zip' ? await saveZip(bundle, options) : kind === 'directory' ? await saveDirectory(bundle, options) : entry ? await saveSingle(bundle, entry, options) : null }
    catch (error) { fail(error) } finally { busy.value = ''; controller = null }
  }
  return { collection, preview, busy, progress, problem, result, receiveCode, note, addFiles, addHandle, addDrop, remove, clear, preparePreview, save, cancel: () => controller?.abort() }
}
// Per Nuxt application, not a shared SSR singleton. File handles and contents
// never enter useState, hydration payloads, localStorage, IndexedDB or the API.
const workspaces = new WeakMap<object, ReturnType<typeof createWorkspace>>()
export function useTransferFiles() {
  const app = useNuxtApp()
  let state = workspaces.get(app)
  if (!state) { state = createWorkspace(); workspaces.set(app, state) }
  return state
}
