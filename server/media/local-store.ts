import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, opendir, realpath, unlink } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { MediaError, mediaStorageError } from './errors'
import { normalizeManagedObjectKey } from './object-key'
import {
  assertByteRange,
  assertPutMediaInput,
  mediaBodyStream,
  type ByteRange,
  type MediaStore,
  type PutMediaInput,
  type StoredMediaHead,
  type StoredMediaRead,
} from './store'

interface LocalStoreOptions {
  readOnly?: boolean
  kind?: 'local' | 'static'
  maxObjectBytes?: number
}

function within(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`)
}

function localEtag(info: { size: bigint; mtimeNs: bigint; ctimeNs: bigint; ino: bigint; dev: bigint }): string {
  const values = [info.size, info.mtimeNs, info.ctimeNs, info.ino, info.dev]
  if (values.some(value => value < BigInt(0))) throw new MediaError('MEDIA_STORAGE', 'Local media metadata is invalid')
  // Date-valued stat fields round timestamps to milliseconds. BigIntStats keeps
  // nanoseconds, so a same-size in-place replacement cannot retain an old weak
  // validator merely because it occurred inside the same millisecond.
  return `W/"local-${values.map(value => value.toString(16)).join('-')}"`
}
function isErrno(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code
}

async function closeQuietly(handle: { close(): Promise<void> } | null): Promise<void> {
  if (!handle) return
  try { await handle.close() }
  catch { /* cleanup path */ }
}

export class LocalMediaStore implements MediaStore {
  readonly kind: 'local' | 'static'
  private readonly readOnly: boolean
  private readonly maxObjectBytes: number
  private rootPromise: Promise<string> | undefined

  constructor(private readonly configuredRoot: string, options: LocalStoreOptions = {}) {
    if (typeof configuredRoot !== 'string' || !configuredRoot.trim()) throw new MediaError('MEDIA_CONFIG', 'Media root is required')
    this.kind = options.kind ?? 'local'
    this.readOnly = options.readOnly ?? this.kind === 'static'
    this.maxObjectBytes = options.maxObjectBytes ?? 100 * 1024 * 1024
    if (!Number.isSafeInteger(this.maxObjectBytes) || this.maxObjectBytes < 1 || this.maxObjectBytes > 1024 * 1024 * 1024) {
      throw new MediaError('MEDIA_CONFIG', 'Invalid local media size limit')
    }
  }

  private root(): Promise<string> {
    this.rootPromise ??= (async () => {
      const configured = resolve(this.configuredRoot)
      await mkdir(configured, { recursive: true, mode: 0o750 })
      const rootInfo = await lstat(configured)
      if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new MediaError('MEDIA_CONFIG', 'Media root must be a real directory')
      return realpath(configured)
    })()
    return this.rootPromise
  }

  private async location(keyInput: string): Promise<{ root: string; key: string; path: string }> {
    const key = normalizeManagedObjectKey(keyInput)
    const root = await this.root()
    const path = resolve(root, ...key.split('/'))
    if (!within(root, path)) throw new MediaError('MEDIA_INPUT', 'Media key escaped the storage root')
    return { root, key, path }
  }

  private async ensureParent(root: string, key: string, path: string): Promise<void> {
    const directories = key.split('/').slice(0, -1)
    let current = root
    for (const segment of directories) {
      current = resolve(current, segment)
      await mkdir(current, { mode: 0o750 }).catch((error: unknown) => { if (!isErrno(error, 'EEXIST')) throw error })
      const info = await lstat(current)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new MediaError('MEDIA_STORAGE', 'Media path contains a non-directory component')
    }
    const actualParent = await realpath(dirname(path))
    if (!within(root, actualParent)) throw new MediaError('MEDIA_STORAGE', 'Media parent escaped the storage root')
  }

  private async assertExistingPath(root: string, key: string, path: string): Promise<void> {
    let current = root
    for (const segment of key.split('/')) {
      current = resolve(current, segment)
      const info = await lstat(current)
      if (info.isSymbolicLink()) throw new MediaError('MEDIA_STORAGE', 'Symbolic links are not allowed in media paths')
    }
    const actual = await realpath(path)
    if (!within(root, actual)) throw new MediaError('MEDIA_STORAGE', 'Media object escaped the storage root')
  }

  private async openRead(keyInput: string): Promise<{ key: string; handle: Awaited<ReturnType<typeof open>>; head: StoredMediaHead } | null> {
    const { root, key, path } = await this.location(keyInput)
    let handle: Awaited<ReturnType<typeof open>> | null = null
    try {
      await this.assertExistingPath(root, key, path)
      handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      const info = await handle.stat({ bigint: true })
      const maximumSize = BigInt(this.maxObjectBytes)
      if (!info.isFile() || info.size < BigInt(0) || info.size > maximumSize || info.size > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new MediaError('MEDIA_STORAGE', 'Media object is not a supported regular file')
      }
      const size = Number(info.size)
      const modifiedMilliseconds = Number(info.mtimeNs / BigInt(1_000_000))
      if (!Number.isSafeInteger(modifiedMilliseconds) || modifiedMilliseconds < 0) {
        throw new MediaError('MEDIA_STORAGE', 'Local media modification time is invalid')
      }
      return {
        key,
        handle,
        head: {
          key,
          size,
          etag: localEtag(info),
          lastModified: new Date(modifiedMilliseconds),
          contentType: null,
          checksumSha256: null,
        },
      }
    }
    catch (error) {
      await closeQuietly(handle)
      if (isErrno(error, 'ENOENT')) return null
      if (isErrno(error, 'ELOOP')) throw new MediaError('MEDIA_STORAGE', 'Symbolic-link media objects are not allowed', { cause: error as Error })
      throw mediaStorageError(error)
    }
  }

  async head(key: string): Promise<StoredMediaHead | null> {
    const opened = await this.openRead(key)
    if (!opened) return null
    await opened.handle.close()
    return opened.head
  }

  async *scanEntries(): AsyncGenerator<{ key: string; skipped?: boolean; error?: boolean }> {
    if (this.readOnly) throw new MediaError('MEDIA_CONFIG', 'Only managed media can be scanned')
    const root = await this.root()
    const walk = async function* (store: LocalMediaStore, prefix: string): AsyncGenerator<{ key: string; skipped?: boolean; error?: boolean }> {
      try {
        if (prefix) await store.assertExistingPath(root, prefix, resolve(root, prefix))
        const directory = await opendir(resolve(root, prefix))
        for await (const entry of directory) {
          const key = prefix ? `${prefix}/${entry.name}` : entry.name
          if (entry.name.startsWith('.') || entry.name === 'purge-quarantine' || /\.(?:upload|tmp|part|partial)$/iu.test(entry.name) || entry.isSymbolicLink()) {
            yield { key, skipped: true }; continue
          }
          try { if (normalizeManagedObjectKey(key) !== key) throw new Error('INVALID_KEY') }
          catch { yield { key, skipped: true }; continue }
          if (entry.isDirectory()) yield* walk(store, key)
          else if (entry.isFile()) yield { key }
          else yield { key, skipped: true }
        }
      } catch { yield { key: prefix, error: true } }
    }
    yield* walk(this, '')
  }

  async read(key: string, options: { range?: ByteRange | null; etagMatches?: string | null } = {}): Promise<StoredMediaRead | null> {
    const opened = await this.openRead(key)
    if (!opened) return null
    const range = assertByteRange(options.range)
    const expected = options.etagMatches?.replace(/^W\//u, '').replace(/^"|"$/gu, '')
    const actual = opened.head.etag.replace(/^W\//u, '').replace(/^"|"$/gu, '')
    if (expected && expected !== actual) {
      await opened.handle.close()
      throw new MediaError('MEDIA_PRECONDITION', 'Media object changed before it could be read')
    }
    if (range && (range.offset >= opened.head.size || range.length > opened.head.size - range.offset)) {
      await opened.handle.close()
      throw new MediaError('MEDIA_RANGE', 'Requested local media range is not satisfiable')
    }

    const start = range?.offset ?? 0
    const length = range?.length ?? opened.head.size
    let position = start
    let remaining = length
    let closed = false
    const handle = opened.handle
    const close = async () => {
      if (closed) return
      closed = true
      await closeQuietly(handle)
    }
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (remaining === 0) { await close(); controller.close(); return }
          const wanted = Math.min(64 * 1024, remaining)
          const buffer = new Uint8Array(wanted)
          const result = await handle.read(buffer, 0, wanted, position)
          if (result.bytesRead <= 0) throw new MediaError('MEDIA_STORAGE', 'Media object ended before the declared size')
          const chunk = result.bytesRead === buffer.byteLength ? buffer : buffer.slice(0, result.bytesRead)
          position += result.bytesRead
          remaining -= result.bytesRead
          controller.enqueue(chunk)
          if (remaining === 0) { await close(); controller.close() }
        }
        catch (error) { await close(); controller.error(mediaStorageError(error)) }
      },
      async cancel() { await close() },
    })
    return { head: opened.head, body, range }
  }

  async put(inputValue: PutMediaInput): Promise<StoredMediaHead> {
    if (this.readOnly) throw new MediaError('MEDIA_FORBIDDEN', 'This media store is read-only')
    const input = assertPutMediaInput(inputValue)
    if (input.size > this.maxObjectBytes) throw new MediaError('MEDIA_LIMIT', 'Media object exceeds the local size limit')
    const { root, key, path } = await this.location(input.key)
    await this.ensureParent(root, key, path)
    const temporaryDirectory = resolve(root, '.tmp')
    await mkdir(temporaryDirectory, { mode: 0o750 }).catch((error: unknown) => { if (!isErrno(error, 'EEXIST')) throw error })
    const temporaryInfo = await lstat(temporaryDirectory)
    if (!temporaryInfo.isDirectory() || temporaryInfo.isSymbolicLink()) throw new MediaError('MEDIA_STORAGE', 'Invalid media temporary directory')
    const tempPath = resolve(temporaryDirectory, `${randomUUID()}.partial`)
    let handle: Awaited<ReturnType<typeof open>> | null = null
    let linked = false
    try {
      handle = await open(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o640)
      const hash = createHash('sha256')
      const reader = mediaBodyStream(input.body).getReader()
      let written = 0
      try {
        while (true) {
          const result = await reader.read()
          if (result.done) break
          const chunk = result.value
          if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0) continue
          written += chunk.byteLength
          if (written > input.size || written > this.maxObjectBytes) throw new MediaError('MEDIA_LIMIT', 'Media stream exceeded its declared size')
          hash.update(chunk)
          let offset = 0
          while (offset < chunk.byteLength) {
            const resultWrite = await handle.write(chunk, offset, chunk.byteLength - offset, null)
            if (resultWrite.bytesWritten <= 0) throw new MediaError('MEDIA_STORAGE', 'Local media write made no progress')
            offset += resultWrite.bytesWritten
          }
        }
      }
      finally { reader.releaseLock() }
      if (written !== input.size) throw new MediaError('MEDIA_PROTOCOL', 'Media stream size did not match its declaration')
      const checksum = hash.digest('hex')
      if (input.checksumSha256 && input.checksumSha256 !== checksum) throw new MediaError('MEDIA_PRECONDITION', 'Media checksum mismatch')
      await handle.sync()
      await handle.close(); handle = null
      await link(tempPath, path)
      linked = true
      const result = await this.head(input.key)
      if (!result) throw new MediaError('MEDIA_STORAGE', 'Media object disappeared after creation')
      await unlink(tempPath)
      linked = false
      return { ...result, contentType: input.contentType, checksumSha256: checksum }
    }
    catch (error) {
      await closeQuietly(handle)
      if (linked) {
        // Keep the temporary hard link until verification succeeds. On a
        // failed verification, only remove the published path when it still
        // references the exact inode created by this operation; never delete
        // a replacement written by another process.
        try {
          const [temporary, published] = await Promise.all([lstat(tempPath), lstat(path)])
          if (temporary.dev === published.dev && temporary.ino === published.ino) await unlink(path)
        }
        catch { /* best-effort rollback; the original failure remains primary */ }
      }
      await unlink(tempPath).catch(() => undefined)
      if (isErrno(error, 'EEXIST')) throw new MediaError('MEDIA_CONFLICT', 'Media object key already exists', { cause: error as Error })
      throw mediaStorageError(error)
    }
  }

  async delete(keyInput: string): Promise<boolean> {
    if (this.readOnly) throw new MediaError('MEDIA_FORBIDDEN', 'This media store is read-only')
    const { root, key, path } = await this.location(keyInput)
    try {
      await this.assertExistingPath(root, key, path)
      const info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink()) throw new MediaError('MEDIA_STORAGE', 'Refusing to delete a non-regular media object')
      await unlink(path)
      return true
    }
    catch (error) {
      if (isErrno(error, 'ENOENT')) return false
      throw mediaStorageError(error)
    }
  }
}
