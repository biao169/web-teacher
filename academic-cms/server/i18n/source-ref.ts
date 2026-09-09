import { I18nError } from './errors'

const encoder = new TextEncoder()
const ENTITY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u
const FIELD_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u
const MAX_UID_BYTES = 256
const MAX_REF_BYTES = 512

function validatePart(value: string, name: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value || /[\u0000-\u001f\u007f]/u.test(value)) throw new I18nError('I18N_INPUT', `Invalid translation ${name}`)
  if (pattern && !pattern.test(value)) throw new I18nError('I18N_INPUT', `Invalid translation ${name}`)
  return value
}

export interface SourceReference {
  entity: string
  uid: string
  field: string
}

export function buildSourceRefKey(reference: SourceReference): string {
  const entity = validatePart(reference.entity, 'entity', ENTITY_PATTERN)
  const rawUid = validatePart(reference.uid, 'uid')
  const uid = rawUid.normalize('NFC')
  const field = validatePart(reference.field, 'field', FIELD_PATTERN)
  if (encoder.encode(uid).byteLength > MAX_UID_BYTES) throw new I18nError('I18N_LIMIT', 'Translation UID is too long')
  const key = `${entity}/${encodeURIComponent(uid)}/${field}`
  if (encoder.encode(key).byteLength > MAX_REF_BYTES) throw new I18nError('I18N_LIMIT', 'Translation source reference is too long')
  return key
}

export function parseSourceRefKey(key: string): SourceReference {
  if (typeof key !== 'string' || encoder.encode(key).byteLength > MAX_REF_BYTES) throw new I18nError('I18N_INPUT', 'Invalid translation source reference')
  const parts = key.split('/')
  if (parts.length !== 3) throw new I18nError('I18N_INPUT', 'Invalid translation source reference')
  const [entity, encodedUid, field] = parts as [string, string, string]
  validatePart(entity, 'entity', ENTITY_PATTERN)
  validatePart(field, 'field', FIELD_PATTERN)
  if (!encodedUid) throw new I18nError('I18N_INPUT', 'Invalid translation source reference')
  let uid: string
  try { uid = decodeURIComponent(encodedUid).normalize('NFC') }
  catch (error) { throw new I18nError('I18N_INPUT', 'Invalid translation source reference encoding', { cause: error }) }
  validatePart(uid, 'uid')
  if (encodeURIComponent(uid) !== encodedUid || encoder.encode(uid).byteLength > MAX_UID_BYTES) {
    throw new I18nError('I18N_INPUT', 'Translation source reference is not canonical')
  }
  const canonical = buildSourceRefKey({ entity, uid, field })
  if (canonical !== key) throw new I18nError('I18N_INPUT', 'Translation source reference is not canonical')
  return { entity, uid, field }
}
