import { defineWebSocketHandler, useRuntimeConfig } from '#imports';
import WebSocket from 'ws';
import { ROUTES } from '../../../shared/contracts.mjs';

// Same-origin bounded signaling and controlled-data bridge. The independent
// service validates every relay/share envelope and authorizes bounded bytes.
const upstreams = new Map();
export default defineWebSocketHandler({
  open(peer) {
    try {
      const origin = peer.request.headers.get('origin');
      const requestUrl = new URL(peer.request.url);
      if (!origin || new URL(origin).host !== requestUrl.host || peer.request.headers.get('sec-fetch-site') === 'cross-site') throw new Error();
      const url = new URL(useRuntimeConfig().fileTransfer.serviceOrigin);
      if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error();
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.pathname = ROUTES.signal;
      const ws = new WebSocket(url, { maxPayload: 65536, perMessageDeflate: false, handshakeTimeout: 5000 });
      const state = { ws, queue: [], bytes: 0 }; upstreams.set(peer.id, state);
      ws.on('open', () => { for (const data of state.queue) ws.send(data); state.queue = []; state.bytes = 0; });
      ws.on('message', (data, binary) => { if (binary || data.length > 65536) { peer.close(1008, 'Invalid signal'); ws.terminate(); } else peer.send(data.toString('utf8')); });
      ws.on('error', () => peer.close(1011, 'Signaling unavailable'));
      ws.on('close', () => { upstreams.delete(peer.id); peer.close(1000, 'Signaling closed'); });
    } catch { peer.close(1008, 'Same-origin connection required'); }
  },
  message(peer, message) {
    const state = upstreams.get(peer.id); if (!state) return peer.close(1008, 'Not connected');
    const data = message.text();
    if (Buffer.byteLength(data) > 65536 || state.ws.bufferedAmount > 131072) { state.ws.terminate(); return peer.close(1009, 'Signal too large'); }
    if (state.ws.readyState === 1) state.ws.send(data);
    else if (state.ws.readyState === 0 && state.bytes + Buffer.byteLength(data) <= 65536) { state.queue.push(data); state.bytes += Buffer.byteLength(data); }
    else peer.close(1008, 'Not connected');
  },
  close(peer) { const state = upstreams.get(peer.id); upstreams.delete(peer.id); state?.ws.terminate(); },
  error(peer) { const state = upstreams.get(peer.id); upstreams.delete(peer.id); state?.ws.terminate(); },
});
