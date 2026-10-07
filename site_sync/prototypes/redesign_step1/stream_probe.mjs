// Isolated adapter experiment; never mounted in the teacher website.
export const PART_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export async function forwardPart(upload, response, {offset, total, etag}) {
  // Fixed R2 storage parts are distinct from adjustable record/network slices.
  const size = Math.min(PART_BYTES, total - offset);
  const valid = Number.isSafeInteger(total) && total > 0 && total <= MAX_FILE_BYTES &&
    Number.isSafeInteger(offset) && offset >= 0 && offset < total &&
    offset % PART_BYTES === 0 && typeof etag === 'string' && /^"[^"\r\n]+"$/.test(etag) &&
    response.status === 206 && response.headers.get('etag') === etag &&
    response.headers.get('content-range') === `bytes ${offset}-${offset + size - 1}/${total}` &&
    response.headers.get('content-length') === String(size) &&
    (!response.headers.has('content-encoding') || response.headers.get('content-encoding') === 'identity') &&
    response.body && !response.bodyUsed;
  if (!valid) {
    if (response.body && !response.bodyUsed) await response.body.cancel();
    throw new Error('invalid or changed source range');
  }
  // Pass the native stream itself: no arrayBuffer/text/json, JS/Python chunk
  // conversion, tee, full-file hash, or loop over tiny R2 objects.
  return await upload.uploadPart(offset / PART_BYTES + 1, response.body);
}

export async function completeFile(bucket, upload, parts, {key, total, operation, source}) {
  // Caller persists this intent before createMultipartUpload and writes the
  // same ownership metadata there. key is unique staging, never a live key.
  // Business publication happens only AFTER this verified result is saved.
  const verify = obj => {
    if (!obj || obj.size !== total || obj.customMetadata?.sync_operation !== operation ||
        obj.customMetadata?.sync_source !== source)
      throw new Error('unverified completion; do not publish or delete unknown output');
    return {key, size:obj.size, etag:obj.etag};
  };
  const prior = await bucket.head(key);
  if (prior) return verify(prior); // A completion response may have been lost.
  await upload.complete(parts);
  return verify(await bucket.head(key));
}

export default {
  async fetch(request) {
    // Health-only minimal entry. No public mutation API, bindings or Cron.
    if (request.method !== 'GET' || new URL(request.url).pathname !== '/health')
      return new Response('Not found', {status: 404});
    return Response.json({prototype: true, productionSync: false},
      {headers: {'cache-control': 'no-store'}});
  }
};
