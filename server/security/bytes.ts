import { SecurityError } from './errors'
export { hasUnpairedSurrogate } from '../../shared/utils/unicode'

const encoder = new TextEncoder()
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const BASE64_REVERSE = new Int16Array(128).fill(-1)
for (let index = 0; index < BASE64URL.length; index += 1) BASE64_REVERSE[BASE64URL.charCodeAt(index)] = index

export function utf8(value: string): Uint8Array {
  return encoder.encode(value)
}

/** Web Crypto requires an ArrayBuffer-owned view under TypeScript 6. */
export function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new Uint8Array(bytes.byteLength)
  output.set(bytes)
  return output.buffer
}

export function utf8Length(value: string): number {
  return encoder.encode(value).byteLength
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let result = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0
    const b = bytes[index + 1] ?? 0
    const c = bytes[index + 2] ?? 0
    const value = (a << 16) | (b << 8) | c
    result += BASE64URL[(value >>> 18) & 63]
    result += BASE64URL[(value >>> 12) & 63]
    if (index + 1 < bytes.length) result += BASE64URL[(value >>> 6) & 63]
    if (index + 2 < bytes.length) result += BASE64URL[value & 63]
  }
  return result
}

export function base64UrlDecode(value: string): Uint8Array {
  if (typeof value !== 'string' || !value || value.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new SecurityError('AUTH_INPUT', 'Invalid base64url value')
  }
  const output = new Uint8Array(Math.floor((value.length * 6) / 8))
  let accumulator = 0
  let bits = 0
  let offset = 0
  for (const character of value) {
    const code = character.charCodeAt(0)
    const decoded = code < BASE64_REVERSE.length ? (BASE64_REVERSE[code] ?? -1) : -1
    if (decoded < 0) throw new SecurityError('AUTH_INPUT', 'Invalid base64url value')
    accumulator = (accumulator << 6) | decoded
    bits += 6
    if (bits >= 8) {
      bits -= 8
      output[offset] = (accumulator >>> bits) & 0xff
      offset += 1
    }
  }
  if (offset !== output.length || base64UrlEncode(output) !== value) throw new SecurityError('AUTH_INPUT', 'Non-canonical base64url value')
  return output
}

export function hexEncode(bytes: Uint8Array): string {
  let result = ''
  for (const byte of bytes) result += byte.toString(16).padStart(2, '0')
  return result
}

/** Constant work over the supplied lengths; secret inputs in this module are fixed length. */
export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  return difference === 0
}

export function constantTimeStringEqual(left: string, right: string): boolean {
  return constantTimeEqual(utf8(left), utf8(right))
}

export function randomBytes(length: number, cryptoProvider: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 16 || length > 1024) throw new SecurityError('AUTH_INPUT', 'Invalid random byte length')
  return cryptoProvider.getRandomValues(new Uint8Array(length))
}
