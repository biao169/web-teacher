export interface D1PreparedStatementLike {
  bind(...values: readonly unknown[]): D1PreparedStatementLike
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike
  batch<T = unknown>(statements: readonly D1PreparedStatementLike[]): Promise<readonly T[]>
}

export interface AtomicD1Command {
  readonly sql: string
  readonly params?: readonly unknown[]
  readonly expectedChanges?: number
}

export interface AtomicD1Result<T = unknown> {
  readonly commandResults: readonly T[]
}

function assertExpectedChanges(value: number | undefined): void {
  if (value === undefined) return
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new RangeError('expectedChanges must be a bounded non-negative integer')
  }
}

/**
 * Execute mutations and their row-count assertions in one D1 batch.
 * The guard table has CHECK(actual_changes = expected_changes); an optimistic
 * lock mismatch therefore aborts and rolls back the whole batch before commit.
 */
export async function executeAtomicD1Commands<T = unknown>(
  database: D1DatabaseLike,
  commands: readonly AtomicD1Command[],
  now = new Date(),
): Promise<AtomicD1Result<T>> {
  if (!Array.isArray(commands) || commands.length === 0 || commands.length > 256) {
    throw new RangeError('D1 atomic batch must contain 1..256 commands')
  }
  const guardPrefix = `guard:${crypto.randomUUID()}`
  const statements: D1PreparedStatementLike[] = []
  const commandResultIndexes: number[] = []
  const guardIds: string[] = []
  const timestamp = now.toISOString()

  commands.forEach((command, index) => {
    assertExpectedChanges(command.expectedChanges)
    if (typeof command.sql !== 'string' || !command.sql.trim()) {
      throw new TypeError('D1 command SQL must be non-empty')
    }
    commandResultIndexes.push(statements.length)
    statements.push(database.prepare(command.sql).bind(...(command.params ?? [])))
    if (command.expectedChanges !== undefined) {
      const guardUid = `${guardPrefix}:${index}`
      guardIds.push(guardUid)
      statements.push(database.prepare(`
        INSERT INTO admin_mutation_guards
          (uid, expected_changes, actual_changes, created_at)
        VALUES (?, ?, changes(), ?)
      `).bind(guardUid, command.expectedChanges, timestamp))
    }
  })
  for (const guardUid of guardIds) {
    statements.push(database.prepare('DELETE FROM admin_mutation_guards WHERE uid = ?').bind(guardUid))
  }

  const results = await database.batch<T>(statements)
  return { commandResults: commandResultIndexes.map((index) => results[index] as T) }
}
