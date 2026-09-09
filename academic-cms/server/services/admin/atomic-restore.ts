export interface RestoreCommand {
  readonly sql: string
  readonly params?: readonly unknown[]
  readonly expectedChanges?: number
}

export interface AtomicRestoreRepository {
  batch(commands: readonly RestoreCommand[]): Promise<readonly unknown[]>
}

export interface RestoreTablePlan {
  readonly table: string
  readonly command: RestoreCommand
}

const TABLE_NAME = /^[a-z][a-z0-9_]{0,62}$/

/** Build and execute a restore as one bounded transaction. */
export async function executeAtomicRestore(
  repository: AtomicRestoreRepository,
  plans: readonly RestoreTablePlan[],
  auditCommand: RestoreCommand,
  generationCommands: readonly RestoreCommand[],
): Promise<void> {
  if (plans.length === 0 || plans.length > 64) throw new RangeError('invalid restore table count')
  const seen = new Set<string>()
  for (const plan of plans) {
    if (!TABLE_NAME.test(plan.table) || seen.has(plan.table)) throw new TypeError('invalid restore table plan')
    seen.add(plan.table)
  }
  const commands = [...plans.map((plan) => plan.command), auditCommand, ...generationCommands]
  if (commands.length > 128) throw new RangeError('restore transaction exceeds command budget')
  await repository.batch(commands)
}
