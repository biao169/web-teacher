import { transportReadiness } from './network.mjs';
import { byteCount } from './contracts.mjs';
import { policyFor, settingsError } from './settings.mjs';

export const PAIR_LIMITS = Object.freeze({ frameBytes: 16384, dataBytes: 16336, manifestBytes: 12582912, signalBytes: 65536, ticketMs: 30000, leaseMs: 45000, pairingMs: 600000, taskMs: 7200000, idleMs: 120000, rooms: 100, peers: 200 });
export const lanError = (code, status = 409) => settingsError(code, status);
export function ipv4(text) {
  if (typeof text !== 'string' || !/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/u.test(text)) return null;
  const p = text.split('.').map(Number); if (p.some(n => n > 255)) return null;
  return p.reduce((n, x) => n * 256 + x, 0);
}
function privateIp(n) { return n >= 0x0a000000 && n <= 0x0affffff || n >= 0xac100000 && n <= 0xac1fffff || n >= 0xc0a80000 && n <= 0xc0a8ffff; }
export function lanNetworks(text) {
  if (typeof text !== 'string' || text.length > 1000) throw lanError('FT_LAN_CONFIG', 422);
  const list = text.trim() ? text.trim().split(/[\s,;]+/u) : [];
  if (list.length > 16) throw lanError('FT_LAN_CONFIG', 422);
  return list.map(cidr => {
    const [ip, bits, extra] = cidr.split('/'); const n = ipv4(ip); const mask = Number(bits);
    if (extra !== undefined || n === null || !/^(8|9|[12]\d|3[0-2])$/u.test(bits || '')) throw lanError('FT_LAN_CONFIG', 422);
    const width = 2 ** (32 - mask); const low = Math.floor(n / width) * width; const high = low + width - 1;
    if (low !== n || !privateIp(low) || !privateIp(high)) throw lanError('FT_LAN_CONFIG', 422);
    return { cidr, low, high };
  });
}
export function addressAllowed(address, networks) { const n = ipv4(address); return n !== null && networks.some(r => n >= r.low && n <= r.high); }
export function lanReadiness(settings) {
  if (!settings.enabled || !settings.lanEnabled) return 'FT_TOOL_DISABLED';
  if (!settings.lanVerified || !lanNetworks(settings.lanNetworks || '').length) return 'FT_LAN_UNVERIFIED';
  return null;
}
export function assertAccess(settings, identity, role, summary, transport = 'lan-direct', vpn = null) {
  const problem = transportReadiness(settings, transport, vpn); if (problem) throw lanError(problem, 403);
  const rule = policyFor(settings, identity);
  if (!['send', 'receive'].includes(role) || identity.mustChangePassword || !rule[role] || !rule.links.includes(transport)) throw lanError('FT_ACCESS_DENIED', 403);
  // Never silently ignore a configured total before the accounting milestone.
  if (summary) {
    validateSummary(summary);
    if (summary.files > rule.maxFiles) throw lanError('FT_FILE_COUNT_LIMIT', 403);
    if (rule.maxFileBytes !== null && BigInt(summary.maxFileBytes) > BigInt(rule.maxFileBytes)) throw lanError('FT_FILE_SIZE_LIMIT', 403);
    if (rule.maxTaskBytes !== null && BigInt(summary.totalBytes) > BigInt(rule.maxTaskBytes)) throw lanError('FT_TASK_SIZE_LIMIT', 403);
  }
  return rule;
}
export function validateSummary(s) {
  if (!s || Object.keys(s).sort().join(',') !== 'directories,files,manifestHash,maxFileBytes,totalBytes' || !Number.isInteger(s.files) || !Number.isInteger(s.directories) || s.files < 0 || s.directories < 0 || s.files + s.directories < 1 || s.files + s.directories > 20000 || !/^[a-f0-9]{64}$/u.test(s.manifestHash)) throw lanError('FT_PROTOCOL');
  try { byteCount(s.totalBytes); byteCount(s.maxFileBytes); } catch { throw lanError('FT_PROTOCOL'); }
  if (BigInt(s.maxFileBytes) > BigInt(s.totalBytes) || (!s.files && s.totalBytes !== '0')) throw lanError('FT_PROTOCOL');
  return s;
}
export function candidateAllowed(line, networks) {
  const p = line.replace(/^a=/u, '').trim().split(/\s+/u);
  return p[0]?.startsWith('candidate:') && p[1] === '1' && p[2]?.toLowerCase() === 'udp' && addressAllowed(p[4], networks) && Number(p[5]) > 0 && Number(p[5]) <= 65535 && p[6] === 'typ' && p[7] === 'host';
}
export function safeDescription(description, networks) {
  if (!description || !['offer', 'answer'].includes(description.type) || typeof description.sdp !== 'string' || description.sdp.length > PAIR_LIMITS.signalBytes - 1000) throw lanError('FT_PROTOCOL');
  const lines = description.sdp.split(/\r?\n/u);
  if (lines.filter(l => l.startsWith('m=')).length !== 1 || !lines.some(l => /^m=application \d+ UDP\/DTLS\/SCTP webrtc-datachannel$/u.test(l)) || !lines.some(l => l.startsWith('a=fingerprint:sha-256 '))) throw lanError('FT_PROTOCOL');
  const candidates = lines.filter(l => l.startsWith('a=candidate:') && candidateAllowed(l, networks));
  if (!candidates.length) throw lanError('FT_LAN_ADDRESS_HIDDEN');
  return { type: description.type, sdp: lines.filter(l => !l.startsWith('a=candidate:') && !l.startsWith('a=remote-candidates:') && !l.startsWith('a=ice-options:') || candidates.includes(l)).join('\r\n') };
}
export function validateRoute(route, networks) {
  if (!route || !route.local || !route.remote) throw lanError('FT_ROUTE_UNKNOWN');
  for (const c of [route.local, route.remote]) {
    if (c.type !== 'host' || c.protocol !== 'udp' || !Number.isInteger(c.port) || c.port < 1 || c.port > 65535 || !addressAllowed(c.address, networks)) throw lanError('FT_ROUTE_UNKNOWN');
  }
  if (!networks.some(r => [route.local, route.remote].every(c => ipv4(c.address) >= r.low && ipv4(c.address) <= r.high))) throw lanError('FT_ROUTE_UNKNOWN');
  return route;
}
export function routesMatch(a, b) { return a.local.address === b.remote.address && a.local.port === b.remote.port && a.remote.address === b.local.address && a.remote.port === b.local.port; }
