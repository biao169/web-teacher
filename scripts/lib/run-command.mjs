import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'

export const projectRoot = resolve(import.meta.dirname, '../..')

export function localBinaryPath(name, rootDir = projectRoot) {
  const suffix = process.platform === 'win32' ? '.cmd' : ''
  return resolve(rootDir, 'node_modules', '.bin', `${name}${suffix}`)
}

export async function assertLocalBinary(name, rootDir = projectRoot) {
  const executable = localBinaryPath(name, rootDir)
  await access(executable, constants.X_OK).catch(() => {
    throw new Error(`Missing local executable: ${name}. Run pnpm install first.`)
  })
  return executable
}

export async function runCommand(command, args, options = {}) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? projectRoot,
      env: { ...process.env, ...options.env },
      stdio: options.stdio ?? 'inherit',
      shell: process.platform === 'win32',
    })

    child.once('error', rejectPromise)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      const detail = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`
      rejectPromise(new Error(`${command} failed with ${detail}`))
    })
  })
}

export async function runLocalBinary(name, args, options = {}) {
  const executable = await assertLocalBinary(name, options.cwd ?? projectRoot)
  return runCommand(executable, args, options)
}
