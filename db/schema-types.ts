/** Storage metadata. This module must stay free of Node and ORM imports. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type Visibility = 'public' | 'authenticated' | 'staff' | 'owner' | 'hidden'
export interface ColumnSpec {
  kind: 'text' | 'integer' | 'boolean' | 'json'
  nullable: boolean
  primary?: boolean
  autoIncrement?: boolean
  unique?: boolean
  required?: boolean
  default?: JsonValue
  defaultSql?: string
  enum?: readonly string[]
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  jsonType?: 'array' | 'object'
  format?: 'date' | 'timestamp' | 'decimal'
  references?: { table: string; column: string; onDelete: 'restrict' | 'set null' }
}
export interface IndexColumn { field: string; direction?: 'asc' | 'desc'; collate?: 'nocase' }
export interface IndexSpec { name: string; columns: readonly (string | IndexColumn)[]; unique?: boolean; where?: string }
export interface TableSpec { columns: Readonly<Record<string, ColumnSpec>>; indexes: readonly IndexSpec[]; search: readonly string[]; deletable: boolean }
