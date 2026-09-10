import type { DatabaseAdapter, RawRow, SqlCommand } from '../../../db/contracts'
import { read } from '../../../db/query'
import type { AdminDashboardOperationView } from '../../../shared/contracts/admin'
import type { AuthenticatedPrincipal } from '../../security/permissions'
import { hasPermission } from '../../security/permissions'
import { SecurityError } from '../../security/errors'
export const ADMIN_RECENT_OPERATION_LIMIT = 8
function finiteCount(value: unknown, field: string): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new SecurityError('AUTH_PROTOCOL', `Invalid admin dashboard count: ${field}`); return value }
function requiredString(value: unknown, field: string, maximum: number): string { if (typeof value !== 'string' || !value.trim() || new TextEncoder().encode(value).byteLength > maximum) throw new SecurityError('AUTH_PROTOCOL', `Invalid admin dashboard field: ${field}`); return value }
function optionalString(value: unknown, field: string, maximum: number): string | null { if (value === null || value === undefined || value === '') return null; if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > maximum) throw new SecurityError('AUTH_PROTOCOL', `Invalid admin dashboard field: ${field}`); return value.trim() ? value : null }
function operationView(row: RawRow): AdminDashboardOperationView {
  const createdAt = requiredString(row.created_at, 'created_at', 64); if (!Number.isFinite(Date.parse(createdAt))) throw new SecurityError('AUTH_PROTOCOL', 'Invalid operation timestamp')
  return Object.freeze({ uid: requiredString(row.uid,'uid',256), actorName: optionalString(row.actor_name,'actor_name',512), action: requiredString(row.action,'action',256), module: requiredString(row.module,'module',256), targetUid: optionalString(row.target_uid,'target_uid',256), summary: optionalString(row.summary,'summary',1024), status: optionalString(row.status,'status',128), createdAt })
}
export interface AdminDashboardData { readonly pendingMessages: number | null; readonly recentOperations: readonly AdminDashboardOperationView[] | null }
export class AdminDashboardStore {
  constructor(private readonly adapter: DatabaseAdapter) {}
  async read(principal: AuthenticatedPrincipal): Promise<AdminDashboardData> {
    const commands: SqlCommand[]=[]; const slots: Array<'messages'|'logs'>=[]
    if (hasPermission(principal,'messages','view')) { commands.push(read("SELECT count(*) AS total FROM messages WHERE status = 'new'")); slots.push('messages') }
    if (hasPermission(principal,'operation_logs','view')) { commands.push(read('SELECT uid, actor_name, action, module, target_uid, summary, status, created_at FROM operation_logs ORDER BY created_at DESC, id DESC LIMIT ?', [ADMIN_RECENT_OPERATION_LIMIT])); slots.push('logs') }
    let pendingMessages: number|null=null; let recentOperations: readonly AdminDashboardOperationView[]|null=null
    if (commands.length) {
      const results=await this.adapter.batch(commands); if (results.length!==commands.length) throw new SecurityError('AUTH_PROTOCOL','Admin dashboard batch result mismatch')
      for (let i=0;i<slots.length;i+=1) { const slot=slots[i]!; const result=results[i]!; if (slot==='messages') { if (result.rows.length!==1) throw new SecurityError('AUTH_PROTOCOL','Admin dashboard message count is invalid'); pendingMessages=finiteCount(result.rows[0]!.total,'pending_messages') } else { if (result.rows.length>ADMIN_RECENT_OPERATION_LIMIT) throw new SecurityError('AUTH_PROTOCOL','Admin dashboard returned too many operations'); recentOperations=Object.freeze(result.rows.map(operationView)) } }
    }
    return Object.freeze({ pendingMessages, recentOperations })
  }
}
