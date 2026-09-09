import { createPrivateKey, createPublicKey, createHash, sign, verify, randomUUID } from 'node:crypto';

import { guestIdValid } from './usage.mjs';

export const BRIDGE_ISSUER = 'academic-teacher-site';
export const BRIDGE_AUDIENCE = 'academic-file-transfer';
export const BRIDGE_TTL = 30;
const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: 'ft-bridge-v1' })).toString('base64url');
const safeString = (value, max = 200) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);

export function bridgeKey(encoded, kind) {
  if (typeof encoded !== 'string' || encoded.length > 2048 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) throw new Error('FT_BRIDGE_KEY');
  const bytes = Buffer.from(encoded, 'base64');
  const key = kind === 'private' ? createPrivateKey({ key: bytes, format: 'der', type: 'pkcs8' }) : createPublicKey({ key: bytes, format: 'der', type: 'spki' });
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('FT_BRIDGE_KEY');
  return key;
}

export function validateIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity) || Object.keys(identity).sort().join(',') !== 'kind,mustChangePassword,name,roleId,roleName,sessionVersion,uid') throw new Error('FT_IDENTITY');
  if (identity.kind === 'anonymous') {
    if ((identity.uid !== null && !guestIdValid(identity.uid)) || identity.name !== null || identity.roleId !== null || identity.roleName !== null || identity.sessionVersion !== null || identity.mustChangePassword !== false) throw new Error('FT_IDENTITY');
  } else if (identity.kind === 'user') {
    if (![identity.uid, identity.name, identity.roleId, identity.roleName, identity.sessionVersion].every(value => safeString(value)) || typeof identity.mustChangePassword !== 'boolean') throw new Error('FT_IDENTITY');
  } else throw new Error('FT_IDENTITY');
  return identity;
}

/** Called only after the host has resolved its live session. No browser-supplied identity. */
export function identityFromSession(session, guestId = null) {
  if (!session) return validateIdentity({ kind: 'anonymous', uid: guestId, name: null, roleId: null, roleName: null, sessionVersion: null, mustChangePassword: false });
  const p = session.principal;
  return validateIdentity({ kind: 'user', uid: p.userUid, name: p.displayName || p.username, roleId: p.roleUid, roleName: p.roleName, sessionVersion: p.sessionUid, mustChangePassword: p.mustChangePassword });
}

export const bodyDigest = body => createHash('sha256').update(body).digest('hex');
export function signBridgeToken(privateKey, identity, path, { now = Math.floor(Date.now() / 1000), jti = randomUUID(), method = 'GET', body = '' } = {}) {
  validateIdentity(identity);
  if (!['GET', 'PUT'].includes(method)) throw new Error('FT_METHOD');
  const payload = Buffer.from(JSON.stringify({ iss: BRIDGE_ISSUER, aud: BRIDGE_AUDIENCE, iat: now, exp: now + BRIDGE_TTL, jti, method, path, bodyHash: bodyDigest(body), identity })).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${sign(null, Buffer.from(input), privateKey).toString('base64url')}`;
}

export function verifyBridgeToken(publicKey, token, path, now = Math.floor(Date.now() / 1000), method = 'GET', body = '') {
  try {
    if (typeof token !== 'string' || token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) throw new Error();
    const [protectedPart, payload, signature] = token.split('.');
    if (protectedPart !== header) throw new Error();
    const signatureBytes = Buffer.from(signature, 'base64url');
    if (signatureBytes.length !== 64 || signatureBytes.toString('base64url') !== signature || !verify(null, Buffer.from(`${protectedPart}.${payload}`), publicKey, signatureBytes)) throw new Error();
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (Object.keys(claims).sort().join(',') !== 'aud,bodyHash,exp,iat,identity,iss,jti,method,path' || claims.iss !== BRIDGE_ISSUER || claims.aud !== BRIDGE_AUDIENCE || claims.method !== method || claims.bodyHash !== bodyDigest(body) || claims.path !== path || !/^[0-9a-f-]{36}$/u.test(claims.jti)) throw new Error();
    if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) || claims.exp - claims.iat !== BRIDGE_TTL || claims.iat > now + 3 || claims.exp <= now) throw new Error();
    validateIdentity(claims.identity);
    return claims;
  } catch { throw new Error('FT_AUTH_REQUIRED'); }
}
