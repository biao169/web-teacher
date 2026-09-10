/** Stored amounts are CNY ten-thousands, with up to four decimal places. */
export function formatProjectAmount(value: string | null | undefined, locale: 'zh' | 'en'): string | null {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,17})(?:\.\d{1,4})?$/u.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  if (locale === 'zh') {
    const decimals = fraction.replace(/0+$/u, '')
    return `${whole}${decimals ? `.${decimals}` : ''} 万元`
  }
  // Decimal-string arithmetic avoids rounding large grants through a floating point number.
  const yuan = BigInt(whole! + fraction.padEnd(4, '0'))
  return `CNY ${new Intl.NumberFormat('en-US').format(yuan)}`
}
