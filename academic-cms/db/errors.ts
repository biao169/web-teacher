export type DatabaseErrorCode =
  | 'DB_INPUT' | 'DB_LIMIT' | 'DB_UNIQUE' | 'DB_FOREIGN_KEY' | 'DB_CHECK'
  | 'DB_NOT_NULL' | 'DB_BUSY' | 'DB_CONFLICT' | 'DB_NOT_FOUND' | 'DB_FORBIDDEN'
  | 'DB_PROTOCOL' | 'DB_TRANSACTION' | 'DB_UNKNOWN'

/** Safe to map to API errors: messages contain no SQL or bound values. */
export class DatabaseError extends Error {
  readonly code: DatabaseErrorCode
  constructor(code: DatabaseErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DatabaseError'
    this.code = code
  }
}

export function databaseError(error: unknown): DatabaseError {
  if (error instanceof DatabaseError) return error
  const parts: string[] = []
  let current = error
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    parts.push(current.message, String((current as Error & { code?: unknown }).code ?? ''))
    current = current.cause
  }
  const message = parts.join(' ').toUpperCase()
  const code: DatabaseErrorCode = /CK_AUTH_BOOTSTRAP_STATE_SINGLETON/.test(message) ? 'DB_CONFLICT'
    : /UNIQUE CONSTRAINT|SQLITE_CONSTRAINT_UNIQUE|PRIMARY KEY/.test(message) ? 'DB_UNIQUE'
      : /FOREIGN KEY|SQLITE_CONSTRAINT_FOREIGNKEY/.test(message) ? 'DB_FOREIGN_KEY'
      : /NOT NULL|SQLITE_CONSTRAINT_NOTNULL/.test(message) ? 'DB_NOT_NULL'
        : /CHECK CONSTRAINT|SQLITE_CONSTRAINT_CHECK/.test(message) ? 'DB_CHECK'
          : /SQLITE_BUSY|DATABASE IS LOCKED|DATABASE IS BUSY/.test(message) ? 'DB_BUSY'
            : 'DB_UNKNOWN'
  return new DatabaseError(code, 'Database operation failed', { cause: error })
}
