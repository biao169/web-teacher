import type { DatabaseRequest } from '../../db/context'
import { openNodeDatabase } from '../../db/runtime/node'

let database: ReturnType<typeof openNodeDatabase> | undefined
let openedPath: string | undefined
export function getPlatformDatabase(_event: DatabaseRequest) {
  const path = process.env.CMS_DATABASE_PATH ?? 'data/site.sqlite3'
  if (database && openedPath !== path) throw new Error('Database configuration cannot change within one process')
  if (!database) { database = openNodeDatabase(path); openedPath = path }
  return database
}
export function closePlatformDatabase() { database?.close(); database = undefined; openedPath = undefined }
