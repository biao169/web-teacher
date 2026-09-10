import assert from 'node:assert/strict'
import test from 'node:test'
import { core } from '../helpers/offline-stage3.mjs'

const { stablePublicJson, parsePublicJson, ViewModelError, sha256Hex } = core

test('ViewModel serialization is stable and normalizes strings', () => {
  const first = stablePublicJson({ z: 1, a: 'e\u0301', nested: { y: true, x: null } })
  const second = stablePublicJson({ nested: { x: null, y: true }, a: 'é', z: 1 })
  assert.equal(first.json, second.json)
  assert.equal(first.json, '{"a":"é","nested":{"x":null,"y":true},"z":1}')
})

test('ViewModel parser returns null-prototype records', () => {
  const parsed = parsePublicJson('{"safe":1}')
  assert.equal(Object.getPrototypeOf(parsed), null)
  assert.equal(parsed.safe, 1)
})

for (const [name, value] of [
  ['undefined', { value: undefined }],
  ['unsafe integer', { value: Number.MAX_SAFE_INTEGER + 1 }],
  ['NaN', { value: Number.NaN }],
  ['date object', { value: new Date() }],
  ['sensitive password', { passwordHash: 'x' }],
  ['sensitive token', { csrf_token: 'x' }],
]) {
  test(`ViewModel rejects ${name}`, () => assert.throws(() => stablePublicJson(value), ViewModelError))
}

test('ViewModel rejects accessors without invoking them', () => {
  let invoked = false
  const value = {}
  Object.defineProperty(value, 'danger', { enumerable: true, get() { invoked = true; return 'x' } })
  assert.throws(() => stablePublicJson(value), ViewModelError)
  assert.equal(invoked, false)
})

test('ViewModel rejects sparse and extended arrays', () => {
  const sparse = []
  sparse.length = 2
  assert.throws(() => stablePublicJson(sparse), ViewModelError)
  const extended = [1]
  extended.extra = 2
  assert.throws(() => stablePublicJson(extended), ViewModelError)
})

test('ViewModel rejects cycles and enforces byte limit', () => {
  const value = {}
  value.self = value
  assert.throws(() => stablePublicJson(value), ViewModelError)
  assert.throws(() => stablePublicJson({ text: '123456' }, { limits: { maxBytes: 5 } }), ViewModelError)
})

test('ViewModel digest is deterministic', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
