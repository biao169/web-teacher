import type { PublicHomeViewModel } from '../contracts/public-site'
import type { PublicPublicationListViewModel } from '../contracts/public-content'
export function publicHomePublicationPage(home: PublicHomeViewModel): PublicPublicationListViewModel {
  const path = `/${home.locale}/publications/featured`
  return { schemaVersion: 1, locale: home.locale, module: 'publications', generatedAt: home.generatedAt,
    revision: home.publicationRevision, totalPublic: home.counts.publications, items: home.publications,
    meta: { title: home.locale === 'zh' ? '精选论文' : 'Featured publications', description: '', path, alternatePath: `/${home.locale === 'zh' ? 'en' : 'zh'}/publications/featured`, breadcrumbs: [], image: null, type: 'website' },
    query: { search: null, filters: { featured: '1' } }, filters: [],
    pagination: { page: 1, pageSize: 24, totalItems: home.publications.length, totalPages: home.publications.length ? 1 : 0, from: home.publications.length ? 1 : 0, to: home.publications.length, previousPage: null, nextPage: null },
  }
}
