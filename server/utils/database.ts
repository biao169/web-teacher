import { getPlatformDatabase } from '#database-platform'
import type { DatabaseContext, DatabaseRequest } from '../../db/context'

/** Call only from database-dependent Services. /health never calls this helper. */
export function useDatabase(event: DatabaseRequest): DatabaseContext {
  const context = event.context as DatabaseRequest['context'] & { databaseContext?: DatabaseContext }
  context.databaseContext ??= getPlatformDatabase(event)
  return context.databaseContext!
}
