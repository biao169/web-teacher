export const TRANSLATION_PROVIDERS = ['libretranslate', 'deepl', 'google', 'microsoft', 'mymemory'] as const
export type TranslationProvider = typeof TRANSLATION_PROVIDERS[number]
export const MYMEMORY_MAX_BYTES = 500
export const TRANSLATION_DEFAULTS = Object.freeze({ provider: 'mymemory' as const, batchSize: 10, workerCount: 1, timeoutSeconds: 15 })

const clean = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
function providerName(value: unknown): TranslationProvider | null {
  return TRANSLATION_PROVIDERS.find(provider => provider === clean(value)) ?? null
}
function boundedInteger(value: unknown, fallback: number, max: number): number {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 1 ? Math.min(max, number) : fallback
}
function endpointReady(value: unknown): boolean {
  try {
    const url = new URL(clean(value))
    return !url.username && !url.password && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  } catch { return false }
}

/** One effective configuration for overview, scan, test and every execution request. */
export function resolveTranslationConfig(settings: Record<string, unknown>) {
  const configuredProvider = providerName(settings.translation_provider)
  const warnings: string[] = []
  let list: unknown = settings.translation_providers
  try { if (typeof list === 'string' && list.trim()) list = JSON.parse(list) } catch { list = null; warnings.push('可用翻译服务列表格式异常，已使用自动选择。') }
  const allowed: TranslationProvider[] = Array.isArray(list) && list.length > 0 ? [...new Set(list.map(providerName).filter((value): value is TranslationProvider => value !== null))] : [...TRANSLATION_PROVIDERS]
  const preferred = configuredProvider ?? TRANSLATION_DEFAULTS.provider
  const providers = allowed.includes(preferred) ? [preferred, ...allowed.filter(value => value !== preferred)] : allowed
  const missing: Partial<Record<TranslationProvider, string>> = {}
  for (const provider of providers) {
    if (provider === 'libretranslate' && !endpointReady(settings.libretranslate_url)) missing[provider] = '请填写有效的 LibreTranslate 地址。'
    else if (provider === 'libretranslate') {
      const url = new URL(clean(settings.libretranslate_url))
      if (['libretranslate.com', 'www.libretranslate.com'].includes(url.hostname) && !clean(settings.libretranslate_api_key)) missing[provider] = 'LibreTranslate 官方托管服务需要 API Key；自建服务可按其配置免密钥使用。'
    }
    else if (provider === 'deepl' && !clean(settings.deepl_api_key)) missing[provider] = '请填写 DeepL API Key。'
    else if (provider === 'google' && !clean(settings.google_translate_api_key)) missing[provider] = '请填写 Google Translate API Key。'
    else if (provider === 'microsoft' && !clean(settings.microsoft_translator_key)) missing[provider] = '请填写 Microsoft Translator Key。'
    else if (provider === 'microsoft' && clean(settings.microsoft_translator_endpoint) && !endpointReady(settings.microsoft_translator_endpoint)) missing[provider] = 'Microsoft 翻译地址无效。'
  }
  const readyProviders = providers.filter(provider => !missing[provider])
  const provider = readyProviders[0] ?? null
  if (configuredProvider && missing[configuredProvider]) warnings.push(missing[configuredProvider]!)
  if (provider && configuredProvider && provider !== configuredProvider) warnings.push(`当前改用已允许且配置完整的 ${provider}。`)
  if (!provider) warnings.push('没有配置完整的可用服务。请补齐密钥/地址，或在可用翻译服务中加入 mymemory。')
  const usesDefault = provider === 'mymemory' && (!configuredProvider || configuredProvider !== provider)
  return {
    configuredProvider, provider, providers, readyProviders, warnings, usesDefault,
    batchSize: boundedInteger(settings.translation_batch_size, TRANSLATION_DEFAULTS.batchSize, 50),
    workerCount: readyProviders.includes('mymemory') ? 1 : boundedInteger(settings.translation_worker_count, TRANSLATION_DEFAULTS.workerCount, 8),
    timeoutSeconds: boundedInteger(settings.translation_timeout_seconds, TRANSLATION_DEFAULTS.timeoutSeconds, 120),
  }
}

