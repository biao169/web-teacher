/** Public, versioned constants only. Never import server configuration here. */
export const SERVICE = Object.freeze({ name: 'academic-file-transfer', version: '0.10.0', milestone: 10, protocolVersion: 1 });
export const ROUTES = Object.freeze({
  publicZh: '/zh/transfer', publicEn: '/en/transfer', admin: '/transfer-admin/',
  apiPrefix: '/transfer-api/v1', health: '/transfer-api/health', ready: '/transfer-api/ready',
  capabilities: '/transfer-api/v1/capabilities', signal: '/transfer-api/v1/signal',
  ticket: '/transfer-api/v1/pairing-ticket',
  session: '/transfer-api/v1/session', adminOverview: '/transfer-api/v1/admin/overview',
  adminSettings: '/transfer-api/v1/admin/settings',
  shareAction: '/transfer-api/v1/share-action',
  adminShares: '/transfer-api/v1/admin/shares', adminSharesAction: '/transfer-api/v1/admin/shares/action',
  adminVpn: '/transfer-api/v1/admin/vpn', adminVpnCalibrate: '/transfer-api/v1/admin/vpn/calibrate', adminVpnReconcile: '/transfer-api/v1/admin/vpn/reconcile',
});
export const TRANSPORTS = Object.freeze(['lan-direct', 'wan-direct', 'server-relay', 'temporary-share']);
export const VPN_PATHS = Object.freeze(['confirmed-outside-vpn', 'confirmed-vpn', 'unknown']);
export const PERMISSIONS = Object.freeze(['transfer.send', 'transfer.receive', 'transfer.manage']);
export const DISABLED_REASON = 'FT_NOT_IMPLEMENTED';

/** Decimal strings keep byte totals lossless across JSON and SQLite boundaries. */
export function byteCount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/u.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new TypeError('Byte count must be a non-negative signed-64-bit decimal string');
  }
  return value;
}

/** Infrastructure readiness is intentionally separate from transfer availability. */
export function capabilities(identityBridgeAvailable = false, lanAvailable = false, paths = null) {
  return {
    ...SERVICE, phase: 'multi-transport', transferAvailable: paths?paths.some(p=>p.available):lanAvailable, identityBridgeAvailable,
    lanPairingAvailable: true, frontendAvailable: true, adminAvailable: true, fileHandlingAvailable: true, quotaEnforcementAvailable: false, personalAllowanceAvailable: true, vpnMeteringAvailable: true, controlledBudgetAvailable: true, hardExitCapAvailable: false,
    recoveryAvailable:true, controlledRelayAvailable:true, temporarySharingAvailable:true, internetDirectAvailable:true,
    transports: paths || TRANSPORTS.map(id => ({ id, available: id === 'lan-direct' && lanAvailable, reason: id === 'lan-direct' ? (lanAvailable ? null : 'FT_LAN_UNVERIFIED') : DISABLED_REASON })),
    message: { zh: '支持经核验的直连、受控中继与临时分享；具体方式须符合权限、网络和出口额度。', en: 'Verified direct transfers, controlled relay and temporary sharing follow access, network and exit budgets.' },
  };
}
