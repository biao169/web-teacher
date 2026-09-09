export interface ToolSession {
  authenticated: boolean
  user: { uid: string; name: string; roleId: string; roleName: string; mustChangePassword: boolean } | null
  permissions: string[]
  capabilities: { transferAvailable: boolean; identityBridgeAvailable: boolean; deployment?: 'cloudflare'|'standalone' }
  policy: PublicPolicy
}
export interface SettingField { key: string; zh: string; en: string; type: string; value: unknown; nullable?: boolean; min?: number; max?: number; options?: string[][] }
export interface AccessRule { kind: string; id: string; links: string[]; send: boolean; receive: boolean; lanRateKbps: number | null; wanRateKbps: number | null; source?: string; rateSource?:{lan:string;wan:string}; [key: string]: unknown }
export interface ToolSettings { rules: AccessRule[]; [key: string]: unknown }
export interface SettingsSnapshot { revision: number; settings: ToolSettings; managers: string[]; updatedAt: string; updatedBy: string; audit: { revision: number; changed_at: string; changed_by: string; action: string }[] }
export interface AllowancePeriod { limitBytes:string|null; usedBytes:string; reservedBytes:string; remainingBytes:string|null; resetAt:number }
export interface AllowanceTotals { activeTasks:number; concurrency:number; daily:AllowancePeriod; monthly:AllowancePeriod }
export interface AllowanceUsage { established:boolean; basis:string; timeZone:string; personal:AllowanceTotals|null; guestPool:AllowanceTotals|null }
export interface VpnPeriod { usedBytes:string|null; limitBytes:string|null; safetyBytes:string; reservedBytes:string; pendingBytes:string; remainingBytes:string|null; resetAt:number }
export interface VpnStatus { mode:string;source:string;unit:'GB'|'GiB';timeZone:string;billing:string;observedAt:number|null;estimated:boolean;hardLimitAvailable:boolean;meterAvailable:boolean;activeReservations:number;pendingBytes:string;reservedBytes:string;warning:boolean;reason:string|null;eligibleForControlledTransfer:boolean;daily:VpnPeriod;monthly:VpnPeriod;revision?:number;audit?:{at:number;actor:string;action:string;details:string}[] }
export interface CloudBudget { enabled:boolean;blocked:boolean;daily:{period:string;usedBytes:string;limitBytes:string;remainingBytes:string};monthly:{period:string;usedBytes:string;limitBytes:string;remainingBytes:string} }
export interface PublicPolicy { cloudBudget?:CloudBudget|null; recovery?:{hours:number;checkpointMiB:number;automaticRetries:number}; vpn?:VpnStatus|null; usage?:AllowanceUsage|null; accessReasons?: Record<string,string>; enabled: boolean; notice: { zh: string; en: string }; rule: AccessRule; links: { id: string; configured: boolean; available: boolean; accessReasons?:Record<string,string|null>; reason?:string|null }[]; vpnGuard: boolean; vpnBudgetConfigured: boolean; meteringAvailable: boolean; transferAvailable: boolean }
export interface ToolOverview {
  session: ToolSession
  service: { name: string; version: string; milestone: number }
  managers: { user_uid: string; granted_at: string; granted_by: string }[]
  settingsAvailable: boolean
  transferAvailable: boolean
}
