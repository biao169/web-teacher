import type { PublicJsonValue, ViewModelValue } from '../../shared/contracts/view-model'
import { hasUnpairedSurrogate } from '../../shared/utils/unicode'
import { ownedArrayBuffer } from '../security/bytes'

export type ViewModelErrorCode =
  | 'VIEW_MODEL_TYPE'
  | 'VIEW_MODEL_LIMIT'
  | 'VIEW_MODEL_CYCLE'
  | 'VIEW_MODEL_SENSITIVE'
  | 'VIEW_MODEL_PARSE'

export class ViewModelError extends Error {
  constructor(readonly code: ViewModelErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ViewModelError'
  }
}

export interface ViewModelLimits {
  maxDepth: number
  maxNodes: number
  maxArrayLength: number
  maxObjectKeys: number
  maxTotalObjectKeys: number
  maxStringBytes: number
  maxKeyBytes: number
  maxSerializedBytes: number
}

export const DEFAULT_VIEW_MODEL_LIMITS: Readonly<ViewModelLimits> = Object.freeze({
  maxDepth: 20,
  maxNodes: 50_000,
  maxArrayLength: 10_000,
  maxObjectKeys: 1_000,
  maxTotalObjectKeys: 10_000,
  maxStringBytes: 1_000_000,
  maxKeyBytes: 256,
  maxSerializedBytes: 2_000_000,
})

const encoder = new TextEncoder()
const UNSAFE_EXACT = new Set([
  '__proto__', 'prototype', 'constructor',
  'authorization', 'cookie', 'setcookie',
  'password', 'passwordhash', 'token', 'tokenhash',
  'sessiontoken', 'sessionhash', 'csrftoken',
  'apikey', 'secret', 'clientsecret', 'privatekey', 'bootstraptoken',
])

interface NormalizeState {
  limits: Readonly<ViewModelLimits>
  active: WeakSet<object>
  nodes: number
  totalObjectKeys: number
}

function byteLength(value: string): number { return encoder.encode(value).byteLength }
function normalizedKey(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]/gu, '') }
function sensitiveKey(value: string): boolean {
  const key = normalizedKey(value)
  return UNSAFE_EXACT.has(key)
    || key.endsWith('password')
    || key.endsWith('passwordhash')
    || key.endsWith('accesstoken')
    || key.endsWith('refreshtoken')
    || key.endsWith('sessiontoken')
    || key.endsWith('sessionhash')
    || key.endsWith('csrftoken')
    || key.endsWith('apikey')
    || key.endsWith('clientsecret')
    || key.endsWith('privatekey')
}

function compareKeys(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0 }

function resolvedLimits(overrides: Partial<ViewModelLimits> = {}): Readonly<ViewModelLimits> {
  const value = { ...DEFAULT_VIEW_MODEL_LIMITS, ...overrides }
  for (const [name, limit] of Object.entries(value)) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20_000_000) {
      throw new ViewModelError('VIEW_MODEL_LIMIT', `Invalid ViewModel limit: ${name}`)
    }
  }
  return value
}

function normalize(value: unknown, state: NormalizeState, depth: number): ViewModelValue {
  state.nodes += 1
  if (state.nodes > state.limits.maxNodes) throw new ViewModelError('VIEW_MODEL_LIMIT', 'ViewModel node limit exceeded')
  if (depth > state.limits.maxDepth) throw new ViewModelError('VIEW_MODEL_LIMIT', 'ViewModel depth limit exceeded')

  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (hasUnpairedSurrogate(value)) throw new ViewModelError('VIEW_MODEL_TYPE', 'ViewModel contains invalid Unicode')
    const normalized = value.normalize('NFC')
    if (byteLength(normalized) > state.limits.maxStringBytes) throw new ViewModelError('VIEW_MODEL_LIMIT', 'ViewModel string limit exceeded')
    return normalized
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new ViewModelError('VIEW_MODEL_TYPE', 'ViewModel numbers must be finite safe values')
    }
    return Object.is(value, -0) ? 0 : value
  }
  if (typeof value !== 'object') throw new ViewModelError('VIEW_MODEL_TYPE', 'ViewModel contains a non-JSON value')
  if (state.active.has(value)) throw new ViewModelError('VIEW_MODEL_CYCLE', 'ViewModel contains a cycle')

  const isArray = Array.isArray(value)
  const prototype = Object.getPrototypeOf(value)
  if (!isArray && prototype !== Object.prototype && prototype !== null) {
    throw new ViewModelError('VIEW_MODEL_TYPE', 'ViewModel objects must be plain records')
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) throw new ViewModelError('VIEW_MODEL_TYPE', 'ViewModel symbol keys are not supported')

  const descriptors = Object.getOwnPropertyDescriptors(value)
  state.active.add(value)
  try {
    if (isArray) {
      if (value.length > state.limits.maxArrayLength) throw new ViewModelError('VIEW_MODEL_LIMIT', 'ViewModel array limit exceeded')
      const names = Object.getOwnPropertyNames(value)
      if (names.length !== value.length + 1 || !names.includes('length')) {
        throw new ViewModelError('VIEW_MODEL_TYPE', 'Sparse or extended arrays are not supported')
      }
      const output: ViewModelValue[] = []
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)]
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
          throw new ViewModelError('VIEW_MODEL_TYPE', 'ViewModel array accessors are not supported')
        }
        output.push(normalize(descriptor.value, state, depth + 1))
      }
      return output
    }

    const keys = Object.getOwnPropertyNames(value).sort(compareKeys)
    if (keys.length > state.limits.maxObjectKeys) throw new ViewModelError('VIEW_MODEL_LIMIT', 'ViewModel object key limit exceeded')
    state.totalObjectKeys += keys.length
    if (state.totalObjectKeys > state.limits.maxTotalObjectKeys) throw new ViewModelError('VIEW_MODEL_LIMIT', 'ViewModel total object key limit exceeded')
    const output: Record<string, ViewModelValue> = Object.create(null) as Record<string, ViewModelValue>
    for (const key of keys) {
      const descriptor = descriptors[key]
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new ViewModelError('VIEW_MODEL_TYPE', 'ViewModel accessors and hidden properties are not supported')
      }
      if (!key || hasUnpairedSurrogate(key) || /[\u0000-\u001f\u007f]/u.test(key)) {
        throw new ViewModelError('VIEW_MODEL_TYPE', 'ViewModel contains an unsafe object key')
      }
      if (key !== key.normalize('NFC')) throw new ViewModelError('VIEW_MODEL_TYPE', 'ViewModel keys must use NFC normalization')
      if (byteLength(key) > state.limits.maxKeyBytes) throw new ViewModelError('VIEW_MODEL_LIMIT', 'ViewModel object key limit exceeded')
      if (sensitiveKey(key)) throw new ViewModelError('VIEW_MODEL_SENSITIVE', `Sensitive field is not allowed in a public ViewModel: ${key}`)
      output[key] = normalize(descriptor.value, state, depth + 1)
    }
    return output
  }
  finally { state.active.delete(value) }
}

