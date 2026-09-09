import { useRuntimeConfig } from '#imports'
import type { H3Event } from 'h3'
import { PublicHomeService } from '../services/public/public-home-service'
import { PublicShellService } from '../services/public/public-shell-service'
import { PublicCoursesService } from '../services/public/modules/courses'
import { PublicNewsService } from '../services/public/modules/news'
import { PublicPatentsService } from '../services/public/modules/patents'
import { PublicProjectsService } from '../services/public/modules/projects'
import { PublicPublicationsService } from '../services/public/modules/publications'
import { PublicResearchService } from '../services/public/modules/research'
import { PublicStudentsService } from '../services/public/modules/students'
import { PublicTeamService } from '../services/public/modules/team'
import { useCacheRuntime } from './cache-runtime'
import { useDatabase } from './database'
import { useTranslationReader } from './i18n-runtime'
import { useMediaRuntime } from './media-runtime'

export interface PublicRuntime {
  home: PublicHomeService
  shell: PublicShellService
  team: PublicTeamService
  publications: PublicPublicationsService
  projects: PublicProjectsService
  patents: PublicPatentsService
  students: PublicStudentsService
  research: PublicResearchService
  news: PublicNewsService
  courses: PublicCoursesService
}

export function usePublicRuntime(event: H3Event): PublicRuntime {
  if (event.context.publicRuntime) return event.context.publicRuntime
  const config = useRuntimeConfig(event) as unknown as { public: { siteName: string } }
  const adapter = useDatabase(event).adapter
  const translations = useTranslationReader(event)
  const media = useMediaRuntime(event)
  const cache = useCacheRuntime(event).publicCache
  const grant = media.config.publicGrantSeconds
  const runtime: PublicRuntime = {
    home: new PublicHomeService(adapter, translations, media.service, cache, {
      defaultSiteName: String(config.public.siteName), publicMediaGrantSeconds: grant,
    }),
    shell: new PublicShellService(adapter, translations, media.service, cache, {
      defaultSiteName: String(config.public.siteName), publicMediaGrantSeconds: grant,
    }),
    team: new PublicTeamService(adapter, translations, media.service, cache, grant),
    publications: new PublicPublicationsService(adapter, translations, media.service, cache, grant),
    projects: new PublicProjectsService(adapter, translations, media.service, cache, grant),
    patents: new PublicPatentsService(adapter, translations, media.service, cache, grant),
    students: new PublicStudentsService(adapter, translations, media.service, cache, grant),
    research: new PublicResearchService(adapter, translations, media.service, cache, grant),
    news: new PublicNewsService(adapter, translations, media.service, cache, grant),
    courses: new PublicCoursesService(adapter, translations, media.service, cache, grant),
  }
  event.context.publicRuntime = runtime
  return runtime
}
