import { decodeRow } from '../../../db/codec'
import { DATABASE_LIMITS, type DatabaseAdapter, type QueryResult, type RawRow, type SqlCommand } from '../../../db/contracts'
import { DatabaseError } from '../../../db/errors'
import type { Row } from '../../../db/models'
import { buildLookupCommands, read, uniqueKeys } from '../../../db/query'
import { validateCacheTag } from '../../cache/keys'
import { MediaError } from '../../media/errors'

export interface MediaProjectionCatalog {
  assets: ReadonlyMap<string, Row<'media_assets'>>
  generations: ReadonlyMap<string, number>
  publicationPdfDownloadAllowed: boolean
}

export interface MediaDeliveryCatalog {
  asset: Row<'media_assets'> | null
  generations: ReadonlyMap<string, number>
}

function uniqueTags(tagsInput: readonly string[]): string[] {
  if (!Array.isArray(tagsInput) || tagsInput.length > 1_000) throw new MediaError('MEDIA_LIMIT', 'Too many media dependency tags')
  return [...new Set(tagsInput.map(validateCacheTag))].sort()
}

function generationCommands(tags: readonly string[]): SqlCommand[] {
  const commands: SqlCommand[] = []
  for (let start = 0; start < tags.length; start += DATABASE_LIMITS.keyChunk) {
    const chunk = tags.slice(start, start + DATABASE_LIMITS.keyChunk)
    commands.push(read(`SELECT tag, generation FROM cache_generations WHERE tag IN (${chunk.map(() => '?').join(', ')})`, chunk))
  }
  return commands
}

function parseAssets(results: readonly QueryResult[], expectedKeys: readonly string[]): Map<string, Row<'media_assets'>> {
  const expected = new Set(expectedKeys)
  const byKey = new Map<string, Row<'media_assets'>>()
  for (const row of results.flatMap(result => result.rows)) {
    const asset = decodeRow('media_assets', row)
    if (!expected.has(asset.object_key) || byKey.has(asset.object_key)) throw new MediaError('MEDIA_PROTOCOL', 'Media lookup returned an unexpected or duplicate object')
    byKey.set(asset.object_key, asset)
  }
  return byKey
}

function parseGenerations(results: readonly QueryResult[], expectedTags: readonly string[]): Map<string, number> {
  const expected = new Set(expectedTags)
  const generations = new Map<string, number>()
  for (const row of results.flatMap(result => result.rows)) {
    const tag = row.tag
    const generation = row.generation
    if (typeof tag !== 'string' || !expected.has(tag) || generations.has(tag)
      || typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 1) {
      throw new MediaError('MEDIA_PROTOCOL', 'Media dependency generation query returned invalid data')
    }
    generations.set(tag, generation)
  }
  return generations
}

function pdfPolicy(row: RawRow | undefined): boolean {
  if (!row) return false
  const value = row.news_pdf_allow_download
  if (value !== 0 && value !== 1) throw new MediaError('MEDIA_PROTOCOL', 'Stored PDF download policy is invalid')
  return value === 1
}

export class MediaCatalogStore {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async loadAsset(objectKey: string): Promise<Row<'media_assets'> | null> {
    const result = await this.adapter.execute(read('SELECT * FROM media_assets WHERE object_key = ? LIMIT 2', [objectKey]))
    if (result.rows.length > 1) throw new MediaError('MEDIA_PROTOCOL', 'Media object key is not unique')
    return result.rows[0] ? decodeRow('media_assets', result.rows[0]) : null
  }

  /** One adapter batch, even when the database parameter limit requires chunks. */
  async assetsByKeys(keysInput: readonly string[]): Promise<Map<string, Row<'media_assets'>>> {
    const keys = uniqueKeys(keysInput)
    if (keys.length === 0) return new Map()
    const commands = buildLookupCommands('media_assets', 'object_key', keys)
    const results = await this.adapter.batch(commands)
    if (results.length !== commands.length) throw new DatabaseError('DB_PROTOCOL', 'Media catalog batch result is incomplete')
    return parseAssets(results, keys)
  }

  /**
   * Reads every page media record, its authorization generations and the PDF
   * policy in one database batch. Missing generations intentionally mean zero.
   */
  async projectionData(
    keysInput: readonly string[],
    tagsInput: readonly string[],
    options: { includePdfPolicy?: boolean } = {},
  ): Promise<MediaProjectionCatalog> {
    const keys = uniqueKeys(keysInput)
    const tags = uniqueTags(tagsInput)
    const assetCommands = buildLookupCommands('media_assets', 'object_key', keys)
    const tagCommands = generationCommands(tags)
    const policyCommands = options.includePdfPolicy
      ? [read(`SELECT news_pdf_allow_download FROM global_settings
          ORDER BY updated_at DESC, id DESC LIMIT 1`)]
      : []
    const commands = [...assetCommands, ...tagCommands, ...policyCommands]
    const results = await this.adapter.batch(commands)
    if (results.length !== commands.length) throw new DatabaseError('DB_PROTOCOL', 'Media projection batch result is incomplete')
    const assetEnd = assetCommands.length
    const tagEnd = assetEnd + tagCommands.length
    return {
      assets: parseAssets(results.slice(0, assetEnd), keys),
      generations: parseGenerations(results.slice(assetEnd, tagEnd), tags),
      publicationPdfDownloadAllowed: options.includePdfPolicy ? pdfPolicy(results[tagEnd]?.rows[0]) : false,
    }
  }

  /** One delivery request performs one catalog batch before touching storage. */
  async deliveryData(objectKey: string, tagsInput: readonly string[]): Promise<MediaDeliveryCatalog> {
    const tags = uniqueTags(tagsInput)
    if (tags.length < 1 || tags.length > 8) throw new MediaError('MEDIA_INPUT', 'Invalid media delivery dependency count')
    const assetCommand = read('SELECT * FROM media_assets WHERE object_key = ? LIMIT 2', [objectKey])
    const tagCommands = generationCommands(tags)
    const commands = [assetCommand, ...tagCommands]
    const results = await this.adapter.batch(commands)
    if (results.length !== commands.length) throw new DatabaseError('DB_PROTOCOL', 'Media delivery batch result is incomplete')
    const assetRows = results[0]?.rows ?? []
    if (assetRows.length > 1) throw new MediaError('MEDIA_PROTOCOL', 'Media object key is not unique')
    return {
      asset: assetRows[0] ? decodeRow('media_assets', assetRows[0]) : null,
      generations: parseGenerations(results.slice(1), tags),
    }
  }
}
