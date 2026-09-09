/** Early design contracts (not the live settings schema); implemented shapes live in bridge-token.mjs, settings.mjs and client.ts. Types alone grant no authority. */
export type ByteCount = string; // Runtime validation: byteCount(), unit = bytes.
export type ByteLimit = ByteCount | null; // null = unlimited; "0" = disallowed.
export type Transport = 'lan-direct' | 'wan-direct' | 'server-relay' | 'temporary-share';
export type VpnPath = 'confirmed-outside-vpn' | 'confirmed-vpn' | 'unknown';
export type Permission = 'transfer.send' | 'transfer.receive' | 'transfer.manage';
export type Locale = 'zh' | 'en';
export interface VerifiedIdentity {
  kind: 'anonymous' | 'user';
  subject: string; // Guest/session ID or teacher UID, from verified server assertion.
  roleIds: string[];
  permissions: Permission[];
  issuer: string;
  audience: 'academic-file-transfer';
  issuedAt: number; expiresAt: number; // Unix seconds.
  tokenId: string;
  sessionVersion: string; // Logout, account disablement and role revocation.
}
export interface TransferPolicy {
  allowSend: boolean; allowReceive: boolean;
  allowedTransports: Transport[];
  maxFileBytes: ByteLimit; maxTaskBytes: ByteLimit; maxFiles: number;
  maxConcurrentTasks: number;
  dailyUserBytes: ByteLimit; monthlyUserBytes: ByteLimit;
  rateBytesPerSecond: Record<Transport, ByteLimit>;
  enforcement: 'cooperative-client' | 'controlled-egress';
}
export interface PolicyRules {
  anonymous: TransferPolicy;
  roles: Record<string, Partial<TransferPolicy>>;
  users: Record<string, Partial<TransferPolicy>>;
  globalCeilings: TransferPolicy;
}
export interface PathAssessment {
  transport: Transport;
  vpnPath: VpnPath;
  meteredEgressId: string | null;
  evidence: 'unverified' | 'deployment-route-and-candidate';
  assessedAt: string;
}
export interface VpnBudget {
  egressId: string;
  mode: 'strict' | 'estimate';
  dailyLimitBytes: ByteLimit; monthlyLimitBytes: ByteLimit;
  safetyReserveBytes: ByteCount;
  displayUnit: 'GB' | 'GiB';
  billingDirection: 'ingress' | 'egress' | 'both';
  resetTimezone: string; // IANA zone; local midnight / first day of month.
  warnAtPercent: number;
  counterSource: 'unconfigured' | 'controlled-egress' | 'provider' | 'manual';
  cutoffAvailable: boolean;
}
export interface UsageLedger {
  userPayloadBytes: ByteCount;
  serverRelayIngressBytes: ByteCount; serverRelayEgressBytes: ByteCount;
  vpnBillableBytes: ByteCount; vpnReservedBytes: ByteCount;
  measuredAt: string | null; // Missing/stale counter blocks strict metered paths.
  nextDailyResetAt: string; nextMonthlyResetAt: string;
}
export interface QuotaReservation {
  id: string; taskId: string; egressId: string;
  dailyWindowId: string; monthlyWindowId: string;
  reservedBytes: ByteCount; settledBytes: ByteCount;
  expiresAt: string;
  state: 'reserved' | 'settled' | 'released';
}
export type TransferState = 'draft' | 'pairing' | 'awaiting-confirmation' | 'checking-policy' | 'transferring' | 'paused' | 'verifying' | 'completed' | 'cancelled' | 'failed';
export interface ManifestEntry {
  relativePath: string; kind: 'file' | 'directory';
  sizeBytes: ByteCount; modifiedAt: number | null;
}
export type ErrorCode = 'FT_NOT_IMPLEMENTED' | 'FT_NOT_FOUND' | 'FT_METHOD_NOT_ALLOWED' | 'FT_NOT_READY' | 'FT_FORBIDDEN' | 'FT_AUTH_REQUIRED' | 'FT_QUOTA_EXHAUSTED' | 'FT_METER_UNAVAILABLE' | 'FT_PATH_UNCONFIRMED' | 'FT_INVALID_INPUT' | 'FT_INTERNAL' | 'FT_BRIDGE_UNCONFIGURED' | 'FT_SERVICE_UNAVAILABLE' | 'FT_HOST_AUTH_UNAVAILABLE' | 'FT_VALIDATION' | 'FT_CONFLICT' | 'FT_WRITE_REJECTED' | 'FT_BODY_TOO_LARGE' | 'FT_CONTENT_TYPE';
export interface ApiError {
  protocolVersion: 1;
  error: { code: ErrorCode; message: string; retryAt?: string; affectedTransports?: Transport[] };
}
