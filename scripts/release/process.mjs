import { spawn } from 'node:child_process'

/** Execute only argv vectors. Reap this task's process group on timeout. */
export function runProcess(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 600000
  const maxBytes = options.maxBytes ?? 16 * 1024 * 1024
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new TypeError('maxBytes must be a positive integer')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be a positive integer')
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new TypeError('Arguments must be strings')
  return new Promise(resolve => {
    const started = Date.now()
    const parts = []
    let size = 0
    let reason = null
    let escalation
    let timer
    let settled = false
    const child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, ...options.env }, shell: process.platform === 'win32', detached: process.platform !== 'win32', stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'] })
    const kill = signal => {
      if (!child.pid) return
      try { process.platform === 'win32' ? child.kill(signal) : process.kill(-child.pid, signal) } catch (error) { if (error.code !== 'ESRCH') reason ??= 'kill_error' }
    }
    const terminate = why => {
      reason ??= why
      kill('SIGTERM')
      escalation ??= setTimeout(() => kill('SIGKILL'), 300)
    }
    function append(chunk) {
      size += chunk.length
      if (size <= maxBytes) parts.push(chunk)
      else terminate('output_limit')
    }
    if (!options.inherit) { child.stdout.on('data',append);child.stderr.on('data',append) }
    function finish(code, signal, errorCode = null) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // A timed-out task may leave descendants after its parent exits.
      if (reason) kill('SIGKILL')
      clearTimeout(escalation)
      let output = Buffer.concat(parts).toString('utf8')
      for (const secret of options.redact ?? []) if (typeof secret === 'string' && secret.length >= 8) output = output.split(secret).join('[REDACTED]')
      resolve({ passed: code === 0 && !signal && !errorCode && !reason, exitCode: code, signal, reason: reason ?? errorCode, durationMs: Date.now()-started, output })
    }
    child.once('error',error=>finish(null,null,error.code ?? 'SPAWN_ERROR'))
    child.once('close',(code,signal)=>finish(code,signal))
    timer = setTimeout(()=>terminate('timeout'),timeoutMs)
  })
}
