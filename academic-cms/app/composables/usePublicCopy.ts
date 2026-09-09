import { computed, onBeforeUnmount, ref, shallowRef, type InjectionKey } from 'vue'
import type { PublicSelectionBatch, PublicSelectionRequest } from '~~/shared/contracts/public-selection'
import { readPublicSelectedItems } from '~~/shared/utils/public-selection'
import { serializePublicCopy, type PublicCopyPayload } from '~~/shared/utils/public-copy'
import { writePublicClipboard } from '~/utils/public-clipboard'

export const PUBLIC_COPY_CONTEXT: InjectionKey<ReturnType<typeof usePublicCopy>> = Symbol('public-copy')
// Per document, never shared across SSR requests. A new click supersedes pending copies.
const activeCopies = new WeakMap<Document, AbortController>()
type CopyRequest = PublicSelectionRequest & { includeNumbers?: boolean }
export function usePublicCopy() {
  const status = ref<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  const message = ref(''), processed = ref(0), count = ref(0), locale = ref<'zh' | 'en'>('zh')
  const fallback = shallowRef<PublicCopyPayload | null>(null), unavailable = ref<string[]>([])
  let controller: AbortController | null = null, request: CopyRequest | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const busy = computed(() => status.value === 'copying')
  const label = (zh: string, en: string) => locale.value === 'zh' ? zh : en
  function reset() {
    clearTimeout(timer); controller?.abort(); controller = null; request = null
    status.value = 'idle'; message.value = ''; fallback.value = null; unavailable.value = []; processed.value = 0
  }
  function copy(input: CopyRequest) {
    reset()
    request = { ...input, uids: [...input.uids] }
    const snapshot = request, current = new AbortController(), signal = current.signal
    controller = current; locale.value = input.locale; count.value = input.uids.length; status.value = 'copying'
    if (typeof document !== 'undefined') {
      activeCopies.get(document)?.abort(); activeCopies.set(document, current)
    }
    signal.addEventListener('abort', () => {
      if (controller === current) { status.value = 'idle'; message.value = ''; fallback.value = null; unavailable.value = [] }
    }, { once: true })
    let prepared: PublicCopyPayload | null = null, valid = false
    const payload = readPublicSelectedItems(snapshot, chunk => $fetch<PublicSelectionBatch>('/api/v1/public/selection', {
      query: { module: snapshot.module, locale: snapshot.locale, uid: chunk, ...(snapshot.citationStyle ? { citationStyle: snapshot.citationStyle } : {}) },
      signal, timeout: 15000,
    }), signal, value => { if (!signal.aborted) processed.value = value }).then(result => {
      if (signal.aborted) throw new Error('aborted')
      if (result.unavailable.length) { unavailable.value = result.unavailable; throw new Error('unavailable') }
      prepared = serializePublicCopy(snapshot.module, snapshot.locale, result.items, snapshot.includeNumbers ?? false, snapshot.citationStyle)
      valid = true
      return prepared
    })
    // Do not await preparation here: promised ClipboardItem data preserves user activation.
    return writePublicClipboard(payload, signal).then(() => {
      if (signal.aborted) return
      status.value = 'copied'; message.value = count.value === 1 ? label('已复制', 'Copied') : label(`已复制 ${count.value} 条`, `Copied ${count.value} items`)
      timer = setTimeout(() => { if (controller === current) reset() }, 3000)
    }).catch(reason => {
      if (signal.aborted) return
      status.value = 'failed'
      const code = reason instanceof Error ? reason.message : ''
      message.value = valid ? label('未能写入剪贴板，请重试，或手动复制下方文本。', 'Could not write to the clipboard. Retry or copy the text below manually.')
        : code === 'unavailable' ? label(`${unavailable.value.length} 条已删除或不再公开，本次未复制。`, `${unavailable.value.length} items are no longer public. Nothing was copied.`)
          : code === 'citation' ? label('部分条目未维护当前引用格式，请更换格式或取消勾选后重试。', 'Some items lack the current citation format. Change format or deselect them and retry.')
            : code === 'changed' ? label('内容或编号已更新，请重试。', 'Content or list numbers changed. Please retry.')
              : code === 'size' ? label('内容过大，请减少条目后重试。', 'Content is too large. Select fewer items and retry.')
                : label('读取失败，请重试。', 'Could not load the content. Please retry.')
      fallback.value = valid ? prepared : null
    })
  }
  function retry() { if (request && !busy.value) return copy(request) }
  onBeforeUnmount(reset)
  return { status, message, busy, processed, count, locale, fallback, unavailable, copy, retry, reset }
}
