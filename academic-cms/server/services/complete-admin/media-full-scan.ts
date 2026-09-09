import { detectImageDimensions, detectMediaSignature, MAX_UPLOAD_BYTES, normalizeUploadExtensions } from '../../../shared/complete-admin/core.mjs'
import type { Row } from '../../../db/models'
import type { MediaStore } from '../../media/store'
import type { SqlAdapter } from '../../utils/complete-admin/db'

export interface MediaScanState {
  status: 'running' | 'completed' | 'failed' | 'interrupted'
  phase: 'records' | 'disk' | 'done'
  startedAt: string
  checked: number
  total: number
  missing: number
  abnormal: number
  external: number
  visited: number
  added: number
  skipped: number
  errors: number
  note: string
  issues: Array<{ key: string; reason: string }>
}

interface Dependencies {
  db: SqlAdapter
  local?: MediaStore | undefined
  maxObjectBytes: number
  inspect: (asset: Row<'media_assets'>) => Promise<Record<string, unknown>>
  actor: { userUid: string; name: string }
}
const LEASE_MS = 120_000

export async function mediaScanStatus(db: SqlAdapter): Promise<MediaScanState | null> {
  const row = await db.first<{ state_json: string; lease_until: number }>('SELECT state_json, lease_until FROM media_scan_jobs WHERE id = 1')
  if (!row) return null
  const state = JSON.parse(row.state_json) as MediaScanState
  if (state.status === 'running' && row.lease_until < Date.now()) {
    state.status = 'interrupted'
    state.note = '服务中断，已保存检查结果；点击扫描全部媒体可重新扫描。'
  }
  return state
}

/** Claim in SQL, so concurrent requests/processes cannot create duplicate jobs. */
export async function startMediaFullScan(deps: Dependencies): Promise<{ state: MediaScanState; work?: Promise<void> }> {
  const { db } = deps
  const totals = await db.first<{ total: number; maximum: number }>('SELECT COUNT(*) AS total, COALESCE(MAX(id), 0) AS maximum FROM media_assets')
  const state: MediaScanState = {
    status: 'running', phase: 'records', startedAt: new Date().toISOString(),
    total: Number(totals?.total ?? 0), checked: 0, missing: 0, abnormal: 0, external: 0,
    visited: 0, added: 0, skipped: 0, errors: 0, issues: [], note: '',
  }
  const token = crypto.randomUUID()
  const claim = await db.run(`INSERT INTO media_scan_jobs (id, token, lease_until, state_json) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET token = excluded.token, lease_until = excluded.lease_until, state_json = excluded.state_json
    WHERE media_scan_jobs.lease_until < ?`, [token, Date.now() + LEASE_MS, JSON.stringify(state), Date.now()])
  if (!claim.changes) return { state: (await mediaScanStatus(db))! }
  return { state: { ...state }, work: run(deps, token, Number(totals?.maximum ?? 0), state) }
}

