import { WebSocketServer } from 'ws';
import { createPairingCore } from './pairing-core.mjs';
import { PAIR_LIMITS } from '../shared/lan.mjs';
export function createPairing(storage, options = {}) { return createPairingCore(storage, { ...options, socketServer: new WebSocketServer({ noServer: true, maxPayload: PAIR_LIMITS.signalBytes, perMessageDeflate: false, clientTracking: false }) }); }
