import type { DatabaseAdapter, QueryResult, RawRow } from '../../../db/contracts'
import { read } from '../../../db/query'
import { publicNavigationRead, PUBLIC_NAVIGATION_LIMIT } from '../../../db/read-plans'
import { manyRows, oneRow, rowInteger, rowOptionalText, rowRequiredText, rowTimestamp } from './public-row'
import { PublicSiteError } from './errors'

export type ShellSiteRecord = {
  uid: string; updatedAt: string; siteName: string; siteNameEn: string | null; heroTitle: string | null; heroSubtitle: string | null
  logoKey: string | null; faviconKey: string | null; openGraphImageKey: string | null; seoTitle: string | null; seoDescription: string | null
  seoKeywords: string | null; footerText: string | null
}
export type ShellNavigationRecord = {
  uid: string; title: string; titleEn: string | null; kind: string | null; urlName: string | null; path: string | null
  fragment: string | null; icon: string | null; style: string | null; location: string | null
}
export type PublicShellSnapshot = { site: ShellSiteRecord | null; navigation: ShellNavigationRecord[] }

function site(row: RawRow): ShellSiteRecord {
  return {
    uid: rowRequiredText(row, 'uid', 128), updatedAt: rowTimestamp(row, 'updated_at')!, siteName: rowRequiredText(row, 'site_name', 1_024),
    siteNameEn: rowOptionalText(row, 'site_name_en', 1_024), heroTitle: rowOptionalText(row, 'hero_title', 2_048),
    heroSubtitle: rowOptionalText(row, 'hero_subtitle', 8_192), logoKey: rowOptionalText(row, 'logo_key', 2_048),
    faviconKey: rowOptionalText(row, 'favicon_key', 2_048), openGraphImageKey: rowOptionalText(row, 'og_image_key', 2_048),
    seoTitle: rowOptionalText(row, 'seo_title', 2_048), seoDescription: rowOptionalText(row, 'seo_description', 8_192),
    seoKeywords: rowOptionalText(row, 'seo_keywords', 8_192), footerText: rowOptionalText(row, 'footer_text', 32_768),
  }
}
function navigation(row: RawRow): ShellNavigationRecord {
  return {
    uid: rowRequiredText(row, 'uid', 128), title: rowRequiredText(row, 'title', 1_024), titleEn: rowOptionalText(row, 'title_en', 1_024),
    kind: rowOptionalText(row, 'kind', 128), urlName: rowOptionalText(row, 'url_name', 128), path: rowOptionalText(row, 'path', 2_048),
    fragment: rowOptionalText(row, 'fragment', 128), icon: rowOptionalText(row, 'icon', 128), style: rowOptionalText(row, 'style', 128),
    location: rowOptionalText(row, 'location', 128),
  }
}

export class PublicShellStore {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async load(): Promise<PublicShellSnapshot> {
    const commands = [
      read(`SELECT uid, updated_at, site_name, site_name_en, hero_title, hero_subtitle, logo_key, favicon_key, og_image_key,
        seo_title, seo_description, seo_keywords, footer_text FROM site_settings
        WHERE is_active = 1 ORDER BY updated_at DESC, id DESC LIMIT 1`),
      publicNavigationRead(),
    ]
    const results = await this.adapter.batch(commands)
    if (results.length !== 2) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Public shell database batch is incomplete')
    return { site: oneRow(results[0]!, site, 'Site settings'), navigation: manyRows(results[1]!, PUBLIC_NAVIGATION_LIMIT, navigation, 'Navigation') }
  }
}
