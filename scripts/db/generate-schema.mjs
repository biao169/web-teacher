import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const spec = JSON.parse(await readFile(resolve(root, 'db/schema-spec.json'), 'utf8'))
const args = new Set(process.argv.slice(2))
if ([...args].some(arg => !['--check', '--initial'].includes(arg))) throw new Error('Usage: generate-schema.mjs [--check] [--initial]')
if (args.has('--check') && args.has('--initial')) throw new Error('--check and --initial are mutually exclusive')
const quote = name => { if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`Unsafe schema identifier: ${name}`); return `"${name}"` }
const literal = value => typeof value === 'boolean' ? (value ? '1' : '0') : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`
const camel = name => name.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
const pascal = name => { const c = camel(name); return c[0].toUpperCase() + c.slice(1) }
const sqlType = c => ['integer', 'boolean'].includes(c.kind) ? 'INTEGER' : 'TEXT'
function constraints(field, c) {
  const f = quote(field), out = []
  if (c.kind === 'boolean') out.push(`${f} IN (0, 1)`)
  if (c.kind === 'integer' && !c.primary) out.push(`typeof(${f}) = 'integer' AND ${f} BETWEEN -9007199254740991 AND 9007199254740991`)
  if (c.required) out.push(`length(trim(${f})) > 0`)
  if (c.min !== undefined) out.push(`${f} >= ${c.min}`)
  if (c.max !== undefined) out.push(`${f} <= ${c.max}`)
  if (c.minLength !== undefined) out.push(`length(${f}) >= ${c.minLength}`)
  if (c.maxLength !== undefined) out.push(`length(${f}) <= ${c.maxLength}`)
  if (c.enum) out.push(`${f} IN (${c.enum.map(literal).join(', ')})`)
  if (c.kind === 'json') out.push(`CASE WHEN json_valid(${f}) THEN json_type(${f}) = '${c.jsonType}' ELSE 0 END`)
  if (c.format === 'date') out.push(`length(${f}) = 10 AND COALESCE(strftime('%Y-%m-%d', ${f}, '+0 days') = ${f}, 0)`)
  if (c.format === 'timestamp') out.push(`length(${f}) = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', ${f}, '+0 seconds') = ${f}, 0)`)
  if (c.format === 'decimal') out.push(`length(${f}) BETWEEN 1 AND 23 AND ${f} NOT GLOB '*[^0-9.]*' AND ${f} NOT LIKE '%.%.%' AND substr(${f}, 1, 1) GLOB '[0-9]' AND substr(${f}, -1, 1) GLOB '[0-9]' AND (instr(${f}, '.') = 0 AND length(${f}) <= 18 OR instr(${f}, '.') BETWEEN 2 AND 19 AND length(${f}) - instr(${f}, '.') BETWEEN 1 AND 4) AND (substr(${f}, 1, 1) != '0' OR ${f} = '0' OR substr(${f}, 1, 2) = '0.')`)
  return c.nullable ? out.map(expression => `${f} IS NULL OR (${expression})`) : out
}
function defaultSql(c) {
  if (c.defaultSql !== undefined) return `(${c.defaultSql})`
  if (!Object.hasOwn(c, 'default')) return undefined
  return literal(c.kind === 'json' ? JSON.stringify(c.default) : c.default)
}
function indexSqlColumn(col) {
  if (typeof col === 'string') return quote(col)
  return quote(col.field) + (col.collate ? ' COLLATE NOCASE' : '') + (col.direction ? ` ${col.direction.toUpperCase()}` : '')
}
const generated = '// Generated from db/schema-spec.json. Edit the spec, then run db:generate.\n'
const tables = spec.tables
let orm = generated + "import { sql } from 'drizzle-orm'\nimport { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core'\nimport type { JsonValue } from './schema-types'\n\n"
let models = generated + "import type { JsonValue } from './schema-types'\n\n"
let sql = '-- Initial application schema. Immutable after first deployment.\n-- Shared by Cloudflare D1 and SQLite; transactions are owned by the migration runner.\n\n'
const mappings = []
for (const [name, table] of Object.entries(tables)) {
  quote(name)
  const columnSql = [], columnOrm = [], checks = []
  let row = `export interface ${pascal(name)}Row {\n`, input = `export interface ${pascal(name)}Input {\n`
  for (const [field, c] of Object.entries(table.columns)) {
    const f = quote(field), d = defaultSql(c)
    let s = `  ${f} ${sqlType(c)}`
    let o = `${c.kind === 'integer' ? 'integer' : c.kind === 'boolean' ? 'integer' : 'text'}('${field}'${c.kind === 'boolean' ? ", { mode: 'boolean' }" : c.kind === 'json' ? ", { mode: 'json' }" : ''})`
    if (c.kind === 'json') o += '.$type<JsonValue>()'
    if (c.enum) o += `.$type<${c.enum.map(v => JSON.stringify(v)).join(' | ')}>()`
    if (c.primary) { s += ' PRIMARY KEY AUTOINCREMENT'; o += '.primaryKey({ autoIncrement: true })' }
    if (!c.nullable) { s += ' NOT NULL'; if (!c.primary) o += '.notNull()' }
    if (c.unique) { s += ' UNIQUE'; o += '.unique()' }
    if (d !== undefined) { s += ` DEFAULT ${d}`; o += `.default(sql.raw(${JSON.stringify(d)}))` }
    if (c.references) {
      const r = c.references
      s += ` REFERENCES ${quote(r.table)}(${quote(r.column)}) ON UPDATE RESTRICT ON DELETE ${r.onDelete.toUpperCase()}`
      o += `.references(() => ${camel(r.table)}.${r.column}, { onDelete: '${r.onDelete}', onUpdate: 'restrict' })`
    }
    constraints(field, c).forEach((expr, i) => {
      const checkName = `ck_${name}_${field}_${i}`
      checks.push(`  CONSTRAINT ${quote(checkName)} CHECK (${expr})`)
      columnOrm.push({ checkName, expr })
    })
    columnSql.push(s)
    columnOrm.push(`  ${field}: ${o},`)
    const type = c.kind === 'integer' ? 'number' : c.kind === 'boolean' ? 'boolean' : c.kind === 'json' ? 'JsonValue' : c.enum ? c.enum.map(v => JSON.stringify(v)).join(' | ') : 'string'
    row += `  ${field}: ${type}${c.nullable ? ' | null' : ''}\n`
    if (field !== 'id') {
      const optional = field === 'uid' || c.nullable || d !== undefined
      input += `  ${field}${optional ? '?' : ''}: ${type}${c.nullable ? ' | null' : ''}\n`
    }
  }
  sql += `CREATE TABLE ${quote(name)} (\n${[...columnSql, ...checks].join(',\n')}\n);\n\n`
  const extras = columnOrm.filter(x => typeof x !== 'string').map(({ checkName, expr }) => `  check('${checkName}', sql.raw(${JSON.stringify(expr)})),`)
  for (const idx of table.indexes) {
    for (const col of idx.columns) if (!Object.hasOwn(table.columns, typeof col === 'string' ? col : col.field)) throw new Error(`Index refers to unknown column: ${idx.name}`)
    sql += `CREATE ${idx.unique ? 'UNIQUE ' : ''}INDEX ${quote(idx.name)} ON ${quote(name)} (${idx.columns.map(indexSqlColumn).join(', ')})${idx.where ? ` WHERE ${idx.where}` : ''};\n`
    const cols = idx.columns.map(col => {
      if (typeof col === 'string') return `t.${col}`
      if (col.collate || col.direction) {
        const collate = col.collate ? ' COLLATE NOCASE' : ''
        const direction = col.direction ? ` ${col.direction.toUpperCase()}` : ''
        return `sql\`\${t.${col.field}}${collate}${direction}\``
      }
      return `t.${col.field}`
    })
    extras.push(`  ${idx.unique ? 'uniqueIndex' : 'index'}('${idx.name}').on(${cols.join(', ')})${idx.where ? `.where(sql.raw(${JSON.stringify(idx.where)}))` : ''},`)
  }
  sql += '\n'
  orm += `export const ${camel(name)} = sqliteTable('${name}', {\n${columnOrm.filter(x => typeof x === 'string').join('\n')}\n}, t => [\n${extras.join('\n')}\n])\n\n`
  models += row + '}\n\n' + input + '}\n\n'
  mappings.push({ name, variable: camel(name), type: pascal(name) })
}
orm += `export const schema = { ${mappings.map(x => x.variable).join(', ')} }\n`
models += `export interface TableRows {\n${mappings.map(x => `  ${x.name}: ${x.type}Row`).join('\n')}\n}\n\nexport interface TableInputs {\n${mappings.map(x => `  ${x.name}: ${x.type}Input`).join('\n')}\n}\n\nexport type TableName = keyof TableRows\nexport type Row<T extends TableName> = TableRows[T]\nexport type Insert<T extends TableName> = TableInputs[T]\nexport type Patch<T extends TableName> = Partial<Omit<Row<T>, 'id' | 'uid' | 'created_at' | 'updated_at'>>\n`
const catalog = generated + "import type { TableSpec } from './schema-types'\n\nexport const catalog = " + JSON.stringify(tables, null, 2) + " as const satisfies Record<string, TableSpec>\n"
for (const [path, data] of [['db/schema.ts', orm], ['db/models.ts', models], ['db/catalog.ts', catalog]]) {
  const dest = resolve(root, path)
  if (args.has('--check')) { if (await readFile(dest, 'utf8') !== data) throw new Error(`Generated file is stale: ${path}`) }
  else { await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, data) }
}
if (args.has('--initial')) {
  const dest = resolve(root, 'migrations/0001_initial.sql')
  if (await access(dest).then(() => true, () => false)) throw new Error('Refusing to overwrite an existing migration; add an incremental migration instead')
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, sql, { flag: 'wx' })
  await writeFile(resolve(root, 'migrations/manifest.json'), JSON.stringify({ version: 1, migrations: [{ name: '0001_initial.sql', sha256: createHash('sha256').update(sql).digest('hex') }] }, null, 2) + '\n', { flag: 'wx' })
}
console.log(`Schema ${args.has('--check') ? 'verified' : 'generated'}: ${mappings.length} tables`)
