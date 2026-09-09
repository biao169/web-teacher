import { DatabaseError } from './errors'

// Only short, previously validated SQL is cached; parameter validation always reruns.
const verified = new Map<string, string>()
export function normalizeSingleStatement(sql: string): string {
  const cached = verified.get(sql)
  if (cached !== undefined) return cached
  const statements: string[] = []
  let current = '', quote: string | null = null, lineComment = false, blockComment = false
  for (let i = 0; i < sql.length; i += 1) {
    const character = sql[i]!, next = sql[i + 1]
    if (lineComment) { if (character === '\n') { lineComment = false; current += ' ' }; continue }
    if (blockComment) { if (character === '*' && next === '/') { blockComment = false; current += ' '; i += 1 }; continue }
    if (quote) {
      current += character
      if (character === quote) {
        if (next === quote && quote !== ']') { current += next; i += 1 }
        else quote = null
      }
      continue
    }
    if (character === '-' && next === '-') { lineComment = true; current += ' '; i += 1; continue }
    if (character === '/' && next === '*') { blockComment = true; current += ' '; i += 1; continue }
    if (character === "'" || character === '"' || character === '`' || character === '[') { quote = character === '[' ? ']' : character; current += character; continue }
    if (character === ';') { if (current.trim()) statements.push(current.trim()); current = ''; continue }
    current += character
  }
  if (quote || blockComment) throw new DatabaseError('DB_INPUT', 'Unterminated SQL literal or comment')
  if (current.trim()) statements.push(current.trim())
  if (statements.length !== 1) throw new DatabaseError('DB_INPUT', 'Each command must contain exactly one SQL statement')
  const statement = statements[0]!
  if (/^(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE|ATTACH|DETACH)\b/i.test(statement)) throw new DatabaseError('DB_INPUT', 'Transaction and attachment control belongs to the adapter')
  if (/^PRAGMA\s+(?:(?:main|temp)\s*\.\s*)?foreign_keys\s*(?:=\s*|\(\s*)(?:OFF|0|FALSE)\b/i.test(statement)) throw new DatabaseError('DB_INPUT', 'Disabling foreign keys is not allowed')
  if (sql.length <= 4096) {
    verified.set(sql, statement)
    if (verified.size > 64) verified.delete(verified.keys().next().value!)
  }
  return statement
}

export function validateSingleStatement(sql: string): void { normalizeSingleStatement(sql) }
