import { defineEventHandler, getCookie, setCookie, getRequestHeader, setResponseHeaders, setResponseStatus, useRuntimeConfig } from '#imports';
import { resolveOptionalSession, useAuthRuntime } from '#ft-teacher-auth';
import { protectJsonWrite } from '#ft-teacher-auth-http';
import { readBoundedJsonBody } from '#ft-teacher-bounded-json';
import { bridgeKey, identityFromSession, signBridgeToken } from '../../../server/bridge-token.mjs';
import { GUEST_COOKIE, GUEST_MAX_AGE, readGuestCookie, signGuestCookie } from '../../../server/guest-cookie.mjs';
import { ROUTES } from '../../../shared/contracts.mjs';

export default defineEventHandler(async event => {
  setResponseHeaders(event, { 'cache-control': 'private, no-store, max-age=0', vary: 'Cookie', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow' });
  const fail = (status, code, message) => { setResponseStatus(event, status); return { protocolVersion: 1, error: { code, message } }; };
  const path = event.path.split('?', 1)[0];
  if (![ROUTES.session, ROUTES.adminOverview, ROUTES.adminSettings, ROUTES.ticket, ROUTES.capabilities, ROUTES.adminVpn, ROUTES.adminVpnCalibrate, ROUTES.adminVpnReconcile,ROUTES.adminShares,ROUTES.adminSharesAction,ROUTES.shareAction].includes(path)) return fail(404, 'FT_NOT_FOUND', 'Route not found');
  const writing = [ROUTES.adminSettings, ROUTES.ticket, ROUTES.adminVpnCalibrate, ROUTES.adminVpnReconcile,ROUTES.adminSharesAction,ROUTES.shareAction].includes(path) && event.method === 'PUT';
  if (([ROUTES.ticket, ROUTES.adminVpnCalibrate, ROUTES.adminVpnReconcile,ROUTES.adminSharesAction,ROUTES.shareAction].includes(path) && !writing) || (event.method !== 'GET' && !writing)) return fail(405, 'FT_METHOD_NOT_ALLOWED', 'Unsupported method');
  if (getRequestHeader(event, 'sec-fetch-site') === 'cross-site') return fail(403, 'FT_FORBIDDEN', 'Same-site request required');
  let requestBody = '';
  if (writing) {
    try {
      const authRuntime = useAuthRuntime(event);
      const mode = [ROUTES.ticket,ROUTES.shareAction].includes(path) && !getCookie(event, authRuntime.cookies.sessionName) ? 'anonymous' : 'session';
      await protectJsonWrite(event, authRuntime, mode);
      requestBody = JSON.stringify(await readBoundedJsonBody(event, 131072));
      if (Buffer.byteLength(requestBody) > 131072) return fail(413, 'FT_BODY_TOO_LARGE', 'Settings are too large');
    } catch (error) { return fail(error.statusCode || 400, 'FT_WRITE_REJECTED', 'Same-origin JSON with valid session CSRF is required'); }
  }
  const config = useRuntimeConfig(event).fileTransfer;
  let key; let origin;
  try {
    if (!config?.signingKey) return fail(503, 'FT_BRIDGE_UNCONFIGURED', 'Identity bridge is not configured');
    key = bridgeKey(config.signingKey, 'private');
    const url = new URL(config.serviceOrigin);
    const localHttp = url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname);
    if ((!localHttp && url.protocol !== 'https:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    origin = url.origin;
  } catch { return fail(503, 'FT_BRIDGE_UNCONFIGURED', 'Identity bridge configuration is invalid'); }
  let session;
  try { session = await resolveOptionalSession(event); }
  catch (error) {
    if (['AUTH_SESSION_INVALID', 'AUTH_SESSION_EXPIRED', 'AUTH_TOKEN_INVALID'].includes(error?.code)) return fail(401, 'FT_AUTH_REQUIRED', 'Session is no longer active');
    return fail(503, 'FT_HOST_AUTH_UNAVAILABLE', 'Account verification is unavailable');
  }
  try {
    let guest = null;
    let guestId = session ? null : readGuestCookie(key, getCookie(event, GUEST_COOKIE));
    if (!session && path === ROUTES.ticket && writing) { guest = signGuestCookie(key, guestId || undefined); guestId = guest.uid; }
    const identity = identityFromSession(session, guestId);
    const token = signBridgeToken(key, identity, path, { method: event.method, body: requestBody });
    const response = await fetch(origin + path, { method: event.method, ...(writing ? { body: requestBody } : {}), headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(writing ? { 'content-type': 'application/json' } : {}) }, signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error();
    const text = await response.text();
    if (text.length > 262144) throw new Error();
    const body = JSON.parse(text);
    if (guest && response.ok) setCookie(event, GUEST_COOKIE, guest.value, { httpOnly: true, sameSite: 'strict', secure: useAuthRuntime(event).cookies.session.secure, path: '/transfer-api', maxAge: GUEST_MAX_AGE });
    setResponseStatus(event, response.status);
    return body;
  } catch { return fail(503, 'FT_SERVICE_UNAVAILABLE', 'File transfer service is temporarily unavailable'); }
});
