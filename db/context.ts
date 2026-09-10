import type { DatabaseAdapter } from './contracts'
import type { Repository } from './repository'

/** Only portable storage capabilities cross into application Services. */
export interface DatabaseContext { adapter: DatabaseAdapter; repository: Repository }
/** Structural request subset: importing this type never loads H3 or a native driver. */
export interface DatabaseRequest { context: Record<string, unknown> }
