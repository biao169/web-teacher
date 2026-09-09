import { createPublicKey, randomUUID, sign, verify } from 'node:crypto';
import { guestIdValid } from './usage.mjs';

export const GUEST_COOKIE = 'ft_guest_v1';
export const GUEST_MAX_AGE = 30 * 86400;
const prefix = 'academic-file-transfer-guest-v1:';
export function signGuestCookie(key, uid = 'guest:' + randomUUID(), now = Math.floor(Date.now() / 1000)) {
  if (!guestIdValid(uid)) throw new Error('FT_GUEST_ID');
  const payload = Buffer.from(JSON.stringify({ uid, exp: now + GUEST_MAX_AGE })).toString('base64url');
  return { uid, value: payload + '.' + sign(null, Buffer.from(prefix + payload), key).toString('base64url') };
}
export function readGuestCookie(key, value, now = Math.floor(Date.now() / 1000)) {
  try {
    if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value)) return null;
    const [payload, signature] = value.split('.'); const bytes = Buffer.from(signature, 'base64url');
    if (bytes.length !== 64 || bytes.toString('base64url') !== signature || !verify(null, Buffer.from(prefix + payload), key.type === 'private' ? createPublicKey(key) : key, bytes)) return null;
    const item = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Object.keys(item).sort().join(',') !== 'exp,uid' || !guestIdValid(item.uid) || !Number.isSafeInteger(item.exp) || item.exp <= now || item.exp > now + GUEST_MAX_AGE) return null;
    return item.uid;
  } catch { return null; }
}