export function normalizeViewModel(value: unknown, overrides: Partial<ViewModelLimits> = {}): ViewModelValue {
  return normalize(value, { limits: resolvedLimits(overrides), active: new WeakSet(), nodes: 0, totalObjectKeys: 0 }, 0)
}

export function stringifyViewModel(value: unknown, overrides: Partial<ViewModelLimits> = {}): string {
  const limits = resolvedLimits(overrides)
  const serialized = JSON.stringify(normalize(value, { limits, active: new WeakSet(), nodes: 0, totalObjectKeys: 0 }, 0))
  if (byteLength(serialized) > limits.maxSerializedBytes) throw new ViewModelError('VIEW_MODEL_LIMIT', 'Serialized ViewModel limit exceeded')
  return serialized
}

export function parseViewModel(serialized: string, overrides: Partial<ViewModelLimits> = {}): ViewModelValue {
  const limits = resolvedLimits(overrides)
  if (typeof serialized !== 'string' || byteLength(serialized) > limits.maxSerializedBytes) {
    throw new ViewModelError('VIEW_MODEL_LIMIT', 'Cached ViewModel exceeds the byte limit')
  }
  let parsed: unknown
  try { parsed = JSON.parse(serialized) }
  catch (error) { throw new ViewModelError('VIEW_MODEL_PARSE', 'Cached ViewModel JSON is invalid', { cause: error }) }
  return normalize(parsed, { limits, active: new WeakSet(), nodes: 0, totalObjectKeys: 0 }, 0)
}

export async function sha256Hex(value: string | Uint8Array, cryptoProvider: Pick<Crypto, 'subtle'> = globalThis.crypto): Promise<string> {
  if (!cryptoProvider?.subtle) throw new ViewModelError('VIEW_MODEL_TYPE', 'Web Crypto is unavailable')
  const input = typeof value === 'string' ? encoder.encode(value) : value
  const digest = await cryptoProvider.subtle.digest('SHA-256', ownedArrayBuffer(input))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}



export type PublicViewModelLimitOverrides = Partial<ViewModelLimits> & { maxBytes?: number }

function publicLimits(input: PublicViewModelLimitOverrides | undefined): Partial<ViewModelLimits> {
  if (!input) return {}
  const { maxBytes, ...rest } = input
  return { ...rest, ...(maxBytes === undefined ? {} : { maxSerializedBytes: maxBytes }) }
}

export function stablePublicJson(
  input: unknown,
  options: { limits?: PublicViewModelLimitOverrides } = {},
): { value: PublicJsonValue; json: string; bytes: number } {
  const limits = resolvedLimits(publicLimits(options.limits))
  const value = normalize(input, { limits, active: new WeakSet(), nodes: 0, totalObjectKeys: 0 }, 0) as PublicJsonValue
  const json = JSON.stringify(value)
  const bytes = byteLength(json)
  if (bytes > limits.maxSerializedBytes) throw new ViewModelError('VIEW_MODEL_LIMIT', 'Serialized ViewModel limit exceeded')
  return { value, json, bytes }
}

export function parsePublicJson(
  input: string,
  options: { limits?: PublicViewModelLimitOverrides } = {},
): PublicJsonValue {
  return parseViewModel(input, publicLimits(options.limits))
}
