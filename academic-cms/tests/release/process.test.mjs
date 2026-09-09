import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runProcess } from '../../scripts/release/process.mjs'

test('process runner preserves argv without shell expansion', async () => {
  const payload = '$(touch NOT_A_FILE); echo NOT_EXECUTED'
  const result = await runProcess(process.execPath, ['-e', 'console.log(process.argv[1])', payload])
  assert.equal(result.passed, true)
  assert.equal(result.output.trim(), payload)
})
test('process runner reports nonzero and spawn failures honestly', async () => {
  const failed = await runProcess(process.execPath, ['-e', 'process.exit(7)'])
  assert.equal(failed.exitCode, 7); assert.equal(failed.passed, false)
  const missing = await runProcess('cms-binary-that-does-not-exist', [])
  assert.equal(missing.reason, 'ENOENT'); assert.equal(missing.passed, false)
})
test('hung subprocess is terminated and reported as timeout', async () => {
  const result = await runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 200 })
  assert.equal(result.reason, 'timeout'); assert.equal(result.passed, false)
  assert.ok(result.durationMs < 4000)
})
test('excessive output is bounded and cannot yield success', async () => {
  const result = await runProcess(process.execPath, ['-e', 'console.log("x".repeat(100000))'], { maxBytes: 1024 })
  assert.equal(result.reason, 'output_limit'); assert.equal(result.passed, false)
  assert.ok(Buffer.byteLength(result.output) <= 1024)
})
test('secrets are removed from captured subprocess diagnostics', async () => {
  const secret = 'testing-secret-12345678'
  const result = await runProcess(process.execPath, ['-e', 'console.log(process.env.DEMO_SECRET);console.error(process.env.DEMO_SECRET)'], { env: { DEMO_SECRET: secret }, redact: [secret] })
  assert.equal(result.passed, true); assert.equal(result.output.includes(secret), false)
  assert.equal(result.output.match(/\[REDACTED\]/g).length, 2)
})
test('invalid resource budgets fail before spawning a process', () => {
  for (const maxBytes of [0, -1, Infinity, NaN, 2.5]) assert.throws(() => runProcess(process.execPath, ['-e',''], { maxBytes }), /maxBytes/)
  assert.throws(() => runProcess(process.execPath, ['-e', ''], { timeoutMs: 0 }), /timeoutMs/)
})
