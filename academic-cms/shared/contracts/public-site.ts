import type { PublicJsonValue } from './view-model'

/** Admin biography textareas allow 100,000 Unicode code points (at most four UTF-8 bytes each). */
export const PUBLIC_PROFILE_BIOGRAPHY_MAX_BYTES = 400_000

export type PublicSiteLocale = 'zh' | 'en'
export type PublicNavigationLocation = 'header' | 'hero' | 'footer'
export type PublicLinkStyle = 'default' | 'primary' | 'secondary'

export type PublicSiteLink = {
  uid: string
  label: string
  href: string
  external: boolean
  location: PublicNavigationLocation
  style: PublicLinkStyle
  icon: string | null
}

export type PublicMissingMedia = {
  available: false
  fallback: 'initials' | 'placeholder' | 'none'
  alt: string
  kind: 'image' | 'video' | 'pdf' | 'file'
}

export type PublicAvailableMedia = {
  available: true
  url: string
  alt: string
  title: string | null
  kind: 'image' | 'video' | 'pdf' | 'file'
  mimeType: string
  size: number
  width: number | null
  height: number | null
  disposition: 'inline' | 'attachment'
  downloadAllowed: boolean
  cacheScope: 'public' | 'private'
  purpose: 'avatar' | 'logo' | 'favicon' | 'og_image' | 'cover' | 'publication_pdf' | 'certificate' | 'syllabus' | 'course_material' | 'message_attachment' | 'generic'
}

export type PublicMedia = PublicMissingMedia | PublicAvailableMedia

export type PublicSiteIdentity = {
  uid: string
  name: string
  heroTitle: string
  heroSubtitle: string | null
  seoTitle: string
  seoDescription: string
  keywords: string[]
  footerText: string | null
  footerHtml?: string | null
  logo: PublicMedia
  favicon: PublicMedia
  openGraphImage: PublicMedia
}

import type { PublicProfileSummary as Profile, PublicContact, PublicResearchItem as Research, PublicPublicationSummary as Publication, PublicProjectSummary as Project, PublicNewsSummary as News } from './public-content'
export type PublicProfileSummary = Profile & { contact: PublicContact | null; links?: import('./public-content').PublicAcademicLink[] }
export type PublicResearchSummary = Research & { displayNumber: number }
export type PublicPublicationSummary = Publication & { displayNumber: number }
export type PublicProjectSummary = Project & { displayNumber: number }
export type PublicNewsSummary = News & { displayNumber: number }

export type PublicHomeViewModel = {
  schemaVersion: 1
  locale: PublicSiteLocale
  homePath: '/zh' | '/en'
  alternatePath: '/zh' | '/en'
  generatedAt: string
  site: PublicSiteIdentity
  navigation: {
    header: PublicSiteLink[]
    hero: PublicSiteLink[]
    footer: PublicSiteLink[]
  }
  publicationRevision: string
  featuredProfile: PublicProfileSummary | null
  researchInterests: PublicResearchSummary[]
  publications: PublicPublicationSummary[]
  projects: PublicProjectSummary[]
  news: PublicNewsSummary[]
  sections: {
    research: boolean
    publications: boolean
    projects: boolean
    news: boolean
  }
  counts: {
    research: number
    publications: number
    projects: number
    news: number
  }
}

/** Compile-time bridge used by the strict public cache serializer. */
export type PublicHomeJson = PublicHomeViewModel & PublicJsonValue

export type PublicShellViewModel = {
  schemaVersion: 1
  locale: PublicSiteLocale
  homePath: '/zh' | '/en'
  alternatePath: '/zh' | '/en'
  generatedAt: string
  site: PublicSiteIdentity
  navigation: {
    header: PublicSiteLink[]
    hero: PublicSiteLink[]
    footer: PublicSiteLink[]
  }
}