const FAILURE_MESSAGES: Record<string, string> = {
  TRANSLATION_CONFIGURATION_REQUIRED: '没有配置完整的可用翻译服务。请检查全局设置中的服务列表、地址和密钥。',
  PROVIDER_TIMEOUT: '翻译服务响应超时，请稍后重试或切换服务。',
  PROVIDER_NETWORK_FAILURE: '无法连接翻译服务，请检查服务器网络或切换服务。',
  PROVIDER_RATE_LIMITED: '翻译服务当前限流，系统已停止向该服务继续发送本批请求；请等待后重试或切换服务。',
  PROVIDER_QUOTA_EXCEEDED: '翻译服务额度已用完，请等待额度恢复或切换服务。',
  PROVIDER_AUTH_FAILED: '翻译服务拒绝认证，请检查密钥、区域及服务地址。',
  PROVIDER_REQUEST_REJECTED: '翻译服务拒绝请求，请检查语言支持和服务配置。',
  PROVIDER_TEMPORARY_FAILURE: '翻译服务暂时不可用，请稍后重试或切换服务。',
  PROVIDER_TEXT_TOO_LARGE: '请求超过翻译服务的长度限制，请缩小批量或切换服务。',
  INVALID_PROVIDER_RESPONSE: '翻译服务返回的数据不完整，本次结果没有保存。',
  TRANSLATION_ENVELOPE_MISMATCH: '合并翻译的分隔标记未能保留，无法安全对应到原字段。',
  PROVIDER_FAILURE: '翻译服务执行失败，请检查配置后重试。',
  TRANSLATION_RUN_BUDGET_EXCEEDED: '本批请求已达到时间或次数上限，请缩小批量后重试。',
  SOURCE_CHANGED_RESCAN_REQUIRED: '来源已变化，请先扫描与校准。',
  SOURCE_CHANGED_DURING_TRANSLATION: '翻译期间来源已变化，本次译文未覆盖当前内容。',
}
export function translationFailureMessage(code: unknown): string {
  return FAILURE_MESSAGES[String(code ?? '')] ?? (typeof code === 'string' && code ? code : '翻译失败，请稍后重试。')
}

export function buildTranslationEnvelope(texts: readonly string[], token: string): { text: string; markers: string[] } {
  if (!texts.length || !/^[a-z0-9]{8,64}$/iu.test(token)) throw new Error('INVALID_TRANSLATION_ENVELOPE')
  const markers = texts.map((_, index) => `<<<CMS_${token}_${index}>>>`)
  return { text: texts.map((value, index) => `${markers[index]}\n${value}`).join('\n'), markers }
}
export function parseTranslationEnvelope(translated: string, markers: readonly string[]): string[] {
  if (!markers.length || !translated.trim()) throw new Error('TRANSLATION_ENVELOPE_MISMATCH')
  const positions = markers.map(marker => translated.indexOf(marker))
  if (positions.some((position, index) => position < 0 || (index > 0 && position <= positions[index - 1]!) || translated.indexOf(markers[index]!, position + 1) >= 0)) throw new Error('TRANSLATION_ENVELOPE_MISMATCH')
  return markers.map((marker, index) => {
    const value = translated.slice(positions[index]! + marker.length, positions[index + 1] ?? translated.length).trim()
    if (!value) throw new Error('TRANSLATION_ENVELOPE_MISMATCH')
    return value
  })
}

/** Preserve every code point and whitespace; favour sentence/word boundaries. */
export function splitTranslationText(text: string, maxBytes = MYMEMORY_MAX_BYTES): string[] {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4) throw new Error('INVALID_TRANSLATION_TEXT_LIMIT')
  const encoder = new TextEncoder()
  const chunks: string[] = []
  let remaining = text
  while (encoder.encode(remaining).byteLength > maxBytes) {
    let bytes = 0, end = 0, boundary = 0
    for (const char of remaining) {
      const size = encoder.encode(char).byteLength
      if (bytes + size > maxBytes) break
      bytes += size; end += char.length
      if (/[\s。！？.!?；;]/u.test(char)) boundary = end
    }
    const cut = boundary >= end / 2 ? boundary : end
    chunks.push(remaining.slice(0, cut)); remaining = remaining.slice(cut)
  }
  if (remaining) chunks.push(remaining)
  return chunks
}

export function planTranslationBatches<T extends { source_text: string; metadata: { table: string } }>(rows: readonly T[], maxItems: number, maxCharacters = 40_000): T[][] {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const group = groups.get(row.metadata.table) ?? []
    group.push(row); groups.set(row.metadata.table, group)
  }
  const batches: T[][] = []
  for (const tableRows of groups.values()) {
    let batch: T[] = [], characters = 0
    for (const row of tableRows) {
      if (batch.length && (batch.length >= Math.max(1, Math.floor(maxItems)) || characters + row.source_text.length > Math.max(1, Math.floor(maxCharacters)))) {
        batches.push(batch); batch = []; characters = 0
      }
      batch.push(row); characters += row.source_text.length
    }
    if (batch.length) batches.push(batch)
  }
  return batches
}
