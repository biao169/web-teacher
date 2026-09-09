import {transportReadiness} from '../shared/network.mjs';
import {TRANSPORTS} from '../shared/contracts.mjs';
import { createMeterMonitor } from './meter-source.mjs';
import { lanReadiness } from '../shared/lan.mjs';
import { createPairing } from './pairing.mjs';
import { createServer } from 'node:http';
import { SERVICE, ROUTES, capabilities, DISABLED_REASON } from '../shared/contracts.mjs';
import { openStorage } from './storage.mjs';
import { bridgeKey, verifyBridgeToken } from './bridge-token.mjs';
import { publicPolicy, settingsError } from '../shared/settings.mjs';
import { acquireRuntimeLock } from './runtime-lock.mjs';

const disabled = /^\/transfer-api\/v1\/(?:signal|auth|admin|tasks|pairings|uploads|downloads|shares|turn|quota)(?:\/|$)/u;
const apiError = (code, message) => ({ protocolVersion: SERVICE.protocolVersion, error: { code, message } });

export function createService(config, { storageFactory = openStorage } = {}) {
  const release = acquireRuntimeLock(config);
  let storage, publicKey, recovered, pairing, meter;
  try {
    storage = storageFactory(config);
    publicKey = config.bridgePublicKey ? bridgeKey(config.bridgePublicKey, 'public') : null;
    storage.recovery?.recover();
    recovered = storage.shares?.recover();
    pairing = createPairing(storage);
    meter = createMeterMonitor(storage, config);
  } catch (e) { try { storage?.close(); } finally { release(); } throw e; }
  const paths=()=>{const s=storage.readSettings().settings,vpn=storage.vpn.view();return TRANSPORTS.map(id=>{const reason=transportReadiness(s,id,vpn);return{id,available:!!publicKey&&!reason,reason:!publicKey?'FT_BRIDGE_UNCONFIGURED':reason}})};
  let stopping = false;
  const server = createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    const send = (status, body, headers = {}) => {
      const bytes = Buffer.from(JSON.stringify(body));
      // Only bounded settings JSON. No file serving, cookies, CORS or outbound connections.
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8', 'content-length': bytes.length,
        'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
        'x-robots-tag': 'noindex, nofollow', connection: 'close', ...headers,
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    };
    try {
      // Only origin-form URLs; never normalize traversal into a valid route.
      const raw = req.url ?? '';
      if (!raw.startsWith('/') || raw.startsWith('//') || /[\\%#]/u.test(raw)) return send(400, apiError('FT_INVALID_INPUT', 'Invalid request path'));
      const path = raw.split('?', 1)[0];
      if (path.split('/').some(part => part === '.' || part === '..')) return send(400, apiError('FT_INVALID_INPUT', 'Invalid request path'));
      if ([ROUTES.session, ROUTES.adminOverview, ROUTES.adminSettings, ROUTES.ticket, ROUTES.adminVpn, ROUTES.adminVpnCalibrate, ROUTES.adminVpnReconcile,ROUTES.adminShares,ROUTES.adminSharesAction,ROUTES.shareAction].includes(path)) {
        const writing = [ROUTES.adminSettings, ROUTES.ticket, ROUTES.adminVpnCalibrate, ROUTES.adminVpnReconcile,ROUTES.adminSharesAction,ROUTES.shareAction].includes(path) && req.method === 'PUT';
        const allowed = [ROUTES.ticket, ROUTES.adminVpnCalibrate, ROUTES.adminVpnReconcile,ROUTES.adminSharesAction,ROUTES.shareAction].includes(path) ? ['PUT'] : path === ROUTES.adminSettings ? ['GET', 'PUT'] : ['GET'];
        if (!allowed.includes(req.method)) return send(405, apiError('FT_METHOD_NOT_ALLOWED', 'Unsupported method'), { allow: allowed.join(', ') });
        if (!publicKey) return send(503, apiError('FT_BRIDGE_UNCONFIGURED', 'Identity bridge is not configured'));
        let rawBody = Buffer.alloc(0);
        if (writing) {
          if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(req.headers['content-type'] || '') || req.headers['content-encoding']) throw settingsError('FT_CONTENT_TYPE', 415);
          if (Number(req.headers['content-length']) > 131072) throw settingsError('FT_BODY_TOO_LARGE', 413);
          const chunks = []; let size = 0;
          req.setTimeout(5000, () => req.destroy());
          for await (const chunk of req) { size += chunk.length; if (size > 131072) throw settingsError('FT_BODY_TOO_LARGE', 413); chunks.push(chunk); }
          rawBody = Buffer.concat(chunks);
        }
        let claims;
        try {
          const authorization = req.headers.authorization;
          if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) throw new Error();
          claims = verifyBridgeToken(publicKey, authorization.slice(7), path, Math.floor(Date.now() / 1000), req.method, rawBody);
          if (!storage.consumeNonce(claims.jti, claims.exp, Math.floor(Date.now() / 1000))) throw new Error();
        } catch { return send(401, apiError('FT_AUTH_REQUIRED', 'A fresh verified host authorization is required')); }
        const identity = claims.identity;
        if (path === ROUTES.ticket) {
          let input; try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody)); } catch { throw settingsError('FT_PROTOCOL', 422); }
          return send(200, pairing.issue(identity, input));
        }
        const manager = identity.kind === 'user' && !identity.mustChangePassword && storage.isManager(identity.uid);
        const user = identity.kind === 'user' ? { uid: identity.uid, name: identity.name, roleId: identity.roleId, roleName: identity.roleName, mustChangePassword: identity.mustChangePassword } : null;
        const session = { authenticated: Boolean(user), user, permissions: manager ? ['transfer.manage'] : [], capabilities: capabilities(true,!lanReadiness(storage.readSettings().settings),paths()), policy: publicPolicy(storage.readSettings().settings, identity, storage.usage.snapshot(identity, storage.readSettings().settings), storage.vpn.view()) };
        if (path === ROUTES.session) return send(200, session);
        if(path===ROUTES.shareAction){let input;try{input=JSON.parse(rawBody.toString('utf8'))}catch{throw settingsError('FT_PROTOCOL',422)}
          if(!input||typeof input!=='object'||Object.keys(input).sort().join(',')!=='id'||typeof input.id!=='string')throw settingsError('FT_PROTOCOL',422);
          storage.shares.revoke(input.id,identity);return send(200,{revoked:true});}
        if (!user) return send(401, apiError('FT_AUTH_REQUIRED', 'Sign in to continue'));
        if (!manager) return send(403, apiError('FT_FORBIDDEN', 'File transfer management permission is required'));
        if(path===ROUTES.adminShares)return send(200,storage.shares.list());
        if(path===ROUTES.adminSharesAction){let input;try{input=JSON.parse(rawBody.toString('utf8'))}catch{throw settingsError('FT_PROTOCOL',422)}
          if(input?.action==='cleanup'&&Object.keys(input).join(',')==='action')return send(200,{...await pairing.cleanupShares(),...storage.shares.list()});
          if(input?.action==='revoke'&&Object.keys(input).sort().join(',')==='action,id'&&typeof input.id==='string'){storage.shares.revoke(input.id,identity,true);return send(200,storage.shares.list());}
          throw settingsError('FT_PROTOCOL',422);}
        if (path === ROUTES.adminVpn) return send(200, storage.vpn.view(Date.now(), true));
        if ([ROUTES.adminVpnCalibrate, ROUTES.adminVpnReconcile].includes(path)) {
          let input; try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody)); } catch { throw settingsError('FT_VALIDATION', 422); }
          return send(200, path === ROUTES.adminVpnCalibrate ? storage.vpn.calibrate(input, identity.uid) : storage.vpn.reconcile(input, identity.uid));
        }
        if (path === ROUTES.adminSettings) {
          if (!writing) return send(200, storage.readSettings());
          let submission;
          try { submission = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody)); } catch { throw settingsError('FT_VALIDATION', 422, { settings: 'json' }); }
          return send(200, storage.saveSettings(submission, identity.uid));
        }
        return send(200, { session, service: SERVICE, managers: storage.listManagers(), settingsAvailable: true, transferAvailable: session.policy.transferAvailable });
      }
      if (disabled.test(path)) return send(503, apiError(DISABLED_REASON, 'This endpoint is not available'));
      if (![ROUTES.health, ROUTES.ready, ROUTES.capabilities].includes(path)) return send(404, apiError('FT_NOT_FOUND', 'Route not found'));
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, apiError('FT_METHOD_NOT_ALLOWED', 'Use GET or HEAD'), { allow: 'GET, HEAD' });
      if (path === ROUTES.health) return send(200, { ...SERVICE, status: 'ok', phase: 'multi-transport' });
      if (path === ROUTES.capabilities) return send(200, capabilities(Boolean(publicKey),Boolean(publicKey)&&!lanReadiness(storage.readSettings().settings),paths()));
      const ready = !stopping && storage.health();
      return send(ready ? 200 : 503, { ...SERVICE, status: ready ? 'ready' : 'not-ready', checks: { storage: ready }, transferAvailable: ready && paths().some(path => path.available) });
    } catch (error) {
      if (res.destroyed || res.headersSent) return;
      if (error.status && error.code?.startsWith('FT_')) return send(error.status, { ...apiError(error.code, error.code), fields: error.fields ?? {} });
      send(500, apiError('FT_INTERNAL', 'Service error'));
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 1_000;
  server.maxRequestsPerSocket = 1;
  server.on('upgrade', pairing.upgrade);
  server.on('clientError', (_error, socket) => socket.destroy());
  let closePromise;
  return {
    server,
    async listen() {
      if (stopping) throw new Error('FT_STOPPED');
      await recovered;
      await new Promise((accept, reject) => {
        const onError = error => { server.off('listening', onListen); reject(error); };
        const onListen = () => { server.off('error', onError); accept(); };
        server.once('error', onError); server.once('listening', onListen);
        server.listen(config.port, config.host);
      });
      meter.start(); return server.address();
    },
    close() {
      if (closePromise) return closePromise;
      stopping = true; const pairingClosed = pairing.close();
      closePromise = Promise.all([pairingClosed,meter.close(),recovered]).then(() => new Promise((accept, reject) => {
        const finish = error => {
          try { storage.close(); } finally { release(); }
          if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error); else accept();
        };
        server.close(finish);
        server.closeAllConnections();
      })).catch(error => { try { storage.close(); } finally { release(); } throw error; });
      return closePromise;
    },
  };
}
