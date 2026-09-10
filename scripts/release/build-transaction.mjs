import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const BUILD_RUNNING_MESSAGE = 'A build is already running'

function lockOwnerExists(owner) {
  if (owner.pid === process.pid) {
    const lockStartedAt = Date.parse(owner.startedAt)
    const currentProcessStartedAt = Date.now() - process.uptime() * 1_000
    return Number.isFinite(lockStartedAt) && lockStartedAt >= currentProcessStartedAt - 1_000
  }
  try {
    process.kill(owner.pid, 0)
    return true
  } catch (error) {
    return error?.code !== 'ESRCH'
  }
}

async function acquireBuildLock(lockPath) {
  try {
    return await open(lockPath, 'wx', 0o600)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }

  let owner
  try { owner = JSON.parse(await readFile(lockPath, 'utf8')) }
  catch (error) { throw new Error(`${BUILD_RUNNING_MESSAGE}; the lock owner cannot be verified`, { cause: error }) }
  if (!Number.isSafeInteger(owner?.pid) || owner.pid < 1 || typeof owner.startedAt !== 'string' || lockOwnerExists(owner)) {
    throw new Error(BUILD_RUNNING_MESSAGE)
  }

  await rm(lockPath, { force: true })
  try { return await open(lockPath, 'wx', 0o600) }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(BUILD_RUNNING_MESSAGE, { cause: error })
    throw error
  }
}

/** Serialize targets; restore the previous complete output after any failed build. */
export async function withBuildTransaction(root, build) {
  const lockPath = resolve(root, '.build-lock')
  const output = resolve(root, '.output')
  const parent = resolve(root, '.tmp')
  await mkdir(parent, { recursive: true })
  const temporaryInfo = await lstat(parent)
  if (!temporaryInfo.isDirectory() || temporaryInfo.isSymbolicLink()) throw new Error('Build temporary path must be a real directory')
  const lock = await acquireBuildLock(lockPath)
  const backup = resolve(parent, `build-backup-${randomUUID()}`)
  let backedUp = false
  let committed = false
  let mayWriteOutput = false
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }))
    const old = await lstat(output).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (old?.isSymbolicLink() || (old && !old.isDirectory())) throw new Error('.output must be a real directory')
    if (old) { await rename(output, backup); backedUp = true }
    mayWriteOutput = true
    const result = await build()
    const current = await lstat(output)
    if (!current.isDirectory() || current.isSymbolicLink()) throw new Error('Build output must be a real directory')
    committed = true
    return result
  } finally {
    try {
      if (!committed && mayWriteOutput) {
        await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        if (backedUp) await rename(backup, output)
      } else if (backedUp) await rm(backup, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } finally {
      await lock.close()
      await rm(lockPath, { force: true })
    }
  }
}
