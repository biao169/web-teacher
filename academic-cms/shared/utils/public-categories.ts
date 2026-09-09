/** Field classifications use ASCII/full-width semicolons, without splitting names at commas. */
export function splitPublicCategories(value: string | null | undefined): string[] {
  return [...new Set((value ?? '').split(/[;；]/u).map(item => item.trim().normalize('NFC')).filter(Boolean))]
}
