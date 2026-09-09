import { settingsError } from '../shared/settings.mjs';

// Internal adapter for the controlled transports added in step 8. This is not
// a public upload route and does not turn a P2P connection into a controlled one.
// read(size, signal) and write(bytes, signal) must honor cancellation and size.
export async function copyMetered({ budget, totalBytes, direction, path, read, write, signal, chunkBytes = 65536, now = Date.now }) {
  if (!['inbound', 'outbound', 'both'].includes(direction) || !Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > 65536) throw settingsError('FT_VPN_LEASE', 422);
  let remaining = BigInt(totalBytes), transferred = 0n;
  if (remaining < 0n) throw settingsError('FT_VPN_LEASE', 422);
  while (remaining > 0n) {
    if (signal?.aborted) throw settingsError('FT_CANCELLED', 409);
    const length = Number(remaining < BigInt(chunkBytes) ? remaining : BigInt(chunkBytes));
    const rxBytes = direction === 'outbound' ? '0' : String(length), txBytes = direction === 'inbound' ? '0' : String(length);
    const grant = budget.reserve({ rxBytes, txBytes, path }, now()), controller = new AbortController();
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    let timer, check, rejectStop;
    const stopped = new Promise((_, reject) => { rejectStop = reject; });
    const stop = cause => { controller.abort(); rejectStop(cause); };
    try {
      controller.signal.addEventListener('abort', () => rejectStop(settingsError('FT_VPN_LEASE', 403)), { once: true });
      timer = setTimeout(() => stop(settingsError('FT_VPN_LEASE', 403)), Math.max(1, grant.expiresAt - now()));
      check = setInterval(() => { try { budget.assertGrant(grant.token, now()); } catch (e) { stop(e); } }, 100);
      // Book the bounded maximum before initiating any possibly metered read.
      budget.spend(grant.token, { sequence: 1, rxBytes, txBytes }, now());
      await Promise.race([stopped, (async () => {
        const bytes = await read(length, controller.signal);
        if (controller.signal.aborted) throw settingsError('FT_VPN_LEASE', 403);
        if (!(bytes instanceof Uint8Array) || bytes.length !== length) throw settingsError('FT_INTEGRITY', 422);
        budget.assertGrant(grant.token, now()); await write(bytes, controller.signal);
      })()]);
      remaining -= BigInt(length); transferred += BigInt(length);
    } finally { clearTimeout(timer); clearInterval(check); signal?.removeEventListener('abort', abort); budget.finish(grant.token, now()); }
  }
  return { bytes: transferred.toString() };
}