async function run(deps: Dependencies, token: string, maximum: number, state: MediaScanState): Promise<void> {
  const { db } = deps
  let lostLease = false
  let heartbeatBusy = false
  let heartbeatTask: Promise<void> = Promise.resolve()
  const heartbeat = setInterval(() => {
    if (heartbeatBusy) return
    heartbeatBusy = true
    heartbeatTask = db.run('UPDATE media_scan_jobs SET lease_until = ? WHERE id = 1 AND token = ?', [Date.now() + LEASE_MS, token])
      .then(result => { if (!result.changes) lostLease = true })
      .catch(() => { lostLease = true })
      .finally(() => { heartbeatBusy = false })
  }, 10_000)
  const save = async (done = false) => {
    if (lostLease) throw new Error('SCAN_LEASE_LOST')
    const result = await db.run('UPDATE media_scan_jobs SET state_json = ?, lease_until = ? WHERE id = 1 AND token = ?',
      [JSON.stringify(state), done ? 0 : Date.now() + LEASE_MS, token])
    if (!result.changes) throw new Error('SCAN_LEASE_LOST')
  }
  const issue = (key: string, reason: string) => {
    if (state.issues.length < 50) state.issues.push({ key, reason })
  }
  try {
    let cursor = 0
    while (cursor < maximum) {
      const assets = await db.all<Record<string, unknown>>('SELECT * FROM media_assets WHERE id > ? AND id <= ? ORDER BY id LIMIT 100', [cursor, maximum])
      if (!assets.length) break
      for (const source of assets) {
        if (lostLease) throw new Error('SCAN_LEASE_LOST')
        const asset = source as unknown as Row<'media_assets'>
        let result: Record<string, unknown>
        try { result = { uid: asset.uid, ...await deps.inspect(asset) } }
        catch { result = { uid: asset.uid, exists: null, consistent: false, checksumVerified: false, note: '文件无法读取或存储配置异常', checkedAt: new Date().toISOString() } }
        if (result.exists === false) state.missing++
        else if (result.consistent === false) state.abnormal++
        else if (result.exists === null) state.external++
        // A concurrent deletion must not recreate an inspection or fail the job.
        await db.run(`INSERT INTO media_inspections (media_uid, result_json) SELECT uid, ? FROM media_assets WHERE uid = ?
          ON CONFLICT(media_uid) DO UPDATE SET result_json = excluded.result_json`, [JSON.stringify(result), asset.uid])
        cursor = asset.id
        state.checked++
        if (state.checked % 10 === 0) await save()
      }
      await save()
    }
    state.phase = 'disk'
    await save()
    const store = deps.local
    if (!store?.scanEntries) {
      state.note = '已检查全部登记记录；当前部署没有本地媒体目录，未执行磁盘文件登记。'
    } else {
      const policy = await db.first<{ upload_max_size_mb: number; upload_allowed_extensions: string }>('SELECT upload_max_size_mb, upload_allowed_extensions FROM global_settings ORDER BY updated_at DESC, id DESC LIMIT 1')
      const maxBytes = Math.min(MAX_UPLOAD_BYTES, deps.maxObjectBytes, Math.max(1, Math.min(200, Number(policy?.upload_max_size_mb ?? 20))) * 1024 * 1024)
      const extensions = normalizeUploadExtensions(policy?.upload_allowed_extensions ?? '["png","jpg","jpeg","gif","webp","pdf","zip"]')
      for await (const entry of store.scanEntries()) {
        if (lostLease) throw new Error('SCAN_LEASE_LOST')
        state.visited++
        if (entry.error) { state.errors++; issue(entry.key, '目录无法读取，部分内容未扫描') }
        else if (entry.skipped) state.skipped++
        else if (await db.first('SELECT uid FROM media_assets WHERE object_key = ?', [entry.key])) state.skipped++
        else {
          try {
            const file = await inspectOrphan(store, entry.key, maxBytes, extensions, Date.parse(state.startedAt))
            if (!file) { state.skipped++; issue(entry.key, '格式、大小或文件名不符合上传规则，或文件仍在写入') }
            else {
              const now = new Date().toISOString()
              const uid = `media:${crypto.randomUUID()}`
              const results = await db.batch([
                { sql: `INSERT INTO media_assets (uid, object_key, title, category, mime_type, size, storage_kind, status, checksum, created_at, updated_at)
                    VALUES (?, ?, ?, '扫描导入', ?, ?, 'local', 'active', ?, ?, ?) ON CONFLICT(object_key) DO NOTHING`,
                  params: [uid, entry.key, entry.key.split('/').at(-1)!.slice(0, 300), file.mime, file.size, file.checksum, now, now] },
                { sql: `INSERT INTO media_inspections (media_uid, result_json) SELECT uid, ? FROM media_assets WHERE uid = ?`, params: [JSON.stringify({ uid, exists: true, consistent: true, sizeMatches: true, checksumMatches: true, checksumVerified: true, mimeMatches: true, checkedAt: now }), uid] },
                { sql: `INSERT INTO cache_generations (tag, generation, updated_at) VALUES ('public:media', 1, ?)
                    ON CONFLICT(tag) DO UPDATE SET generation = cache_generations.generation + 1, updated_at = excluded.updated_at`, params: [now] },
              ])
              if (results[0]?.changes) state.added++
              else state.skipped++
            }
          } catch { state.errors++; issue(entry.key, '文件读取或登记失败；下次扫描可重试') }
        }
        if (state.visited % 10 === 0) await save()
      }
    }
    state.phase = 'done'
    state.status = 'completed'
    clearInterval(heartbeat)
    await heartbeatTask
    const now = new Date().toISOString()
    await db.run(`INSERT INTO operation_logs (uid, actor_uid, actor_name, action, module, target_uid, summary, detail_json, status, created_at, updated_at)
      VALUES (?, ?, ?, 'scan', 'media', 'media:scan', '扫描全部媒体', ?, 'success', ?, ?)`,
    [`log:${crypto.randomUUID()}`, deps.actor.userUid, deps.actor.name, JSON.stringify(state), now, now])
    await save(true)
  } catch {
    clearInterval(heartbeat)
    await heartbeatTask
    state.status = 'failed'
    state.note = '扫描未完成，已处理结果保留。请检查数据库及媒体目录权限后重新扫描。'
    await save(true).catch(() => undefined)
  } finally { clearInterval(heartbeat) }
}

/** Same signature, size and image limits as upload; never rewrite the file. */
export async function inspectOrphan(store: MediaStore, key: string, maxBytes: number, extensions: string[], startedAt: number) {
  const head = await store.head(key)
  if (!head || head.size < 1 || head.size > maxBytes || head.lastModified.getTime() > startedAt - 2000) return null
  const extension = key.split('.').at(-1)!.toLowerCase()
  if (!extensions.includes(extension)) return null
  const object = await store.read(key, { etagMatches: head.etag })
  if (!object) return null
  const reader = object.body.getReader()
  const bytes = new Uint8Array(head.size)
  let offset = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (offset + chunk.value.length > bytes.length) throw new Error('CHANGING_FILE')
      bytes.set(chunk.value, offset); offset += chunk.value.length
    }
  } finally { await reader.cancel(); reader.releaseLock() }
  if (offset !== bytes.length || (await store.head(key))?.etag !== head.etag) return null
  const signature = detectMediaSignature(bytes.subarray(0, 64))
  if (!signature || (extension === 'jpeg' ? 'jpg' : extension) !== signature.extension) return null
  if (signature.mime.startsWith('image/')) {
    const dimensions = detectImageDimensions(bytes, signature.mime)
    if (!dimensions || dimensions.width > 8192 || dimensions.height > 8192 || dimensions.pixels > 40_000_000) return null
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return { mime: signature.mime, size: bytes.length, checksum: [...digest].map(value => value.toString(16).padStart(2, '0')).join('') }
}
