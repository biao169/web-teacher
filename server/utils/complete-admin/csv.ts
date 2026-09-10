export function safeCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value)
  if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function serializeSafeCsv(rows: readonly Record<string, unknown>[], keys?: readonly string[]): string {
  const columns = keys ? [...keys] : [...new Set(rows.flatMap(row => Object.keys(row)))]
  const lines = [columns.map(safeCsvCell).join(','), ...rows.map(row => columns.map(key => safeCsvCell(row[key])).join(','))]
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
